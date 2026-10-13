import { PrismaPg } from '@prisma/adapter-pg';
import { lerConfig } from '../config/config.js';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  DOMINIO_DA_DEMO,
  EMAIL_DO_DONO_DA_DEMO,
  FUSO_DA_DEMO,
  NOME_DA_DEMO,
  SENHA_DE_DEMONSTRACAO,
  SLUG_DA_DEMO,
} from './demo.js';
import {
  apelido,
  bloqueioDeExemplo,
  CLIENTES,
  PROFISSIONAIS,
  reservasDeExemplo,
  SERVICOS,
} from './exemplo.js';

/** A semeadura não roda: a mensagem diz por quê (o comando sai com 1) */
export class SemeaduraRecusada extends Error {}

export interface ResumoDaSemeadura {
  /** Contas de visitante cliente apagadas (as dos clientes fictícios voltam iguais) */
  visitantesApagados: number;
  reservas: number;
}

/** Um número qualquer, fixo: duas semeaduras ao mesmo tempo entram em fila */
const TRAVA_DA_SEMEADURA = 4008;

const DA_DEMO = { email: { endsWith: `@${DOMINIO_DA_DEMO}` } };

/**
 * Repõe a demonstração do zero numa transação só: quem estiver olhando vê o estado antigo ou
 * o novo, nunca a barbearia pela metade. Apaga todas as contas da demonstração menos a do dono
 * (visitantes e clientes fictícios, com reservas, avisos e tokens, por cascata), apaga os
 * negócios do dono (a Barbearia e o que algum visitante tenha criado), revoga as sessões do dono
 * e recria tudo a partir de `agora`.
 *
 * Recusa se houver no banco qualquer conta fora do domínio da demonstração: é o que impede
 * apagar um banco de verdade por engano (CADENCE_DEMO ligada no lugar errado).
 */
