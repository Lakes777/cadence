import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../banco/prisma.service.js';
import type {
  Horarios,
  MudancaProfissional,
  NovoProfissional,
  ServicosDoProfissional,
} from './catalogo.dto.js';
import { NegociosService } from './negocios.service.js';
import {
  profissionalResposta,
  type ProfissionalResposta,
} from './respostas.js';

const COMPLETO = { servicos: true, horarios: true } as const;

@Injectable()
export class ProfissionaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly negocios: NegociosService,
  ) {}

  async listar(
    negocioId: string,
    donoId: string,
  ): Promise<ProfissionalResposta[]> {
    await this.negocios.doDono(negocioId, donoId);
    const profissionais = await this.prisma.profissional.findMany({
      where: { negocioId },
      orderBy: { criadoEm: 'asc' },
      include: COMPLETO,
    });
    return profissionais.map(profissionalResposta);
  }

  async criar(
    negocioId: string,
    donoId: string,
    dados: NovoProfissional,
  ): Promise<ProfissionalResposta> {
    await this.negocios.doDono(negocioId, donoId);
    return profissionalResposta(
      await this.prisma.profissional.create({
        data: { negocioId, nome: dados.nome },
        include: COMPLETO,
      }),
    );
  }

  async atualizar(
    negocioId: string,
    donoId: string,
    profissionalId: string,
    dados: MudancaProfissional,
  ): Promise<ProfissionalResposta> {
    await this.doNegocio(negocioId, donoId, profissionalId);
    return profissionalResposta(
      await this.prisma.profissional.update({
        where: { id: profissionalId },
        data: dados,
        include: COMPLETO,
      }),
    );
  }

  /** Troca a lista inteira de serviços que o profissional faz. */
  async definirServicos(
    negocioId: string,
    donoId: string,
    profissionalId: string,
    { servicoIds }: ServicosDoProfissional,
  ): Promise<ProfissionalResposta> {
    await this.doNegocio(negocioId, donoId, profissionalId);
    // Só serviços deste negócio: senão daria para "pendurar" o serviço de outro dono aqui
    const doNegocio = await this.prisma.servico.count({
      where: { id: { in: servicoIds }, negocioId },
    });
    if (doNegocio !== servicoIds.length) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Dados inválidos',
        erros: [
          {
            campo: 'servicoIds',
            mensagem: 'Há serviço que não é deste negócio',
          },
        ],
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await trancar(tx, profissionalId);
      await tx.profissionalServico.deleteMany({ where: { profissionalId } });
      await tx.profissionalServico.createMany({
        data: servicoIds.map((servicoId) => ({
          profissionalId,
          servicoId,
          negocioId,
        })),
      });
    });
    return this.buscar(profissionalId);
  }

  /** Troca o horário semanal inteiro (a validação já garantiu que não há sobreposição). */
  async definirHorarios(
    negocioId: string,
    donoId: string,
    profissionalId: string,
    { horarios }: Horarios,
  ): Promise<ProfissionalResposta> {
    await this.doNegocio(negocioId, donoId, profissionalId);
    await this.prisma.$transaction(async (tx) => {
      await trancar(tx, profissionalId);
      await tx.horarioDeTrabalho.deleteMany({ where: { profissionalId } });
      await tx.horarioDeTrabalho.createMany({
        data: horarios.map((h) => ({ ...h, profissionalId })),
      });
    });
    return this.buscar(profissionalId);
  }

  /** Confere que o profissional é do negócio, e o negócio é do dono (404 nos dois casos). */
  async doNegocio(
    negocioId: string,
    donoId: string,
    profissionalId: string,
  ): Promise<void> {
    await this.negocios.doDono(negocioId, donoId);
    const existe = await this.prisma.profissional.count({
      where: { id: profissionalId, negocioId },
    });
    if (!existe) throw new NotFoundException('Profissional não encontrado');
  }

  private async buscar(profissionalId: string): Promise<ProfissionalResposta> {
    return profissionalResposta(
      await this.prisma.profissional.findUniqueOrThrow({
        where: { id: profissionalId },
        include: COMPLETO,
      }),
    );
  }
}

/**
 * Duas trocas ao mesmo tempo no mesmo profissional entram em fila: sem isso, as duas apagariam
 * a lista antiga e gravariam por cima uma da outra (e a restrição do banco daria erro 500).
 */
async function trancar(
  tx: Pick<PrismaService, '$queryRaw'>,
  profissionalId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM profissionais WHERE id = ${profissionalId}::uuid FOR UPDATE`;
}
