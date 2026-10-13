import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../banco/prisma.service.js';
import { TempoReal } from '../tempo-real/tempo-real.js';
import { UM_ANO_MS, type NovoBloqueio, type Periodo } from './catalogo.dto.js';
import { NegociosService } from './negocios.service.js';
import { ProfissionaisService } from './profissionais.service.js';
import { bloqueioResposta, type BloqueioResposta } from './respostas.js';

/** Teto da listagem (documentado no README): um ano de folgas cabe folgado */
const LIMITE_DA_LISTA = 500;

@Injectable()
export class BloqueiosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly negocios: NegociosService,
    private readonly profissionais: ProfissionaisService,
    private readonly tempoReal: TempoReal,
  ) {}

  /**
   * Os bloqueios que tocam o período, que vale no máximo um ano. Sem nada: o próximo ano. Só com
   * `de`: um ano a partir dele. Só com `ate`: o ano que termina nele.
   */
  async listar(
    negocioId: string,
    donoId: string,
    periodo: Periodo,
  ): Promise<BloqueioResposta[]> {
    await this.negocios.doDono(negocioId, donoId);
    const de =
      periodo.de ??
      (periodo.ate ? new Date(periodo.ate.getTime() - UM_ANO_MS) : new Date());
    const ate = periodo.ate ?? new Date(de.getTime() + UM_ANO_MS);
    const bloqueios = await this.prisma.bloqueio.findMany({
      where: {
        negocioId,
        fim: { gt: de },
        inicio: { lt: ate },
      },
      orderBy: { inicio: 'asc' },
      take: LIMITE_DA_LISTA,
    });
    return bloqueios.map(bloqueioResposta);
  }

  async criar(
    negocioId: string,
    donoId: string,
    dados: NovoBloqueio,
  ): Promise<BloqueioResposta> {
    const negocio = await this.negocios.doDono(negocioId, donoId);
    if (dados.profissionalId) {
      await this.profissionais.doNegocio(
        negocioId,
        donoId,
        dados.profissionalId,
      );
    }
    const bloqueio = await this.prisma.bloqueio.create({
      data: {
        negocioId,
        profissionalId: dados.profissionalId ?? null,
        inicio: dados.inicio,
        fim: dados.fim,
        motivo: dados.motivo || null,
      },
    });
    this.tempoReal.horariosMudaram(negocio, bloqueio.inicio, bloqueio.fim);
    return bloqueioResposta(bloqueio);
  }

  async remover(
    negocioId: string,
    donoId: string,
    bloqueioId: string,
  ): Promise<void> {
    const negocio = await this.negocios.doDono(negocioId, donoId);
    const bloqueio = await this.prisma.bloqueio.findFirst({
      where: { id: bloqueioId, negocioId },
    });
    const { count } = await this.prisma.bloqueio.deleteMany({
      where: { id: bloqueioId, negocioId },
    });
    if (!bloqueio || !count) {
      throw new NotFoundException('Bloqueio não encontrado');
    }
    this.tempoReal.horariosMudaram(negocio, bloqueio.inicio, bloqueio.fim);
  }
}
