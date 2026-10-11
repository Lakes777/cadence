import { z } from 'zod';
import {
  acharSobreposicao,
  FORMATO_DA_HORA,
  fusoCanonico,
  paraMinutos,
} from './horarios.js';
import { FORMATO_DO_SLUG, TAMANHO_MAXIMO_DO_SLUG } from './slug.js';

const nome = (campo: string) =>
  z
    .string({ error: `Informe o ${campo}` })
    .trim()
    .min(1, `Informe o ${campo}`)
    .max(80, `O ${campo} pode ter até 80 caracteres`);

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(TAMANHO_MAXIMO_DO_SLUG, 'O endereço pode ter até 60 caracteres')
  .regex(
    FORMATO_DO_SLUG,
    'Use só letras minúsculas, números e hífens (ex.: barbearia-exemplo)',
  );

const fuso = z.string().transform((valor, ctx) => {
  const canonico = fusoCanonico(valor.trim());
  if (!canonico) {
    ctx.addIssue({
      code: 'custom',
      message: 'Fuso desconhecido (use o nome IANA, ex.: America/Sao_Paulo)',
    });
    return z.NEVER;
  }
  return canonico;
});

/** Pelo menos um campo num PATCH (corpo vazio é engano de quem chamou) */
const algumCampo = <T extends z.ZodRawShape>(forma: T) =>
  z
    .object(forma)
    .partial()
    .refine((dados) => Object.values(dados).some((v) => v !== undefined), {
      message: 'Informe ao menos um campo para mudar',
    });

export const esquemaNovoNegocio = z.object({
  nome: nome('nome'),
  slug: slug.optional(),
  fuso: fuso.default('America/Sao_Paulo'),
});
export type NovoNegocio = z.infer<typeof esquemaNovoNegocio>;

export const esquemaMudancaNegocio = algumCampo({
  nome: nome('nome'),
  slug,
  fuso,
});
export type MudancaNegocio = z.infer<typeof esquemaMudancaNegocio>;

export const esquemaNovoProfissional = z.object({ nome: nome('nome') });
export type NovoProfissional = z.infer<typeof esquemaNovoProfissional>;

export const esquemaMudancaProfissional = algumCampo({
  nome: nome('nome'),
  ativo: z.boolean(),
});
export type MudancaProfissional = z.infer<typeof esquemaMudancaProfissional>;

const duracaoMin = z
  .number({ error: 'Informe a duração em minutos' })
  .int('A duração é em minutos inteiros')
  .min(5, 'A duração mínima é 5 minutos')
  .max(480, 'A duração máxima é 8 horas')
  .multipleOf(5, 'A duração precisa ser múltipla de 5 minutos');

const precoCentavos = z
  .number({ error: 'Informe o preço em centavos' })
  .int('O preço é em centavos inteiros (R$ 35,00 = 3500)')
  .min(0, 'O preço não pode ser negativo')
  .max(10_000_000, 'Preço alto demais');

export const esquemaNovoServico = z.object({
  nome: nome('nome'),
  duracaoMin,
  precoCentavos,
});
export type NovoServico = z.infer<typeof esquemaNovoServico>;

export const esquemaMudancaServico = algumCampo({
  nome: nome('nome'),
  duracaoMin,
  precoCentavos,
  ativo: z.boolean(),
});
export type MudancaServico = z.infer<typeof esquemaMudancaServico>;

export const esquemaServicosDoProfissional = z.object({
  servicoIds: z
    .array(z.uuid('Id de serviço inválido'))
    .max(200, 'Serviços demais')
    // Repetido não é erro, só não precisa gravar duas vezes
    .transform((ids) => [...new Set(ids)]),
});
export type ServicosDoProfissional = z.infer<
  typeof esquemaServicosDoProfissional
>;

const hora = z
  .string()
  .regex(FORMATO_DA_HORA, 'Use HH:MM (ex.: 09:00; o fim do dia é 24:00)');

export const esquemaHorarios = z
  .object({
    horarios: z
      .array(
        z
          .object({
            diaDaSemana: z
              .number()
              .int()
              .min(0, 'Dia de 0 (domingo) a 6 (sábado)')
              .max(6, 'Dia de 0 (domingo) a 6 (sábado)'),
            inicio: hora,
            fim: hora,
          })
          .transform(({ diaDaSemana, inicio, fim }) => ({
            diaDaSemana,
            inicioMin: paraMinutos(inicio),
            fimMin: paraMinutos(fim),
          }))
          .refine((h) => h.inicioMin < h.fimMin, {
            message: 'O fim precisa ser depois do início',
          }),
      )
      .max(70, 'Intervalos demais (até 10 por dia)'),
  })
  .superRefine(({ horarios }, ctx) => {
    const par = acharSobreposicao(horarios);
    if (par) {
      ctx.addIssue({
        code: 'custom',
        path: ['horarios', par[1]],
        message: `Este intervalo se sobrepõe ao da posição ${par[0]}`,
      });
    }
  });
export type Horarios = z.infer<typeof esquemaHorarios>;

/** Data e hora com fuso explícito: "2026-12-25T00:00:00-03:00" (sem fuso seria ambíguo) */
const instante = z.iso
  .datetime({
    offset: true,
    error: 'Use data e hora ISO com fuso (ex.: 2026-12-25T09:00:00-03:00)',
  })
  .transform((texto) => new Date(texto));

export const UM_ANO_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * O zod 4 roda o refine do objeto mesmo quando um campo já falhou (com o texto cru no lugar da
 * data): as comparações só valem quando os dois lados viraram Date.
 */
function datas(a: unknown, b: unknown): boolean {
  return a instanceof Date && b instanceof Date;
}

export const esquemaNovoBloqueio = z
  .object({
    profissionalId: z.uuid('Id de profissional inválido').optional(),
    inicio: instante,
    fim: instante,
    motivo: z.string().trim().max(200, 'Motivo comprido demais').optional(),
  })
  .refine((b) => !datas(b.inicio, b.fim) || b.inicio < b.fim, {
    path: ['fim'],
    message: 'O fim precisa ser depois do início',
  })
  .refine(
    (b) =>
      !datas(b.inicio, b.fim) ||
      b.fim.getTime() - b.inicio.getTime() <= UM_ANO_MS,
    {
      path: ['fim'],
      message: 'Um bloqueio pode durar no máximo um ano',
    },
  );
export type NovoBloqueio = z.infer<typeof esquemaNovoBloqueio>;

export const esquemaPeriodo = z
  .object({ de: instante.optional(), ate: instante.optional() })
  .refine((p) => !datas(p.de, p.ate) || p.de! < p.ate!, {
    path: ['ate'],
    message: '"ate" precisa ser depois de "de"',
  })
  .refine(
    (p) =>
      !datas(p.de, p.ate) || p.ate!.getTime() - p.de!.getTime() <= UM_ANO_MS,
    { path: ['ate'], message: 'Consulte no máximo um ano por vez' },
  );
export type Periodo = z.infer<typeof esquemaPeriodo>;
