import { z } from 'zod';

const email = z
  .string({ error: 'Informe o e-mail' })
  .trim()
  .toLowerCase()
  .max(254, 'E-mail comprido demais')
  .pipe(z.email('E-mail inválido'));

export const esquemaDeCadastro = z.object({
  nome: z
    .string({ error: 'Informe o nome' })
    .trim()
    .min(1, 'Informe o nome')
    .max(80, 'Nome comprido demais (até 80 caracteres)'),
  email,
  // Teto alto mas finito: senha gigante faria o scrypt trabalhar à toa
  senha: z
    .string({ error: 'Informe a senha' })
    .min(8, 'A senha precisa de pelo menos 8 caracteres')
    .max(128, 'A senha pode ter até 128 caracteres'),
  papel: z.enum(['dono', 'cliente']).default('cliente'),
});
export type Cadastro = z.infer<typeof esquemaDeCadastro>;

export const esquemaDeLogin = z.object({
  email,
  senha: z
    .string({ error: 'Informe a senha' })
    .min(1, 'Informe a senha')
    .max(128),
});
export type Login = z.infer<typeof esquemaDeLogin>;
