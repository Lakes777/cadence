/** Formatos de tela. Horas e datas sempre no fuso do negócio, não no do navegador. */

const dinheiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatarDinheiro(centavos: number): string {
  // O Intl usa espaço inseparável depois do "R$"; troca por um comum para os testes e a busca
  return dinheiro.format(centavos / 100).replace(/ /g, ' ');
}

/** "09:30" no fuso dado */
export function formatarHora(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Uma data YYYY-MM-DD (já local) por extenso: "segunda, 19 de outubro" */
export function formatarDia(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  // Meio-dia em UTC: a data não "escorrega" para o dia anterior em nenhum fuso
  const meioDia = new Date(Date.UTC(a, m - 1, d, 12));
  const texto = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(meioDia);
  return texto.replace('-feira', '');
}

/** A data YYYY-MM-DD de um instante no fuso dado */
export function dataNoFuso(instante: Date | string, fuso: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instante));
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Hoje (YYYY-MM-DD) no fuso dado */
export function hojeNoFuso(fuso: string, agora = new Date()): string {
  return dataNoFuso(agora, fuso);
}

/**
 * A data YYYY-MM-DD existe no calendário? "2026-02-31" tem o formato certo e não existe: vinda
 * de um link editado à mão, quebraria as contas de fuso.
 */
export function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10) === data;
}

/** Soma dias a uma data YYYY-MM-DD */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado, de uma data YYYY-MM-DD */
export function diaDaSemana(data: string): number {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export const NOMES_DOS_DIAS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;
