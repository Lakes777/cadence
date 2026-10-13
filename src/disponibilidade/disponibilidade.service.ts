import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../banco/prisma.service.js';
import { RELOGIO, type Relogio } from '../comum/relogio.js';
import type { Negocio, Servico } from '../generated/prisma/client.js';
import {
  calcularDia,
  calcularHorarios,
  type Entrada,
  type HorarioLivre,
} from './calculo.js';
import type { Consulta } from './disponibilidade.dto.js';
import {
  dataLocal,
  diaDaSemana,
  diasEntre,
  localParaUtcOuDepois,
  textoDaData,
  type DataLocal,
} from './fuso.js';

/** Quanto antes é preciso reservar: ninguém marca para daqui a 5 minutos */
export const ANTECEDENCIA_MIN = 30;
/** Até quantos dias à frente a agenda abre */
export const JANELA_DIAS = 60;

const DIA_MS = 24 * 60 * 60_000;

export interface DisponibilidadeResposta {
  data: string;
  fuso: string;
  servico: { id: string; nome: string; duracaoMin: number };
  horarios: {
    inicio: string;
    fim: string;
    hora: string;
    profissionalIds: string[];
  }[];
  /** Horários que existiriam sem as reservas e que ninguém pode mais atender */
  ocupados: { inicio: string; fim: string; hora: string }[];
}

@Injectable()
export class DisponibilidadeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RELOGIO) private readonly relogio: Relogio,
  ) {}

  async consultar(
    slug: string,
    { servicoId, data, profissionalId }: Consulta,
  ): Promise<DisponibilidadeResposta> {
    const { negocio, servico } = await this.negocioEServico(slug, servicoId);
    const entrada = await this.entradaDoDia(
      negocio,
      servico,
      data,
      profissionalId,
    );
    const { livres, ocupados } = entrada
      ? calcularDia(entrada)
      : { livres: [], ocupados: [] };
    return {
      data: textoDaData(data),
      fuso: negocio.fuso,
      servico: {
        id: servico.id,
        nome: servico.nome,
        duracaoMin: servico.duracaoMin,
      },
      horarios: livres.map((h) => ({
        inicio: h.inicio.toISOString(),
        fim: h.fim.toISOString(),
        hora: h.hora,
        profissionalIds: [...h.profissionalIds].sort(),
      })),
      ocupados: ocupados.map((h) => ({
        inicio: h.inicio.toISOString(),
        fim: h.fim.toISOString(),
        hora: h.hora,
      })),
    };
  }

  /** O negócio pelo endereço e um serviço ativo dele (404 se algum não existir). */
  async negocioEServico(
    slug: string,
    servicoId: string,
  ): Promise<{ negocio: Negocio; servico: Servico }> {
    const negocio = await this.prisma.negocio.findUnique({ where: { slug } });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');
    const servico = await this.prisma.servico.findFirst({
      where: { id: servicoId, negocioId: negocio.id, ativo: true },
    });
    if (!servico) throw new NotFoundException('Serviço não encontrado');
    return { negocio, servico };
  }

  /**
   * Os horários livres do dia (data local no fuso do negócio), já descontando bloqueios e
   * reservas confirmadas. É a mesma conta que a reserva usa para conferir o horário pedido.
   */
  async horariosDoDia(
    negocio: Negocio,
    servico: Servico,
    data: DataLocal,
    profissionalId?: string,
  ): Promise<HorarioLivre[]> {
    const entrada = await this.entradaDoDia(
      negocio,
      servico,
      data,
      profissionalId,
    );
    return entrada ? calcularHorarios(entrada) : [];
  }

  /** Tudo o que o cálculo do dia precisa (null quando não há o que oferecer) */
  private async entradaDoDia(
    negocio: Negocio,
    servico: Servico,
    data: DataLocal,
    profissionalId?: string,
  ): Promise<Entrada | null> {
    const agora = this.relogio.agora();
    const distancia = diasEntre(dataLocal(agora, negocio.fuso), data);
    if (distancia > JANELA_DIAS) {
      throw new BadRequestException(
        `A agenda abre só ${JANELA_DIAS} dias à frente`,
      );
    }
    if (distancia < 0) return null; // dia que já passou

    const profissionais = await this.prisma.profissional.findMany({
      where: {
        negocioId: negocio.id,
        ativo: true,
        servicos: { some: { servicoId: servico.id } },
        ...(profissionalId ? { id: profissionalId } : {}),
      },
      select: {
        id: true,
        horarios: {
          where: { diaDaSemana: diaDaSemana(data) },
          select: { inicioMin: true, fimMin: true },
        },
      },
    });
    if (!profissionais.length) return null;
    const ids = profissionais.map((p) => p.id);

    // Tudo que pode tocar o dia: da meia-noite local até a seguinte, com folga de um dia
    // para os lados (fuso e horário de verão não deixam a conta exata valer a pena).
    // Em Santiago, no dia da mudança, a meia-noite não existe: vale o pulo.
    const comeco = localParaUtcOuDepois(data, 0, negocio.fuso);
    const de = new Date(comeco.getTime() - DIA_MS);
    const ate = new Date(comeco.getTime() + 2 * DIA_MS);
    const [bloqueios, ocupados] = await Promise.all([
      this.prisma.bloqueio.findMany({
        where: {
          negocioId: negocio.id,
          inicio: { lt: ate },
          fim: { gt: de },
          OR: [{ profissionalId: null }, { profissionalId: { in: ids } }],
        },
        select: { profissionalId: true, inicio: true, fim: true },
      }),
      this.prisma.reserva.findMany({
        where: {
          profissionalId: { in: ids },
          status: 'confirmada',
          inicio: { lt: ate },
          fim: { gt: de },
        },
        select: { profissionalId: true, inicio: true, fim: true },
      }),
    ]);

    return {
      data,
      fuso: negocio.fuso,
      duracaoMin: servico.duracaoMin,
      profissionais: profissionais.map((p) => ({
        id: p.id,
        intervalos: p.horarios,
      })),
      bloqueios,
      ocupados,
      aPartirDe: new Date(agora.getTime() + ANTECEDENCIA_MIN * 60_000),
    };
  }
}
