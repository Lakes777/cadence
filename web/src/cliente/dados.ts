import type { Disponibilidade, HorarioLivre } from '../api/tipos';
import { hojeNoFuso, somarDias } from '../comum/formatos';

/** Até quantos dias à frente a agenda abre (JANELA_DIAS da API) */
export const JANELA_DIAS = 60;

/** Horário que existiria sem as reservas e que ninguém pode mais atender (sem dizer quem) */
export type HorarioOcupado = Disponibilidade['ocupados'][number];

/** GET /negocios/:slug/disponibilidade, com os ocupados (fase 8) */
export type DisponibilidadeDoDia = Disponibilidade;

export type ItemDaGrade =
  | { tipo: 'livre'; hora: string; inicio: string; horario: HorarioLivre }
  | { tipo: 'ocupado'; hora: string; inicio: string };

/** Livres e ocupados juntos, na ordem do dia */
export function montarGrade(disp: DisponibilidadeDoDia): ItemDaGrade[] {
  const itens: ItemDaGrade[] = [
    ...disp.horarios.map((h) => ({
      tipo: 'livre' as const,
      hora: h.hora,
      inicio: h.inicio,
      horario: h,
    })),
    ...disp.ocupados.map((h) => ({
      tipo: 'ocupado' as const,
      hora: h.hora,
      inicio: h.inicio,
    })),
  ];
  return itens.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}

/** Os dias que a agenda oferece, de hoje (no fuso do negócio) até o último da janela */
export function diasDaAgenda(fuso: string, agora = new Date()): string[] {
  const hoje = hojeNoFuso(fuso, agora);
  return Array.from({ length: JANELA_DIAS + 1 }, (_, i) => somarDias(hoje, i));
}
