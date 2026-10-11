import { z } from 'zod';

export const esquemaNovaReserva = z.object({
  servicoId: z.uuid('Id de serviço inválido'),
  /** Sem profissional: qualquer um que esteja livre no horário */
  profissionalId: z.uuid('Id de profissional inválido').optional(),
  inicio: z.iso
    .datetime({
      offset: true,
      error: 'Use data e hora ISO com fuso (ex.: 2026-10-12T09:00:00-03:00)',
    })
    .transform((texto) => new Date(texto)),
});
export type NovaReserva = z.infer<typeof esquemaNovaReserva>;

/** Letras, números, `_` e `-`; um UUID gerado pela interface serve */
export const FORMATO_DA_CHAVE = /^[\w-]{8,100}$/;

export const esquemaMinhas = z.object({
  periodo: z.enum(['proximas', 'anteriores']).default('proximas'),
});
export type Minhas = z.infer<typeof esquemaMinhas>;
