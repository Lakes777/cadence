import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../banco/prisma.service.js';
import { NegociosService } from '../catalogo/negocios.service.js';
import type { Periodo } from '../catalogo/catalogo.dto.js';
import { RELOGIO, type Relogio } from '../comum/relogio.js';
import { CONFIG, type Config } from '../config/config.js';
import { RESERVAS_POR_VISITANTE } from '../demo/demo.js';
import { DisponibilidadeService } from '../disponibilidade/disponibilidade.service.js';
import { dataLocal } from '../disponibilidade/fuso.js';
import { Prisma } from '../generated/prisma/client.js';
import { FilaDeLembretes } from '../lembretes/fila.js';
import { momentoDoLembrete } from '../lembretes/lembrete.js';
import { TempoReal } from '../tempo-real/tempo-real.js';
import {
  FORMATO_DA_CHAVE,
  type Minhas,
  type NovaReserva,
} from './reservas.dto.js';
import {
  INCLUIR,
  itemDaAgenda,
  reservaResposta,
  type ItemDaAgenda,
  type ReservaResposta,
} from './respostas.js';

/** O cliente cancela sozinho até 2 h antes; depois disso, só o estabelecimento */
export const ANTECEDENCIA_DO_CANCELAMENTO_MIN = 120;

const INDISPONIVEL =
  'Este horário não está disponível (pode ter acabado de ser reservado); escolha outro';

const UM_ANO_MS = 366 * 24 * 60 * 60_000;
const LIMITE_DA_AGENDA = 1000;
/** As do cliente: as 100 próximas (ou as 100 últimas) bastam para a tela */
const LIMITE_DAS_MINHAS = 100;

export interface ReservaCriada {
  reserva: ReservaResposta;
  /** false quando o pedido repetiu uma Idempotency-Key já usada (devolve a mesma reserva) */
  nova: boolean;
}

