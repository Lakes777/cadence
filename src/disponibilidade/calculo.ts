import {
  horaLocal,
  localParaUtc,
  localParaUtcOuDepois,
  type DataLocal,
} from './fuso.js';

/** Os horários oferecidos começam a cada 15 min dentro do expediente (09:00, 09:15...). */
export const PASSO_MIN = 15;

export interface Periodo {
  inicio: Date;
  fim: Date;
}

export interface Entrada {
  data: DataLocal;
  fuso: string;
  duracaoMin: number;
  /** Os intervalos daquele dia da semana, em minutos locais, de cada profissional */
  profissionais: {
    id: string;
    intervalos: { inicioMin: number; fimMin: number }[];
  }[];
  /** Bloqueio sem profissional vale para todos */
  bloqueios: (Periodo & { profissionalId: string | null })[];
  /** Reservas já feitas (fase 5) */
  ocupados: (Periodo & { profissionalId: string })[];
  /** Nada começa antes disto (agora + antecedência mínima) */
  aPartirDe: Date;
}

export interface HorarioLivre extends Periodo {
  /** Hora local de início, "HH:MM" */
  hora: string;
  profissionalIds: string[];
}

const seSobrepoem = (a: Periodo, b: Periodo) =>
  a.inicio < b.fim && b.inicio < a.fim;

/**
 * Os horários livres do dia, juntando quem pode atender cada um. Função pura: tudo o que ela
 * precisa vem na entrada, para poder testar sem banco e sem relógio.
 */
export function calcularHorarios(entrada: Entrada): HorarioLivre[] {
  const { data, fuso, duracaoMin } = entrada;
  const duracaoMs = duracaoMin * 60_000;
  const porInicio = new Map<number, HorarioLivre>();
  // Vários profissionais costumam ter o mesmo expediente: converte cada minuto uma vez só
  const convertidos = new Map<number, Date | undefined>();
  const instante = (minutos: number) => {
    if (!convertidos.has(minutos)) {
      convertidos.set(minutos, localParaUtc(data, minutos, fuso));
    }
    return convertidos.get(minutos);
  };

  for (const profissional of entrada.profissionais) {
    const impedimentos: Periodo[] = [
      ...entrada.bloqueios.filter(
        (b) =>
          b.profissionalId === null || b.profissionalId === profissional.id,
      ),
      ...entrada.ocupados.filter((o) => o.profissionalId === profissional.id),
    ];
    for (const { inicioMin, fimMin } of profissional.intervalos) {
      // O fim do expediente em tempo real: num dia de horário de verão o relógio local mente
      // (o expediente pode ter uma hora a mais ou a menos), então quem decide é o instante
      const fimDoExpediente = localParaUtcOuDepois(data, fimMin, fuso);
      for (let t = inicioMin; t < fimMin; t += PASSO_MIN) {
        const inicio = instante(t);
        if (!inicio) continue; // hora que não existe nesse dia
        const horario = { inicio, fim: new Date(inicio.getTime() + duracaoMs) };
        if (horario.fim > fimDoExpediente) continue;
        if (horario.inicio < entrada.aPartirDe) continue;
        if (impedimentos.some((i) => seSobrepoem(horario, i))) continue;

        const chave = inicio.getTime();
        const existente = porInicio.get(chave);
        if (existente) {
          if (!existente.profissionalIds.includes(profissional.id)) {
            existente.profissionalIds.push(profissional.id);
          }
        } else {
          porInicio.set(chave, {
            ...horario,
            hora: horaLocal(inicio, fuso),
            profissionalIds: [profissional.id],
          });
        }
      }
    }
  }
  return [...porInicio.values()].sort(
    (a, b) => a.inicio.getTime() - b.inicio.getTime(),
  );
}
