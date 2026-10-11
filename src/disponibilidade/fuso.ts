/**
 * Conversão entre hora local de um fuso IANA e instante UTC, só com Intl (sem biblioteca).
 * O cuidado é o horário de verão: há hora local que não existe (o relógio pula) e hora local
 * que acontece duas vezes (o relógio volta).
 */

const MINUTO_MS = 60_000;

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

/** O relógio de parede do fuso naquele instante, como se fosse UTC (em ms). */
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

/** Quanto o fuso está à frente do UTC naquele instante, em ms (São Paulo: -3 h). */
export function deslocamento(instante: number, fuso: string): number {
  const semMs = Math.floor(instante / 1000) * 1000;
  return paredeEmMs(semMs, fuso) - semMs;
}

export interface DataLocal {
  ano: number;
  mes: number; // 1 a 12
  dia: number;
}

/** "2026-10-12" -> {ano, mes, dia}, ou undefined se a data não existe (30/02). */
export function lerData(texto: string): DataLocal | undefined {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!partes) return undefined;
  const [ano, mes, dia] = partes.slice(1).map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
    ? { ano, mes, dia }
    : undefined;
}

/** 0 = domingo ... 6 = sábado (o dia da semana não depende do fuso, só da data). */
export function diaDaSemana({ ano, mes, dia }: DataLocal): number {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/**
 * O instante UTC em que o relógio do fuso marca `minutos` depois da meia-noite daquela data
 * (1440 = meia-noite do dia seguinte). Hora que não existe (pulo do horário de verão) volta
 * undefined; hora que acontece duas vezes devolve a primeira.
 */
export function localParaUtc(
  data: DataLocal,
  minutos: number,
  fuso: string,
): Date | undefined {
  const parede =
    Date.UTC(data.ano, data.mes - 1, data.dia) + minutos * MINUTO_MS;
  // Os dois deslocamentos possíveis: o de antes e o de depois de uma eventual mudança
  const candidatos = new Set([
    parede - deslocamento(parede - 24 * 60 * MINUTO_MS, fuso),
    parede - deslocamento(parede + 24 * 60 * MINUTO_MS, fuso),
  ]);
  const validos = [...candidatos]
    .filter((instante) => paredeEmMs(instante, fuso) === parede)
    .sort((a, b) => a - b);
  return validos.length ? new Date(validos[0]) : undefined;
}

/**
 * Como `localParaUtc`, mas a hora que não existe vira o instante do pulo (o primeiro em que o
 * relógio já marca depois dela). Serve para limites: o expediente que "acaba às 02:30" num dia
 * em que 02:00 pula para 03:00 acaba, de verdade, no pulo.
 */
export function localParaUtcOuDepois(
  data: DataLocal,
  minutos: number,
  fuso: string,
): Date {
  const exato = localParaUtc(data, minutos, fuso);
  if (exato) return exato;
  const parede =
    Date.UTC(data.ano, data.mes - 1, data.dia) + minutos * MINUTO_MS;
  const a = parede - deslocamento(parede - 24 * 60 * MINUTO_MS, fuso);
  const b = parede - deslocamento(parede + 24 * 60 * MINUTO_MS, fuso);
  // O pulo está entre os dois palpites: busca binária pelo primeiro minuto depois dele
  let antes = Math.min(a, b);
  let depois = Math.max(a, b);
  while (depois - antes > MINUTO_MS) {
    const meio =
      antes + Math.floor((depois - antes) / 2 / MINUTO_MS) * MINUTO_MS;
    if (paredeEmMs(meio, fuso) >= parede) depois = meio;
    else antes = meio;
  }
  return new Date(depois);
}

/** A data local (no fuso) daquele instante. */
export function dataLocal(instante: Date, fuso: string): DataLocal {
  const d = new Date(paredeEmMs(instante.getTime(), fuso));
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
  };
}

/** "HH:MM" do relógio do fuso naquele instante. */
export function horaLocal(instante: Date, fuso: string): string {
  const d = new Date(paredeEmMs(instante.getTime(), fuso));
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function textoDaData({ ano, mes, dia }: DataLocal): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Quantos dias de calendário vão de `a` até `b` (negativo se `b` vem antes). */
export function diasEntre(a: DataLocal, b: DataLocal): number {
  return Math.round(
    (Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) /
      (24 * 60 * MINUTO_MS),
  );
}
