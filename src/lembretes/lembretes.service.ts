import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../banco/prisma.service.js';
import { RELOGIO, type Relogio } from '../comum/relogio.js';
import { TempoReal } from '../tempo-real/tempo-real.js';
import { HORAS_DE_ANTECEDENCIA, textoDoLembrete } from './lembrete.js';

/** O que aconteceu com uma tentativa de enviar o lembrete */
export type Envio = 'enviado' | 'repetido' | 'dispensado';

/** Quanto a conferência espera depois do horário antes de assumir que a fila perdeu o lembrete */
export const FOLGA_DA_CONFERENCIA_MS = 2 * 60_000;
const LOTE_DA_CONFERENCIA = 500;
const LIMITE_DOS_AVISOS = 50;

export interface AvisoResposta {
  id: string;
  tipo: 'lembrete';
  texto: string;
  reservaId: string;
  /** O lembrete pode ter saído antes de a reserva ser cancelada */
  reservaCancelada: boolean;
  criadoEm: string;
  lidoEm: string | null;
}

@Injectable()
export class LembretesService {
  private readonly logger = new Logger(LembretesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    private readonly tempoReal: TempoReal,
  ) {}

  /**
   * Grava o lembrete da reserva para o cliente. A fila entrega cada tarefa pelo menos uma vez
   * (e a conferência pode chegar junto), então repetir não pode gerar um segundo aviso: quem
   * garante isso é a chave única (reserva, tipo) do banco.
   */
  async enviar(reservaId: string): Promise<Envio> {
    const envio = await this.gravar(reservaId);
    // O aviso já está gravado (aparece em GET /avisos); falhar aqui não pode repetir a tarefa
    if (envio === 'enviado') {
      await this.mostrarNaHora(reservaId).catch((erro: Error) =>
        this.logger.warn(
          `Aviso da reserva ${reservaId} fora do tempo real: ${erro.message}`,
        ),
      );
    }
    return envio;
  }

  private async gravar(reservaId: string): Promise<Envio> {
    return this.prisma.$transaction(async (tx) => {
      // Trava a reserva: um cancelamento ao mesmo tempo espera este envio terminar (ou o
      // envio espera o cancelamento e desiste), nunca um lembrete de reserva já cancelada
      await tx.$queryRaw`SELECT 1 FROM reservas WHERE id = ${reservaId}::uuid FOR SHARE`;
      const reserva = await tx.reserva.findUnique({
        where: { id: reservaId },
        include: {
          servico: { select: { nome: true } },
          profissional: { select: { nome: true } },
          negocio: { select: { nome: true, fuso: true } },
        },
      });
      if (
        !reserva ||
        reserva.status !== 'confirmada' ||
        reserva.inicio <= this.relogio.agora()
      ) {
        return 'dispensado';
      }
      const { count } = await tx.aviso.createMany({
        data: {
          usuarioId: reserva.clienteId,
          reservaId: reserva.id,
          tipo: 'lembrete',
          texto: textoDoLembrete({
            servico: reserva.servico.nome,
            profissional: reserva.profissional.nome,
            negocio: reserva.negocio.nome,
            fuso: reserva.negocio.fuso,
            inicio: reserva.inicio,
          }),
        },
        skipDuplicates: true,
      });
      return count === 1 ? 'enviado' : 'repetido';
    });
  }

  /** Depois de gravado (fora da transação): quem está com a página aberta vê o aviso chegar */
  private async mostrarNaHora(reservaId: string): Promise<void> {
    const aviso = await this.prisma.aviso.findUnique({
      where: { reservaId_tipo: { reservaId, tipo: 'lembrete' } },
      include: COM_STATUS,
    });
    if (aviso) {
      this.tempoReal.paraUsuario(aviso.usuarioId, {
        tipo: 'aviso',
        aviso: avisoResposta(aviso),
      });
    }
  }

  /**
   * Reservas cujo lembrete já devia ter saído e não saiu (o Redis estava fora do ar quando a
   * reserva foi feita, ou perdeu a tarefa). Ainda vale enviar se o atendimento não começou.
   */
  async atrasados(): Promise<string[]> {
    const agora = this.relogio.agora();
    const reservas = await this.prisma.reserva.findMany({
      where: {
        status: 'confirmada',
        // inicio = lembreteEm + 24 h: a faixa de 24 h deixa o índice ler só os candidatos,
        // em vez de todas as reservas antigas
        lembreteEm: {
          gt: new Date(agora.getTime() - HORAS_DE_ANTECEDENCIA * 60 * 60_000),
          lte: new Date(agora.getTime() - FOLGA_DA_CONFERENCIA_MS),
        },
        inicio: { gt: agora },
        avisos: { none: { tipo: 'lembrete' } },
      },
      select: { id: true },
      orderBy: { lembreteEm: 'asc' },
      take: LOTE_DA_CONFERENCIA,
    });
    return reservas.map((r) => r.id);
  }

  /** Os avisos mais recentes de quem está logado */
  async avisos(usuarioId: string): Promise<AvisoResposta[]> {
    const avisos = await this.prisma.aviso.findMany({
      where: { usuarioId },
      orderBy: { criadoEm: 'desc' },
      take: LIMITE_DOS_AVISOS,
      include: COM_STATUS,
    });
    return avisos.map(avisoResposta);
  }

  /** Marca como lido (repetir não muda a data); aviso de outra pessoa é 404 */
  async marcarLido(avisoId: string, usuarioId: string): Promise<AvisoResposta> {
    await this.prisma.aviso.updateMany({
      where: { id: avisoId, usuarioId, lidoEm: null },
      data: { lidoEm: this.relogio.agora() },
    });
    const aviso = await this.prisma.aviso.findFirst({
      where: { id: avisoId, usuarioId },
      include: COM_STATUS,
    });
    if (!aviso) throw new NotFoundException('Aviso não encontrado');
    return avisoResposta(aviso);
  }
}

const COM_STATUS = { reserva: { select: { status: true } } } as const;

function avisoResposta(a: {
  id: string;
  tipo: 'lembrete';
  texto: string;
  reservaId: string;
  criadoEm: Date;
  lidoEm: Date | null;
  reserva: { status: 'confirmada' | 'cancelada' };
}): AvisoResposta {
  return {
    id: a.id,
    tipo: a.tipo,
    texto: a.texto,
    reservaId: a.reservaId,
    reservaCancelada: a.reserva.status === 'cancelada',
    criadoEm: a.criadoEm.toISOString(),
    lidoEm: a.lidoEm?.toISOString() ?? null,
  };
}
