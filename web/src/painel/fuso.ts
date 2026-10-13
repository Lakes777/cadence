/**
 * "Data e hora no relógio do negócio" <-> instante UTC, só com Intl (como o servidor faz em
 * src/disponibilidade/fuso.ts). O navegador pode estar em outro fuso: nada aqui usa o dele.
 *
 * O cuidado é o horário de verão: quando o relógio pula, há hora local que não existe (fica
 * undefined, e a tela avisa); quando volta, a hora acontece duas vezes (vale a primeira).
 */

const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatadores.set(fuso, f);
  }
  return f;
}

/** O relógio de parede do fuso naquele instante, escrito como se fosse UTC (em ms) */
function paredeEmMs(instante: number, fuso: string): number {
  const partes: Record<string, number> = {};
  for (const { type, value } of formatador(fuso).formatToParts(instante)) {
    if (type !== 'literal') partes[type] = Number(value);
  }
  return Date.UTC(
    partes.year,
    partes.month - 1,
    partes.day,
    partes.hour,
    partes.minute,
    partes.second,
  );
}

/** Quanto o fuso está à frente do UTC naquele instante, em ms (São Paulo: -3 h) */
function deslocamento(instante: number, fuso: string): number {
  const semMs = Math.floor(instante / 1000) * 1000;
  return paredeEmMs(semMs, fuso) - semMs;
}

const FORMATO_DA_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_DA_HORA = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** "2026-10-19" + "09:30" -> o relógio de parede em ms; undefined se a data ou a hora é inválida */
function parede(data: string, hora: string): number | undefined {
  const d = FORMATO_DA_DATA.exec(data);
  if (!d || !FORMATO_DA_HORA.test(hora)) return undefined;
  const [ano, mes, dia] = d.slice(1).map(Number);
  const meiaNoite = Date.UTC(ano, mes - 1, dia);
  const conferida = new Date(meiaNoite);
  // 30/02 não existe: o Date.UTC passaria para 02/03 sem reclamar
  if (conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) {
    return undefined;
  }
  const [h, m] = hora.split(':').map(Number);
  return meiaNoite + (h * 60 + m) * MINUTO_MS;
}

/** Os instantes em que o relógio do fuso marca aquela parede (0, 1 ou 2), em ordem */
function instantesDa(alvo: number, fuso: string): number[] {
  // Os dois deslocamentos possíveis: o de antes e o de depois de uma eventual mudança
  const candidatos = new Set([
    alvo - deslocamento(alvo - DIA_MS, fuso),
    alvo - deslocamento(alvo + DIA_MS, fuso),
  ]);
  return [...candidatos]
    .filter((instante) => paredeEmMs(instante, fuso) === alvo)
    .sort((a, b) => a - b);
}

/**
 * O instante em que o relógio do fuso marca `hora` (HH:MM; "24:00" é a meia-noite seguinte)
 * naquela data. Hora que não existe (o relógio pulou) volta undefined; hora repetida (o relógio
 * voltou), a primeira vez.
 */
export function localParaUtc(
  data: string,
  hora: string,
  fuso: string,
): Date | undefined {
  const alvo = parede(data, hora);
  if (alvo === undefined) return undefined;
  const [primeiro] = instantesDa(alvo, fuso);
  return primeiro === undefined ? undefined : new Date(primeiro);
}

/** Como localParaUtc, já em texto ISO (UTC, com "Z": a API aceita qualquer fuso explícito) */
export function localParaIso(
  data: string,
  hora: string,
  fuso: string,
): string | undefined {
  return localParaUtc(data, hora, fuso)?.toISOString();
}

/**
 * O começo do dia no fuso. Onde a meia-noite não existe (Santiago já pulou 00:00 -> 01:00),
 * o dia começa no pulo: o primeiro minuto em que o relógio já marca aquela data.
 */
export function inicioDoDia(data: string, fuso: string): Date {
  const exato = localParaUtc(data, '00:00', fuso);
  if (exato) return exato;
  const alvo = parede(data, '00:00');
  if (alvo === undefined) throw new Error(`data inválida: ${data}`);
  const a = alvo - deslocamento(alvo - DIA_MS, fuso);
  const b = alvo - deslocamento(alvo + DIA_MS, fuso);
  // O pulo está entre os dois palpites: busca binária pelo primeiro minuto depois dele
  let antes = Math.min(a, b);
  let depois = Math.max(a, b);
  while (depois - antes > MINUTO_MS) {
    const meio =
      antes + Math.floor((depois - antes) / 2 / MINUTO_MS) * MINUTO_MS;
    if (paredeEmMs(meio, fuso) >= alvo) depois = meio;
    else antes = meio;
  }
  return new Date(depois);
}

/** A data (YYYY-MM-DD) e a hora (HH:MM) do relógio do fuso naquele instante */
export function partesLocais(
  instante: Date | string,
  fuso: string,
): { data: string; hora: string } {
  const d = new Date(paredeEmMs(new Date(instante).getTime(), fuso));
  const iso = d.toISOString();
  return { data: iso.slice(0, 10), hora: iso.slice(11, 16) };
}
