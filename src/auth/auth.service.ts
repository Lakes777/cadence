import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../banco/prisma.service.js';
import {
  ehDaDemo,
  emailDeVisitante,
  SENHA_DE_DEMONSTRACAO,
  SLUG_DA_DEMO,
} from '../demo/demo.js';
import {
  Prisma,
  type Papel,
  type Usuario,
} from '../generated/prisma/client.js';
import type { Cadastro, Login } from './auth.dto.js';
import { conferirSenha, gerarHashDeSenha } from './senha.js';
import {
  expiracaoDoTokenDeRenovacao,
  fimDaFamilia,
  hashDoToken,
  novoTokenDeRenovacao,
  SEGUNDOS_DE_TOLERANCIA,
} from './token-de-renovacao.js';
import type { Sessao, UsuarioPublico } from './usuario-do-token.js';

/** 15 min: curto porque não dá para revogar um token de acesso antes de ele vencer. */
export const SEGUNDOS_DO_TOKEN_DE_ACESSO = 15 * 60;

const CREDENCIAIS_ERRADAS = 'E-mail ou senha incorretos';
const RENOVACAO_INVALIDA = 'Sessão encerrada; entre de novo';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Hash de uma senha que ninguém sabe, para gastar o mesmo tempo quando o e-mail não existe */
  private hashFalso?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async cadastrar(dados: Cadastro): Promise<Sessao> {
    const senhaHash = await gerarHashDeSenha(dados.senha);
    try {
      const usuario = await this.prisma.usuario.create({
        data: {
          nome: dados.nome,
          email: dados.email,
          senhaHash,
          papel: dados.papel,
        },
      });
      return await this.abrirSessao(usuario);
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        throw new ConflictException('Já existe uma conta com este e-mail');
      }
      throw erro;
    }
  }

  async entrar({ email, senha }: Login): Promise<Sessao> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario) {
      // Sem isso, a resposta rápida entregaria quais e-mails têm conta
      this.hashFalso ??= gerarHashDeSenha(novoTokenDeRenovacao()).catch(
        (erro: unknown) => {
          // Não guarda a falha: o próximo login tenta gerar de novo
          this.hashFalso = undefined;
          throw erro;
        },
      );
      await conferirSenha(senha, await this.hashFalso);
      throw new UnauthorizedException(CREDENCIAIS_ERRADAS);
    }
    if (!(await conferirSenha(senha, usuario.senhaHash))) {
      throw new UnauthorizedException(CREDENCIAIS_ERRADAS);
    }
    return this.abrirSessao(usuario);
  }

  /**
   * Demonstração (o SoNaDemoGuard já barrou quem não está nela). O cliente ganha uma conta
   * nova a cada vez, para cada visitante ver só as próprias reservas; o dono é a conta
   * compartilhada da Barbearia Exemplo, criada pela semeadura.
   */
  async entrarComoVisitante(papel: Papel): Promise<Sessao> {
    if (papel === 'cliente') {
      const usuario = await this.prisma.usuario.create({
        data: {
          nome: 'Visitante',
          email: emailDeVisitante(randomUUID()),
          senhaHash: SENHA_DE_DEMONSTRACAO,
          papel: 'cliente',
        },
      });
      return this.abrirSessao(usuario);
    }
    const negocio = await this.prisma.negocio.findUnique({
      where: { slug: SLUG_DA_DEMO },
      include: { dono: true },
    });
    // Modo ligado mas `npm run semear-demo` ainda não rodou. A conferência do e-mail é cinto
    // de segurança: nunca entregar a conta de um dono de verdade que tenha esse endereço
    if (!negocio || !ehDaDemo(negocio.dono.email)) {
      throw new ServiceUnavailableException(
        'A demonstração ainda não foi preparada; tente de novo em instantes',
      );
    }
    return this.abrirSessao(negocio.dono);
  }

  /**
   * Gasta o token de renovação e devolve uma sessão nova da mesma família. Se o token já foi
   * gasto, alguém tem uma cópia dele: a família inteira é revogada (o dono de verdade e o
   * ladrão precisam entrar de novo, mas só o dono sabe a senha).
   *
   * Regra de ouro: cada família tem um único token válido por vez. Por isso também conta como
   * roubo apresentar um token revogado de uma família que ainda tem token válido.
   *
   * Exceção: o mesmo token de novo em até 30 s é o próprio navegador (duas abas abrindo juntas,
   * ou a resposta anterior que se perdeu na rede e o pedido foi refeito). Aí o token emitido
   * antes é revogado e sai um novo no lugar: a família continua com um só token, e quem
   * ficar com o revogado e tentar usá-lo derruba a família.
   */
  async renovar(token: string | undefined): Promise<Sessao> {
    if (!token) throw new UnauthorizedException(RENOVACAO_INVALIDA);
    const agora = new Date();
    // Tudo numa transação com a linha do token trancada: dois pedidos com o mesmo token entram
    // em fila, e o segundo só olha depois que o token novo do primeiro já existe
    const resultado = await this.prisma.$transaction(async (tx) => {
      const [guardado] = await tx.$queryRaw<TokenTrancado[]>`
        SELECT id, usuario_id, familia, familia_criada_em, expira_em, usado_em, revogado_em
        FROM tokens_de_renovacao
        WHERE hash = ${hashDoToken(token)}
        FOR UPDATE`;
      if (
        !guardado ||
        guardado.expira_em <= agora ||
        fimDaFamilia(guardado.familia_criada_em) <= agora
      ) {
        return { erro: 'invalido' } as const;
      }
      if (guardado.revogado_em) {
        // Depois de sair, a família já está toda revogada e nada muda (não é roubo)
        const revogados = await revogarFamilia(tx, guardado.familia);
        return revogados > 0
          ? ({ erro: 'reuso', usuarioId: guardado.usuario_id } as const)
          : ({ erro: 'invalido' } as const);
      }
      if (guardado.usado_em) {
        const segundos = (agora.getTime() - guardado.usado_em.getTime()) / 1000;
        if (segundos > SEGUNDOS_DE_TOLERANCIA) {
          await revogarFamilia(tx, guardado.familia);
          return { erro: 'reuso', usuarioId: guardado.usuario_id } as const;
        }
        // Dentro da tolerância: o token que saiu antes deixa de valer
        await tx.tokenDeRenovacao.updateMany({
          where: { familia: guardado.familia, usadoEm: null, revogadoEm: null },
          data: { revogadoEm: agora },
        });
      } else {
        await tx.tokenDeRenovacao.update({
          where: { id: guardado.id },
          data: { usadoEm: agora },
        });
      }
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: guardado.usuario_id },
      });
      const tokenNovo = await criarTokenDeRenovacao(tx, usuario.id, agora, {
        id: guardado.familia,
        criadaEm: guardado.familia_criada_em,
      });
      return { usuario, tokenNovo } as const;
    });
    if ('erro' in resultado) {
      if (resultado.erro === 'reuso') {
        this.logger.warn(
          `Token de renovação reutilizado; sessões revogadas (usuário ${resultado.usuarioId})`,
        );
      }
      throw new UnauthorizedException(RENOVACAO_INVALIDA);
    }
    return this.montarSessao(resultado.usuario, resultado.tokenNovo);
  }

  /** Encerra a sessão deste aparelho (a família do token). Token desconhecido não é erro. */
  async sair(token: string | undefined): Promise<void> {
    if (!token) return;
    const guardado = await this.prisma.tokenDeRenovacao.findUnique({
      where: { hash: hashDoToken(token) },
      select: { familia: true },
    });
    if (guardado) await revogarFamilia(this.prisma, guardado.familia);
  }

  async buscar(id: string): Promise<UsuarioPublico> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    // Conta apagada com um token de acesso ainda válido
    if (!usuario) throw new UnauthorizedException(RENOVACAO_INVALIDA);
    return publico(usuario);
  }

  private async abrirSessao(usuario: Usuario): Promise<Sessao> {
    const agora = new Date();
    const tokenDeRenovacao = await criarTokenDeRenovacao(
      this.prisma,
      usuario.id,
      agora,
      { id: randomUUID(), criadaEm: agora },
    );
    return this.montarSessao(usuario, tokenDeRenovacao);
  }

  private async montarSessao(
    usuario: Usuario,
    tokenDeRenovacao: TokenEmitido,
  ): Promise<Sessao> {
    const tokenDeAcesso = await this.jwt.signAsync({
      sub: usuario.id,
      papel: usuario.papel,
    });
    return {
      usuario: publico(usuario),
      tokenDeAcesso,
      expiraEm: SEGUNDOS_DO_TOKEN_DE_ACESSO,
      tokenDeRenovacao: tokenDeRenovacao.token,
      renovacaoExpiraEm: tokenDeRenovacao.expiraEm,
    };
  }
}

