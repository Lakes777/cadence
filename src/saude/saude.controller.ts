import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Publica } from '../auth/decoradores.js';
import { PrismaService } from '../banco/prisma.service.js';
import { FilaDeLembretes } from '../lembretes/fila.js';

export interface Saude {
  status: 'ok';
  banco: 'ok';
  /** Só informativo: sem o Redis as reservas seguem funcionando e os lembretes saem pela conferência */
  fila: 'ok' | 'fora do ar';
}

/** Tempo máximo do SELECT 1: um banco congelado (rede caída) não responde nunca. */
export const LIMITE_DA_CONSULTA_MS = 5_000;

/**
 * Usado pelo Vigil e pelo healthcheck do Docker: 200 se o banco responde, 503 se não.
 * O Redis aparece no corpo, mas não derruba o status (a API funciona sem ele).
 */
@Controller('saude')
@Publica()
export class SaudeController {
  private readonly logger = new Logger(SaudeController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fila: FilaDeLembretes,
  ) {}

  @Get()
  async verificar(): Promise<Saude> {
    const fila = this.fila.responde();
    let relogio: NodeJS.Timeout | undefined;
    const esgotado = new Promise<never>((_, rejeitar) => {
      relogio = setTimeout(
        () =>
          rejeitar(
            new Error(`o banco não respondeu em ${LIMITE_DA_CONSULTA_MS} ms`),
          ),
        LIMITE_DA_CONSULTA_MS,
      );
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, esgotado]);
    } catch (erro) {
      // O motivo fica só no log do servidor; a resposta não expõe nada do banco
      this.logger.warn(
        `Banco fora do ar: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      throw new ServiceUnavailableException({
        status: 'erro',
        banco: 'fora do ar',
      });
    } finally {
      clearTimeout(relogio);
    }
    return {
      status: 'ok',
      banco: 'ok',
      fila: (await fila) ? 'ok' : 'fora do ar',
    };
  }
}
