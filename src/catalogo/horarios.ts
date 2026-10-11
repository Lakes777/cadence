/** Horário semanal: o banco guarda minutos desde a meia-noite; a API fala "HH:MM". */

export const FORMATO_DA_HORA = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export interface Intervalo {
  diaDaSemana: number;
  inicioMin: number;
  fimMin: number;
}

/** "09:30" -> 570. Aceita "24:00" (fim do dia). */
export function paraMinutos(hora: string): number {
  if (!FORMATO_DA_HORA.test(hora)) throw new Error(`hora inválida: ${hora}`);
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** 570 -> "09:30" */
export function paraHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Primeiro par de intervalos que se sobrepõem no mesmo dia (encostar não conta: 09-12 e
 * 12-18 pode). Devolve as posições na lista original, ou undefined.
 */
export function acharSobreposicao(
  intervalos: readonly Intervalo[],
): [number, number] | undefined {
  const ordenados = intervalos
    .map((intervalo, posicao) => ({ ...intervalo, posicao }))
    .sort((a, b) => a.diaDaSemana - b.diaDaSemana || a.inicioMin - b.inicioMin);
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1];
    const atual = ordenados[i];
    if (
      anterior.diaDaSemana === atual.diaDaSemana &&
      atual.inicioMin < anterior.fimMin
    ) {
      return [
        Math.min(anterior.posicao, atual.posicao),
        Math.max(anterior.posicao, atual.posicao),
      ];
    }
  }
  return undefined;
}

/**
 * O nome canônico de um fuso IANA que o Node conhece ("america/sao_paulo" -> "America/Sao_Paulo"),
 * ou undefined. Abreviações como "EST" ficam de fora: são ambíguas.
 */
export function fusoCanonico(fuso: string): string | undefined {
  // O próprio texto precisa ter cara de IANA: o Node aceita "EST" e devolve "America/Panama"
  if (!fuso.includes('/') && fuso.toUpperCase() !== 'UTC') return undefined;
  try {
    const nome = new Intl.DateTimeFormat('en', {
      timeZone: fuso,
    }).resolvedOptions().timeZone;
    return nome.includes('/') || nome === 'UTC' ? nome : undefined;
  } catch {
    return undefined;
  }
}
