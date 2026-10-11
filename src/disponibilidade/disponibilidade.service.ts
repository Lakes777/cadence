import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../banco/prisma.service.js';
import { RELOGIO, type Relogio } from '../comum/relogio.js';
import { calcularHorarios } from './calculo.js';
import type { Consulta } from './disponibilidade.dto.js';
import {
  dataLocal,
  diaDaSemana,
  diasEntre,
  localParaUtcOuDepois,
  textoDaData,
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
    const negocio = await this.prisma.negocio.findUnique({ where: { slug } });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');
    const servico = await this.prisma.servico.findFirst({
      where: { id: servicoId, negocioId: negocio.id, ativo: true },
    });
    if (!servico) throw new NotFoundException('Serviço não encontrado');

    const agora = this.relogio.agora();
    const distancia = diasEntre(dataLocal(agora, negocio.fuso), data);
    if (distancia > JANELA_DIAS) {
      throw new BadRequestException(
        `A agenda abre só ${JANELA_DIAS} dias à frente`,
      );
    }
    const resposta: DisponibilidadeResposta = {
      data: textoDaData(data),
      fuso: negocio.fuso,
      servico: {
        id: servico.id,
        nome: servico.nome,
        duracaoMin: servico.duracaoMin,
      },
      horarios: [],
    };
    if (distancia < 0) return resposta; // dia que já passou

    const dia = diaDaSemana(data);
    const profissionais = await this.prisma.profissional.findMany({
      where: {
        negocioId: negocio.id,
        ativo: true,
        servicos: { some: { servicoId } },
        ...(profissionalId ? { id: profissionalId } : {}),
      },
      select: {
        id: true,
        horarios: {
          where: { diaDaSemana: dia },
          select: { inicioMin: true, fimMin: true },
        },
      },
    });
    if (!profissionais.length) return resposta;

    // Tudo que pode tocar o dia: da meia-noite local até a seguinte, com folga de um dia
    // para os lados (fuso e horário de verão não deixam a conta exata valer a pena)
    // (em Santiago, no dia da mudança, a meia-noite não existe: vale o pulo)
    const comeco = localParaUtcOuDepois(data, 0, negocio.fuso);
    const janela = {
      de: new Date(comeco.getTime() - DIA_MS),
      ate: new Date(comeco.getTime() + 2 * DIA_MS),
    };
    const bloqueios = await this.prisma.bloqueio.findMany({
      where: {
        negocioId: negocio.id,
        inicio: { lt: janela.ate },
        fim: { gt: janela.de },
        OR: [
          { profissionalId: null },
          { profissionalId: { in: profissionais.map((p) => p.id) } },
        ],
      },
      select: { profissionalId: true, inicio: true, fim: true },
    });

    resposta.horarios = calcularHorarios({
      data,
      fuso: negocio.fuso,
      duracaoMin: servico.duracaoMin,
      profissionais: profissionais.map((p) => ({
        id: p.id,
        intervalos: p.horarios,
      })),
      bloqueios,
      ocupados: [], // reservas: fase 5
      aPartirDe: new Date(agora.getTime() + ANTECEDENCIA_MIN * 60_000),
    }).map((h) => ({
      inicio: h.inicio.toISOString(),
      fim: h.fim.toISOString(),
      hora: h.hora,
      profissionalIds: h.profissionalIds.sort(),
    }));
    return resposta;
  }
}