@Injectable()
export class ReservasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disponibilidade: DisponibilidadeService,
    private readonly negocios: NegociosService,
    private readonly fila: FilaDeLembretes,
    private readonly tempoReal: TempoReal,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /**
   * Reserva o horário pedido, se ele for um dos que a disponibilidade ofereceria agora.
   * A conferência no código evita o óbvio; quem garante que não há reserva dupla é a
   * restrição de exclusão do banco, que vale mesmo para pedidos no mesmo milissegundo.
   */
  async criar(
    slug: string,
    clienteId: string,
    chave: string | undefined,
    pedido: NovaReserva,
  ): Promise<ReservaCriada> {
    if (!chave || !FORMATO_DA_CHAVE.test(chave)) {
      throw new BadRequestException(
        'Envie o cabeçalho Idempotency-Key (8 a 100 letras, números, _ ou -), ex.: um UUID',
      );
    }
    const hashDoPedido = hashDo(slug, pedido);
    const repetida = await this.pelaChave(clienteId, chave, hashDoPedido);
    if (repetida) return { reserva: repetida, nova: false };
    if (this.config.CADENCE_DEMO) await this.conferirLimiteDaDemo(clienteId);

    const { negocio, servico } = await this.disponibilidade.negocioEServico(
      slug,
      pedido.servicoId,
    );
    const horarios = await this.disponibilidade.horariosDoDia(
      negocio,
      servico,
      dataLocal(pedido.inicio, negocio.fuso),
      pedido.profissionalId,
    );
    const horario = horarios.find(
      (h) => h.inicio.getTime() === pedido.inicio.getTime(),
    );
    if (!horario)
      return this.repetidaOuIndisponivel(clienteId, chave, hashDoPedido);

    const lembreteEm = momentoDoLembrete(horario.inicio, this.relogio.agora());
    // Sem profissional escolhido, tenta cada um que estava livre: se dois clientes disputam o
    // mesmo horário e há dois profissionais, os dois conseguem
    for (const profissionalId of horario.profissionalIds) {
      try {
        const reserva = await this.prisma.reserva.create({
          data: {
            negocioId: negocio.id,
            profissionalId,
            servicoId: servico.id,
            clienteId,
            inicio: horario.inicio,
            fim: horario.fim,
            precoCentavos: servico.precoCentavos,
            chaveIdempotencia: chave,
            hashDoPedido,
            lembreteEm,
          },
          include: INCLUIR,
        });
        // Depois de gravar: a reserva vale mesmo se o Redis estiver fora do ar
        if (lembreteEm) await this.fila.agendar(reserva.id, lembreteEm);
        const resposta = reservaResposta(reserva);
        this.avisarMudanca(reserva.clienteId, resposta);
        return { reserva: resposta, nova: true };
      } catch (erro) {
        // A conta sumiu com um token de acesso ainda válido: na demonstração, a reposição
        // apaga os visitantes. Entrar de novo resolve; sem isso, seria um 500. Outra chave
        // quebrada (catálogo apagado no meio) não é problema de sessão e segue como erro
        if (
          violou(erro, '23503') &&
          !(await this.prisma.usuario.count({ where: { id: clienteId } }))
        ) {
          throw new UnauthorizedException('Sessão encerrada; entre de novo');
        }
        if (!violou(erro, '23P01') && !violou(erro, '23505')) throw erro;
        // O mesmo pedido (mesma chave) chegou duas vezes ao mesmo tempo: a cópia que perdeu
        // esbarra na chave única ou, antes dela, na própria reserva que a outra acabou de criar
        const mesma = await this.pelaChave(clienteId, chave, hashDoPedido);
        if (mesma) return { reserva: mesma, nova: false };
        if (violou(erro, '23505')) throw erro;
        // Outro cliente chegou antes neste profissional: tenta o próximo
      }
    }
    return this.repetidaOuIndisponivel(clienteId, chave, hashDoPedido);
  }

  /**
   * Antes de responder "indisponível", confere se quem ocupou o horário não foi uma cópia
   * deste mesmo pedido (clique duplo) que gravou entre a primeira consulta e agora.
   */
  private async repetidaOuIndisponivel(
    clienteId: string,
    chave: string,
    hashDoPedido: string,
  ): Promise<ReservaCriada> {
    const mesma = await this.pelaChave(clienteId, chave, hashDoPedido);
    if (mesma) return { reserva: mesma, nova: false };
    throw new ConflictException(INDISPONIVEL);
  }

  /** As reservas de quem está logado, como cliente */
  async minhas(
    clienteId: string,
    { periodo }: Minhas,
  ): Promise<ReservaResposta[]> {
    const agora = this.relogio.agora();
    const reservas = await this.prisma.reserva.findMany({
      where: {
        clienteId,
        fim: periodo === 'proximas' ? { gt: agora } : { lte: agora },
      },
      orderBy: { inicio: periodo === 'proximas' ? 'asc' : 'desc' },
      take: LIMITE_DAS_MINHAS,
      include: INCLUIR,
    });
    return reservas.map(reservaResposta);
  }

  /** A agenda do negócio para o dono, com quem reservou (inclui as canceladas) */
  async agenda(
    negocioId: string,
    donoId: string,
    periodo: Periodo,
  ): Promise<ItemDaAgenda[]> {
    await this.negocios.doDono(negocioId, donoId);
    const de =
      periodo.de ??
      (periodo.ate
        ? new Date(periodo.ate.getTime() - UM_ANO_MS)
        : this.relogio.agora());
    const ate = periodo.ate ?? new Date(de.getTime() + UM_ANO_MS);
    const reservas = await this.prisma.reserva.findMany({
      where: { negocioId, inicio: { lt: ate }, fim: { gt: de } },
      orderBy: { inicio: 'asc' },
      take: LIMITE_DA_AGENDA + 1,
      include: { ...INCLUIR, cliente: { select: { nome: true, email: true } } },
    });
    // Cortar calado esconderia reservas do dono: melhor pedir um período menor
    if (reservas.length > LIMITE_DA_AGENDA) {
      throw new BadRequestException(
        `Mais de ${LIMITE_DA_AGENDA} reservas no período; peça um período menor (de/ate)`,
      );
    }
    return reservas.map(itemDaAgenda);
  }

  /**
   * Cancela: o cliente até 2 h antes, o dono do negócio a qualquer momento antes do início.
   * Quem não é nenhum dos dois recebe 404, como se a reserva não existisse.
   */
  async cancelar(
    reservaId: string,
    usuarioId: string,
  ): Promise<ReservaResposta> {
    const reserva = await this.prisma.reserva.findUnique({
      where: { id: reservaId },
      include: {
        ...INCLUIR,
        negocio: { select: { ...INCLUIR.negocio.select, donoId: true } },
      },
    });
    const ehCliente = reserva?.clienteId === usuarioId;
    const ehDono = reserva?.negocio.donoId === usuarioId;
    if (!reserva || (!ehCliente && !ehDono)) {
      throw new NotFoundException('Reserva não encontrada');
    }
    if (reserva.status === 'cancelada') return reservaResposta(reserva);

    const agora = this.relogio.agora();
    if (reserva.inicio <= agora) {
      throw new UnprocessableEntityException(
        'O atendimento já começou ou passou; não dá mais para cancelar',
      );
    }
    const minutosAteOInicio =
      (reserva.inicio.getTime() - agora.getTime()) / 60_000;
    if (!ehDono && minutosAteOInicio < ANTECEDENCIA_DO_CANCELAMENTO_MIN) {
      throw new UnprocessableEntityException(
        'Pela internet, só dá para cancelar até 2 h antes; fale com o estabelecimento',
      );
    }
    // Só muda se ainda estiver confirmada (dois cancelamentos juntos não brigam)
    const { count } = await this.prisma.reserva.updateMany({
      where: { id: reserva.id, status: 'confirmada' },
      data: { status: 'cancelada', canceladaEm: agora },
    });
    const resposta = reservaResposta(
      await this.prisma.reserva.findUniqueOrThrow({
        where: { id: reserva.id },
        include: INCLUIR,
      }),
    );
    if (count === 1) {
      await this.fila.desagendar(reserva.id);
      this.avisarMudanca(reserva.clienteId, resposta);
    }
    return resposta;
  }

  /**
   * Na demonstração, cada visitante tem poucas reservas futuras: sem isso, um script com
   * várias contas de visitante ocuparia a agenda inteira para todo mundo até a reposição.
   * Dois pedidos ao mesmo tempo podem passar um a mais; o teto continua pequeno.
   */
  private async conferirLimiteDaDemo(clienteId: string): Promise<void> {
    const futuras = await this.prisma.reserva.count({
      where: {
        clienteId,
        status: 'confirmada',
        inicio: { gt: this.relogio.agora() },
      },
    });
    if (futuras >= RESERVAS_POR_VISITANTE) {
      throw new UnprocessableEntityException(
        `Na demonstração, cada visitante tem até ${RESERVAS_POR_VISITANTE} reservas futuras; cancele uma para reservar outra`,
      );
    }
  }

  /**
   * Quem está olhando os horários do dia vê o horário sumir (ou voltar) sem recarregar, e o
   * cliente fica sabendo em todas as abas (inclusive quando quem cancelou foi o estabelecimento)
   */
  private avisarMudanca(clienteId: string, reserva: ReservaResposta): void {
    this.tempoReal.horariosMudaram(
      reserva.negocio,
      new Date(reserva.inicio),
      new Date(reserva.fim),
    );
    this.tempoReal.paraUsuario(clienteId, { tipo: 'reserva', reserva });
  }

  /**
   * A reserva já criada com esta chave por este cliente, se houver. A mesma chave com outro
   * pedido é engano de quem chamou (422), não uma repetição.
   */
  private async pelaChave(
    clienteId: string,
    chave: string,
    hashDoPedido: string,
  ): Promise<ReservaResposta | undefined> {
    const existente = await this.prisma.reserva.findUnique({
      where: {
        clienteId_chaveIdempotencia: { clienteId, chaveIdempotencia: chave },
      },
      include: INCLUIR,
    });
    if (!existente) return undefined;
    if (existente.hashDoPedido !== hashDoPedido) {
      throw new UnprocessableEntityException(
        'Esta Idempotency-Key já foi usada com outro pedido; gere uma nova',
      );
    }
    return reservaResposta(existente);
  }
}

function hashDo(slug: string, pedido: NovaReserva): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        slug,
        pedido.servicoId,
        pedido.profissionalId ?? null,
        pedido.inicio.toISOString(),
      ]),
    )
    .digest('base64url');
}

/** O erro veio do Postgres com este código? (23P01 = exclusão, 23505 = única, 23503 = chave estrangeira) */
function violou(erro: unknown, codigo: string): boolean {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const meta = erro.meta as
    { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
  return meta?.driverAdapterError?.cause?.originalCode === codigo;
}