export async function semearDemo(
  prisma: PrismaClient,
  agora: Date,
): Promise<ResumoDaSemeadura> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TRAVA_DA_SEMEADURA})`;
      const reais = await tx.usuario.count({ where: { NOT: DA_DEMO } });
      if (reais > 0) {
        throw new SemeaduraRecusada(
          `Recusado: o banco tem ${reais} conta(s) que não são da demonstração (e-mail fora de @${DOMINIO_DA_DEMO}). ` +
            'A semeadura apaga dados; rode só num banco exclusivo da demonstração.',
        );
      }

      // As reservas primeiro: a chave delas para profissional e serviço é RESTRICT, e a
      // cascata a partir do negócio poderia tentar apagar o profissional antes da reserva
      await tx.reserva.deleteMany({
        where: { OR: [{ cliente: DA_DEMO }, { negocio: { dono: DA_DEMO } }] },
      });
      const visitantesApagados = await tx.usuario.count({
        where: {
          email: { startsWith: 'visitante-', endsWith: `@${DOMINIO_DA_DEMO}` },
        },
      });
      await tx.usuario.deleteMany({
        where: { ...DA_DEMO, NOT: { email: EMAIL_DO_DONO_DA_DEMO } },
      });
      // O dono fica com o mesmo id (o token de acesso de quem está no painel continua servindo
      // por até 15 min), mas perde as sessões: depois da reposição, todo visitante entra de novo
      const dono = await tx.usuario.upsert({
        where: { email: EMAIL_DO_DONO_DA_DEMO },
        create: {
          nome: 'Dono da Barbearia Exemplo',
          email: EMAIL_DO_DONO_DA_DEMO,
          senhaHash: SENHA_DE_DEMONSTRACAO,
          papel: 'dono',
        },
        update: { papel: 'dono', senhaHash: SENHA_DE_DEMONSTRACAO },
      });
      await tx.tokenDeRenovacao.deleteMany({ where: { usuarioId: dono.id } });
      await tx.negocio.deleteMany({ where: { donoId: dono.id } });

      const negocio = await tx.negocio.create({
        data: {
          donoId: dono.id,
          nome: NOME_DA_DEMO,
          slug: SLUG_DA_DEMO,
          fuso: FUSO_DA_DEMO,
        },
      });
      const servicos = new Map<string, { id: string; precoCentavos: number }>();
      for (const s of SERVICOS) {
        const criado = await tx.servico.create({
          data: { ...s, negocioId: negocio.id },
        });
        servicos.set(s.nome, criado);
      }
      const profissionais = new Map<string, string>();
      for (const p of PROFISSIONAIS) {
        const { id } = await tx.profissional.create({
          data: { negocioId: negocio.id, nome: p.nome },
        });
        profissionais.set(p.nome, id);
        await tx.profissionalServico.createMany({
          data: p.servicos.map((nome) => ({
            profissionalId: id,
            servicoId: servicos.get(nome)!.id,
            negocioId: negocio.id,
          })),
        });
        await tx.horarioDeTrabalho.createMany({
          data: p.horarios.map((h) => ({ ...h, profissionalId: id })),
        });
      }

      const bloqueio = bloqueioDeExemplo(agora, FUSO_DA_DEMO);
      await tx.bloqueio.create({
        data: {
          negocioId: negocio.id,
          profissionalId: profissionais.get(bloqueio.profissional),
          inicio: bloqueio.inicio,
          fim: bloqueio.fim,
          motivo: bloqueio.motivo,
        },
      });

      const clientes = new Map<string, string>();
      for (const nome of CLIENTES) {
        const { id } = await tx.usuario.create({
          data: {
            nome,
            email: `${apelido(nome)}@${DOMINIO_DA_DEMO}`,
            senhaHash: SENHA_DE_DEMONSTRACAO,
            papel: 'cliente',
          },
        });
        clientes.set(nome, id);
      }
      const reservas = reservasDeExemplo(agora, FUSO_DA_DEMO, bloqueio);
      await tx.reserva.createMany({
        data: reservas.map((r, i) => {
          const servico = servicos.get(r.servico)!;
          return {
            negocioId: negocio.id,
            profissionalId: profissionais.get(r.profissional)!,
            servicoId: servico.id,
            clienteId: clientes.get(r.cliente)!,
            inicio: r.inicio,
            fim: r.fim,
            precoCentavos: servico.precoCentavos,
            chaveIdempotencia: `semeadura-${i}`,
            hashDoPedido: 'semeadura',
            // Sem lembrete: ninguém entra nas contas fictícias para ler
            lembreteEm: null,
          };
        }),
      });
      return { visitantesApagados, reservas: reservas.length };
    },
    // Umas cem linhas; o padrão (5 s) basta, mas uma VM pequena ocupada pode demorar mais
    { timeout: 30_000 },
  );
}

/**
 * O comando `npm run semear-demo`: lê a configuração, recusa fora da demonstração e semeia com
 * o relógio de verdade. Devolve o código de saída (separado de semear.ts para os testes
 * chamarem sem abrir outro processo).
 */
export async function executar(
  env: NodeJS.ProcessEnv,
  escrever: (linha: string) => void,
  agora: Date = new Date(),
): Promise<number> {
  let config;
  try {
    config = lerConfig(env);
  } catch (erro) {
    escrever(erro instanceof Error ? erro.message : String(erro));
    return 1;
  }
  if (!config.CADENCE_DEMO) {
    escrever(
      'Recusado: CADENCE_DEMO não está ligada. A semeadura apaga e recria a demonstração; ' +
        'só roda com CADENCE_DEMO=true.',
    );
    return 1;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: config.DATABASE_URL,
      connectionTimeoutMillis: 5_000,
    }),
  });
  try {
    const resumo = await semearDemo(prisma, agora);
    escrever(
      `Demonstração reposta: ${resumo.reservas} reservas de exemplo; ${resumo.visitantesApagados} visitante(s) apagado(s).`,
    );
    return 0;
  } catch (erro) {
    if (erro instanceof SemeaduraRecusada) {
      escrever(erro.message);
      return 1;
    }
    throw erro;
  } finally {
    await prisma.$disconnect();
  }
}
