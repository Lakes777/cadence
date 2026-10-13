import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../banco/prisma.service.js';
import { CONFIG, type Config } from '../config/config.js';
import { SLUG_DA_DEMO } from '../demo/demo.js';
import { TempoReal } from '../tempo-real/tempo-real.js';
import { Prisma, type Negocio } from '../generated/prisma/client.js';
import type { MudancaNegocio, NovoNegocio } from './catalogo.dto.js';
import {
  negocioResposta,
  type NegocioResposta,
  type VitrineResposta,
} from './respostas.js';
import { gerarSlug } from './slug.js';

const SLUG_EM_USO = 'Este endereço já está em uso; escolha outro';
const FIXO_NA_DEMO =
  'Na demonstração, o endereço e o fuso da Barbearia Exemplo não mudam (os outros visitantes usam o mesmo negócio)';

@Injectable()
export class NegociosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tempoReal: TempoReal,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async criar(donoId: string, dados: NovoNegocio): Promise<NegocioResposta> {
    if (dados.slug) {
      return negocioResposta(await this.gravar(donoId, dados, dados.slug));
    }
    // Sem slug escolhido: vem do nome, com um sufixo se já existir outro igual
    const base = gerarSlug(dados.nome) || 'negocio';
    for (let tentativa = 0; ; tentativa++) {
      const slug =
        tentativa === 0
          ? base
          : // Cortar pode deixar um hífen no fim; dois seguidos o banco recusa
            `${base.slice(0, 55).replace(/-+$/, '')}-${randomBytes(2).toString('hex')}`;
      try {
        return negocioResposta(await this.gravar(donoId, dados, slug));
      } catch (erro) {
        if (!(erro instanceof ConflictException) || tentativa >= 3) throw erro;
      }
    }
  }

  async meus(donoId: string): Promise<NegocioResposta[]> {
    const negocios = await this.prisma.negocio.findMany({
      where: { donoId },
      orderBy: { criadoEm: 'asc' },
    });
    return negocios.map(negocioResposta);
  }

  async atualizar(
    negocioId: string,
    donoId: string,
    dados: MudancaNegocio,
  ): Promise<NegocioResposta> {
    const antes = await this.doDono(negocioId, donoId);
    // O dono da demonstração é compartilhado: trocar o endereço tiraria a vitrine do ar para
    // todo mundo, e trocar o fuso mudaria todos os horários, até a próxima reposição. Mandar o
    // mesmo valor (um formulário que envia tudo) passa.
    if (
      this.config.CADENCE_DEMO &&
      antes.slug === SLUG_DA_DEMO &&
      ((dados.slug !== undefined && dados.slug !== antes.slug) ||
        (dados.fuso !== undefined && dados.fuso !== antes.fuso))
    ) {
      throw new ForbiddenException(FIXO_NA_DEMO);
    }
    let negocio: Negocio;
    try {
      negocio = await this.prisma.negocio.update({
        where: { id: negocioId },
        data: dados,
      });
    } catch (erro) {
      throw traduzirSlugRepetido(erro);
    }
    // O fuso muda os horários; quem olha pelo endereço antigo fica sabendo da troca de endereço
    this.tempoReal.catalogoMudou(antes.slug, negocio.slug);
    return negocioResposta(negocio);
  }

  /**
   * O negócio, se for de quem pediu. De outro dono responde igual a inexistente (404), para
   * não confirmar que o id existe.
   */
  async doDono(negocioId: string, donoId: string): Promise<Negocio> {
    const negocio = await this.prisma.negocio.findFirst({
      where: { id: negocioId, donoId },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');
    return negocio;
  }

  /** A vitrine pública: profissionais ativos e serviços ativos que alguém ativo faz. */
  async vitrine(slug: string): Promise<VitrineResposta> {
    const negocio = await this.prisma.negocio.findUnique({
      where: { slug },
      include: {
        profissionais: {
          where: { ativo: true },
          orderBy: { nome: 'asc' },
          include: { servicos: true },
        },
        servicos: { where: { ativo: true }, orderBy: { nome: 'asc' } },
      },
    });
    if (!negocio) throw new NotFoundException('Negócio não encontrado');
    const quemFaz = new Map<string, string[]>();
    for (const p of negocio.profissionais) {
      for (const { servicoId } of p.servicos) {
        quemFaz.set(servicoId, [...(quemFaz.get(servicoId) ?? []), p.id]);
      }
    }
    return {
      nome: negocio.nome,
      slug: negocio.slug,
      fuso: negocio.fuso,
      profissionais: negocio.profissionais.map(({ id, nome }) => ({
        id,
        nome,
      })),
      servicos: negocio.servicos
        .filter((s) => quemFaz.has(s.id))
        .map((s) => ({
          id: s.id,
          nome: s.nome,
          duracaoMin: s.duracaoMin,
          precoCentavos: s.precoCentavos,
          profissionalIds: quemFaz.get(s.id) ?? [],
        })),
    };
  }

  private async gravar(
    donoId: string,
    dados: NovoNegocio,
    slug: string,
  ): Promise<Negocio> {
    try {
      return await this.prisma.negocio.create({
        data: { donoId, nome: dados.nome, slug, fuso: dados.fuso },
      });
    } catch (erro) {
      throw traduzirSlugRepetido(erro);
    }
  }
}

function traduzirSlugRepetido(erro: unknown): unknown {
  return erro instanceof Prisma.PrismaClientKnownRequestError &&
    erro.code === 'P2002'
    ? new ConflictException(SLUG_EM_USO)
    : erro;
}