/** Linha de tokens_de_renovacao lida com SQL (nomes das colunas, não dos campos do Prisma) */
interface TokenTrancado {
  id: string;
  usuario_id: string;
  familia: string;
  familia_criada_em: Date;
  expira_em: Date;
  usado_em: Date | null;
  revogado_em: Date | null;
}

type Banco = Pick<PrismaService, 'tokenDeRenovacao'>;

interface TokenEmitido {
  token: string;
  expiraEm: Date;
}

/** Cria o token da família e devolve o valor (só ele vai para o cookie; o banco guarda o hash). */
async function criarTokenDeRenovacao(
  banco: Banco,
  usuarioId: string,
  agora: Date,
  familia: { id: string; criadaEm: Date },
): Promise<TokenEmitido> {
  const token = novoTokenDeRenovacao();
  const expiraEm = expiracaoDoTokenDeRenovacao(agora, familia.criadaEm);
  // Os gastos ficam até vencer (servem para pegar reuso); os vencidos já não servem para nada
  await banco.tokenDeRenovacao.deleteMany({
    where: { usuarioId, expiraEm: { lte: agora } },
  });
  await banco.tokenDeRenovacao.create({
    data: {
      usuarioId,
      familia: familia.id,
      familiaCriadaEm: familia.criadaEm,
      hash: hashDoToken(token),
      expiraEm,
    },
  });
  return { token, expiraEm };
}

/** Revoga o que ainda vale na família e diz quantos tokens foram revogados agora. */
async function revogarFamilia(banco: Banco, familia: string): Promise<number> {
  const { count } = await banco.tokenDeRenovacao.updateMany({
    where: { familia, revogadoEm: null },
    data: { revogadoEm: new Date() },
  });
  return count;
}

function publico({ id, nome, email, papel }: Usuario): UsuarioPublico {
  return { id, nome, email, papel };
}
