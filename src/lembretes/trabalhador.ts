import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { CONFIG, type Config } from '../config/config.js';
import { vigiarConexao } from './conexao.js';
import { NOME_DA_FILA, type TarefaDeLembrete } from './fila.js';
import { LembretesService } from './lembretes.service.js';

/** De quanto em quanto tempo a conferência procura lembretes que a fila perdeu */
export const INTERVALO_DA_CONFERENCIA_MS = 5 * 60_000;

/**
 * Tira os lembretes da fila na hora marcada e grava o aviso. Roda no mesmo processo da API
 * (é pouco trabalho); para separar, bastaria subir este provedor num processo à parte.
 */
@Injectable()
export class TrabalhadorDeLembretes
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TrabalhadorDeLembretes.name);
  private trabalhador?: Worker<TarefaDeLembrete>;
  private conexao?: Redis;
  private conferencia?: NodeJS.Timeout;
  private conferindo?: Promise<void>;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly lembretes: LembretesService,
  ) {}

  onApplicationBootstrap(): void {
    // O trabalhador espera tarefas com um comando bloqueante: precisa de conexão própria,
    // que tente de novo para sempre (maxRetriesPerRequest: null, exigência do BullMQ)
    this.conexao = new Redis(this.config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    vigiarConexao(this.conexao, this.logger);
    this.trabalhador = new Worker<TarefaDeLembrete>(
      NOME_DA_FILA,
      (tarefa) => this.processar(tarefa),
      {
        connection: this.conexao,
        prefix: this.config.PREFIXO_DA_FILA,
        concurrency: 5,
      },
    );
    this.trabalhador.on('error', (erro) => {
      // Erros de conexão já aparecem uma vez só (vigiarConexao); aqui fica o resto
      if (this.conexao?.status !== 'ready') return;
      this.logger.warn(`Trabalhador de lembretes: ${erro.message}`);
    });
    this.trabalhador.on('failed', (tarefa, erro) =>
      this.logger.error(
        `Lembrete da reserva ${tarefa?.data.reservaId} falhou (tentativa ${tarefa?.attemptsMade}): ${erro.message}`,
      ),
    );

    // A rede de segurança: confere já na partida (pega o que venceu enquanto a API estava
    // parada) e depois a cada 5 min. Não depende do Redis: envia direto pelo banco.
    void this.conferir();
    this.conferencia = setInterval(
      () => void this.conferir(),
      INTERVALO_DA_CONFERENCIA_MS,
    );
  }

  private async processar(tarefa: Job<TarefaDeLembrete>): Promise<void> {
    const envio = await this.lembretes.enviar(tarefa.data.reservaId);
    this.logger.log(`Lembrete da reserva ${tarefa.data.reservaId}: ${envio}`);
  }

  /** Envia os lembretes atrasados; nunca roda duas vezes ao mesmo tempo */
  conferir(): Promise<void> {
    this.conferindo ??= this.enviarAtrasados().finally(() => {
      this.conferindo = undefined;
    });
    return this.conferindo;
  }

  private async enviarAtrasados(): Promise<void> {
    let atrasados: string[];
    try {
      atrasados = await this.lembretes.atrasados();
    } catch (erro) {
      this.logger.warn(`Conferência de lembretes falhou: ${mensagem(erro)}`);
      return;
    }
    // Um envio que falha não segura os outros do lote
    for (const reservaId of atrasados) {
      try {
        const envio = await this.lembretes.enviar(reservaId);
        if (envio === 'enviado') {
          this.logger.warn(
            `Lembrete da reserva ${reservaId} enviado pela conferência (a fila não entregou)`,
          );
        }
      } catch (erro) {
        this.logger.warn(
          `Conferência: lembrete da reserva ${reservaId} falhou: ${mensagem(erro)}`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.conferencia);
    await this.conferindo;
    // Com o Redis no ar, espera os envios em andamento terminarem. Sem ele, não há envio
    // em andamento e fechar com calma esperaria a conexão para sempre: fecha à força.
    const semRedis = this.conexao?.status !== 'ready';
    if (semRedis) this.conexao?.disconnect();
    await this.trabalhador?.close(semRedis);
    this.conexao?.disconnect();
  }
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
