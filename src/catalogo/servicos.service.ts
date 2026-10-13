import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../banco/prisma.service.js';
import { TempoReal } from '../tempo-real/tempo-real.js';
import type { MudancaServico, NovoServico } from './catalogo.dto.js';
import { NegociosService } from './negocios.service.js';
import { servicoResposta, type ServicoResposta } from './respostas.js';

@Injectable()
export class ServicosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly negocios: NegociosService,
    private readonly tempoReal: TempoReal,
  ) {}

  async listar(negocioId: string, donoId: string): Promise<ServicoResposta[]> {
    await this.negocios.doDono(negocioId, donoId);
    const servicos = await this.prisma.servico.findMany({
      where: { negocioId },
      orderBy: { criadoEm: 'asc' },
    });
    return servicos.map(servicoResposta);
  }

  async criar(
    negocioId: string,
    donoId: string,
    dados: NovoServico,
  ): Promise<ServicoResposta> {
    await this.negocios.doDono(negocioId, donoId);
    return servicoResposta(
      await this.prisma.servico.create({ data: { negocioId, ...dados } }),
    );
  }

  async atualizar(
    negocioId: string,
    donoId: string,
    servicoId: string,
    dados: MudancaServico,
  ): Promise<ServicoResposta> {
    const negocio = await this.negocios.doDono(negocioId, donoId);
    // updateMany com o negócio no filtro: o id de um serviço de outro negócio não muda nada
    const { count } = await this.prisma.servico.updateMany({
      where: { id: servicoId, negocioId },
      data: dados,
    });
    if (!count) throw new NotFoundException('Serviço não encontrado');
    // Duração e serviço ativo mudam os horários oferecidos
    this.tempoReal.catalogoMudou(negocio.slug);
    return servicoResposta(
      await this.prisma.servico.findUniqueOrThrow({ where: { id: servicoId } }),
    );
  }
}
