import type { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

/**
 * Com o Redis fora do ar, o ioredis tenta reconectar sem parar e emite um erro a cada
 * tentativa. O log registra só a queda e a volta, não cada tentativa.
 */
export function vigiarConexao(conexao: Redis, logger: Logger): void {
  let caiu = false;
  conexao.on('error', (erro: Error) => {
    if (caiu) return;
    caiu = true;
    logger.warn(`Redis fora do ar: ${erro.message}`);
  });
  conexao.on('ready', () => {
    if (!caiu) return;
    caiu = false;
    logger.log('Redis de volta');
  });
}

/**
 * Espera a conexão ficar pronta, por no máximo `limiteMs`. Na partida, evita que o primeiro
 * pedido encontre a conexão ainda abrindo; com o Redis fora do ar, desiste e a API sobe assim.
 */
export async function esperarConexao(
  conexao: Redis,
  limiteMs: number,
): Promise<boolean> {
  if (conexao.status === 'ready') return true;
  let relogio: NodeJS.Timeout | undefined;
  let pronta: (() => void) | undefined;
  const resultado = await Promise.race([
    new Promise<boolean>((resolver) => {
      pronta = () => resolver(true);
      conexao.once('ready', pronta);
    }),
    new Promise<boolean>((resolver) => {
      relogio = setTimeout(() => resolver(false), limiteMs);
    }),
  ]);
  clearTimeout(relogio);
  if (pronta) conexao.off('ready', pronta);
  return resultado;
}
