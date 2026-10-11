import { dataLocal, horaLocal } from '../disponibilidade/fuso.js';

/** O lembrete sai 24 h antes do início */
export const HORAS_DE_ANTECEDENCIA = 24;
const ANTECEDENCIA_MS = HORAS_DE_ANTECEDENCIA * 60 * 60_000;

/**
 * Quando o lembrete deve sair, ou null se esse momento já passou: quem reserva em cima da
 * hora (menos de 24 h antes) acabou de ver a reserva e não precisa de lembrete.
 */
export function momentoDoLembrete(inicio: Date, agora: Date): Date | null {
  const momento = new Date(inicio.getTime() - ANTECEDENCIA_MS);
  return momento > agora ? momento : null;
}

export interface DadosDoLembrete {
  servico: string;
  profissional: string;
  negocio: string;
  fuso: string;
  inicio: Date;
}

/** "Lembrete: Corte com Ana na Barbearia, 19/10 às 09:00" (data e hora no fuso do negócio) */
export function textoDoLembrete(d: DadosDoLembrete): string {
  const { dia, mes } = dataLocal(d.inicio, d.fuso);
  const data = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
  return `Lembrete: ${d.servico} com ${d.profissional} em ${d.negocio}, ${data} às ${horaLocal(d.inicio, d.fuso)}`;
}
