import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { RELOGIO, type Relogio } from '../comum/relogio.js';
import { CONFIG, type Config } from '../config/config.js';
import { esperarConexao, vigiarConexao } from './conexao.js';

export const NOME_DA_FILA = 'lembretes';
export const TAREFA_LEMBRETE = 'lembrete';

export interface TarefaDeLembrete {
  reservaId: string;
}

/** Quanto um comando ao Redis pode demorar antes de desistir (a reserva não espera a fila) */
const LIMITE_DO_REDIS_MS = 2_000;

/**
 * Agenda e desagenda lembretes no Redis. Falhar aqui nunca derruba a reserva nem o
 * cancelamento: o lembrete perdido é achado pela conferência periódica (ver o trabalhador),
 * e o cancelado que ficou na fila é dispensado na hora do envio.
 */
@Injectable()
export class FilaDeLembretes implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilaDeLembretes.name);
  private readonly conexao: Redis;
  private readonly fila: Queue<TarefaDeLembrete>;

  constructor(
    @Inject(CONFIG) config: Config,
    @Inject(RELOGIO) private readonly relogio: Relogio,
  ) {
    // Sem fila de espera local: com o Redis fora do ar o comando falha na hora, em vez de
    // segurar a resposta da reserva até ele voltar
    this.conexao = new Redis(config.REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: LIMITE_DO_REDIS_MS,
      connectTimeout: LIMITE_DO_REDIS_MS,
    });
    vigiarConexao(this.conexao, this.logger);
    this.fila = new Queue<TarefaDeLembrete>(NOME_DA_FILA, {
      connection: this.conexao,
      prefix: config.PREFIXO_DA_FILA,
      defaultJobOptions: {
        // Banco fora do ar na hora do envio: tenta de novo em 10 s, 20 s, 40 s...
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        // Feito ou desistido sai do Redis: o registro que vale é o aviso no banco, e o id
        // livre deixa a conferência recolocar a tarefa se ela tiver falhado
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    this.fila.on('error', (erro) => {
      // Erros de conexão já aparecem uma vez só (vigiarConexao); aqui fica o resto
      if (this.conexao.status !== 'ready') return;
      this.avisar('fila de lembretes', erro);
    });
  }

  /**
   * Agenda o lembrete para `momento`. O id da tarefa é o da reserva: agendar duas vezes não
   * duplica, e cancelar sabe qual tarefa tirar.
   */
  async agendar(reservaId: string, momento: Date): Promise<void> {
    // Redis fora do ar: nem tenta (a conferência envia depois); a reserva não espera
    if (this.conexao.status !== 'ready') return;
    const espera = Math.max(
      0,
      momento.getTime() - this.relogio.agora().getTime(),
    );
    try {
      await comLimite(
        this.fila.add(
          TAREFA_LEMBRETE,
          { reservaId },
          { jobId: reservaId, delay: espera },
        ),
      );
    } catch (erro) {
      this.avisar(`agendar o lembrete da reserva ${reservaId}`, erro);
    }
  }

  /** Tira o lembrete da fila (se ele já estiver saindo, o envio confere o status e desiste) */
  async desagendar(reservaId: string): Promise<void> {
    if (this.conexao.status !== 'ready') return;
    try {
      await comLimite(this.fila.remove(reservaId));
    } catch (erro) {
      this.avisar(`tirar o lembrete da reserva ${reservaId}`, erro);
    }
  }

  /** A tarefa agendada desta reserva, se houver (para os testes e para investigar) */
  tarefa(reservaId: string) {
    return comLimite(this.fila.getJob(reservaId));
  }

  /** O Redis responde? Usado pelo /saude */
  async responde(): Promise<boolean> {
    try {
      return (await this.conexao.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleInit(): Promise<void> {
    await esperarConexao(this.conexao, LIMITE_DO_REDIS_MS);
  }

  async onModuleDestroy(): Promise<void> {
    // Sem Redis, fechar a fila esperaria a conexão para sempre: corta a conexão antes
    if (this.conexao.status !== 'ready') this.conexao.disconnect();
    await this.fila.close();
    this.conexao.disconnect();
  }

  private avisar(oQue: string, erro: unknown): void {
    this.logger.warn(
      `Falha em ${oQue}: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

/**
 * Desiste de esperar o Redis depois de LIMITE_DO_REDIS_MS. Com a conexão aberta, os comandos
 * já falham na hora (sem fila local); isto cobre a partida com o Redis fora do ar, quando o
 * BullMQ espera a primeira conexão antes de mandar qualquer coisa.
 */
async function comLimite<T>(operacao: Promise<T>): Promise<T> {
  let relogio: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operacao,
      new Promise<never>((_, rejeitar) => {
        relogio = setTimeout(
          () =>
            rejeitar(
              new Error(`o Redis não respondeu em ${LIMITE_DO_REDIS_MS} ms`),
            ),
          LIMITE_DO_REDIS_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(relogio);
  }
}
