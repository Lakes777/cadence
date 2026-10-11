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
  // Assina os tokens de acesso (HS256): quem tem o segredo fabrica um token de qualquer pessoa
  JWT_SEGREDO: z
    .string({ error: 'JWT_SEGREDO é obrigatório (ex.: openssl rand -hex 32)' })
    .min(32, 'JWT_SEGREDO precisa de pelo menos 32 caracteres'),
  // Tentativas de cadastro, login e renovação por IP a cada minuto (contra força bruta)
  PEDIDOS_DE_CONTA_POR_MINUTO: z.coerce.number().int().min(1).default(10),
  // Vitrine, disponibilidade e reservar, por IP a cada minuto em cada rota
  PEDIDOS_PUBLICOS_POR_MINUTO: z.coerce.number().int().min(1).default(120),
  // De quem aceitar o X-Forwarded-For (o IP real vale para o limite de pedidos e os logs).
  // Palavras do Express (loopback, uniquelocal...), IPs ou sub-redes separados por vírgula.
  // "true" fica de fora: qualquer um forjaria o próprio IP e escaparia do limite.
  CONFIANCA_NO_PROXY: z
    .string()
    .regex(
      /^[\w.:/]+(\s*,\s*[\w.:/]+)*$/,
      'CONFIANCA_NO_PROXY: lista de IPs, sub-redes ou loopback/linklocal/uniquelocal',
    )
    .refine(
      (valor) => !/^(true|false|\d+)$/.test(valor),
      'CONFIANCA_NO_PROXY não aceita true/false nem número de saltos; informe os endereços',
    )
    .default('loopback'),
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
