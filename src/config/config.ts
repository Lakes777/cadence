import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORTA: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL é obrigatória' })
    .refine(
      (url) => /^postgres(ql)?:\/\//.test(url),
      'DATABASE_URL precisa começar com postgres:// ou postgresql://',
    ),
  NIVEL_DO_LOG: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Config = Readonly<z.infer<typeof esquema>>;

/** Token de injeção da configuração já validada. */
export const CONFIG = Symbol('CONFIG');

/**
 * Valida as variáveis de ambiente na partida. Qualquer erro derruba o processo antes de
 * abrir a porta, com uma mensagem que diz o que falta (e nunca o valor, que pode ser segredo).
 */
export function lerConfig(env: NodeJS.ProcessEnv): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((p) => `- ${p.path.join('.')}: ${p.message}`)
      .join('\n');
    throw new Error(`Configuração inválida:\n${problemas}`);
  }
  return Object.freeze(resultado.data);
}
