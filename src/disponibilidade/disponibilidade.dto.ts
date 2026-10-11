import { z } from 'zod';
import { lerData, type DataLocal } from './fuso.js';

export const esquemaConsulta = z.object({
  servicoId: z.uuid('Informe o serviço (servicoId)'),
  data: z
    .string({ error: 'Informe a data (AAAA-MM-DD)' })
    .transform((texto, ctx) => {
      const data = lerData(texto);
      if (!data) {
        ctx.addIssue({
          code: 'custom',
          message: 'Data inválida (use AAAA-MM-DD)',
        });
        return z.NEVER;
      }
      return data;
    }),
  profissionalId: z.uuid('Id de profissional inválido').optional(),
});
export type Consulta = z.infer<typeof esquemaConsulta> & { data: DataLocal };
