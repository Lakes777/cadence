import type { HorarioSemanal } from '../api/tipos';
import { NOMES_DOS_DIAS } from '../comum/formatos';

/** Um intervalo do editor: o que está digitado (pode estar incompleto até salvar) */
export interface Intervalo {
  inicio: string;
  fim: string;
}

/** A semana no editor: posição 0 = domingo ... 6 = sábado */
export type Semana = Intervalo[][];

/** A ordem em que a tela mostra os dias: de segunda a domingo */
export const ORDEM_DOS_DIAS = [1, 2, 3, 4, 5, 6, 0] as const;
export const DIAS_UTEIS = [1, 2, 3, 4, 5] as const;

export function semanaDe(horarios: HorarioSemanal[]): Semana {
  const semana: Semana = [[], [], [], [], [], [], []];
  const ordenados = [...horarios].sort(
    (a, b) => a.diaDaSemana - b.diaDaSemana || a.inicio.localeCompare(b.inicio),
  );
  for (const { diaDaSemana, inicio, fim } of ordenados) {
    semana[diaDaSemana].push({ inicio, fim });
  }
  return semana;
}

/**
 * A lista que vai no PUT, e de onde veio cada item: o servidor responde os erros pela posição
 * na lista ("horarios.3"), e a tela precisa saber que é o 2º intervalo de quarta.
 */
export function listaDa(semana: Semana): {
  horarios: HorarioSemanal[];
  origem: { dia: number; posicao: number }[];
} {
  const horarios: HorarioSemanal[] = [];
  const origem: { dia: number; posicao: number }[] = [];
  semana.forEach((intervalos, dia) => {
    intervalos.forEach(({ inicio, fim }, posicao) => {
      horarios.push({
        diaDaSemana: dia,
        inicio: inicio.trim(),
        fim: fim.trim(),
      });
      origem.push({ dia, posicao });
    });
  });
  return { horarios, origem };
}

/** Copia os intervalos de um dia para os outros dias úteis (segunda a sexta) */
export function copiarParaDiasUteis(semana: Semana, dia: number): Semana {
  return semana.map((intervalos, d) =>
    d !== dia && (DIAS_UTEIS as readonly number[]).includes(d)
      ? semana[dia].map((i) => ({ ...i }))
      : intervalos,
  );
}

/** A chave de um erro de intervalo no editor: "3-1" = quarta, 2º intervalo */
export function chaveDoIntervalo(dia: number, posicao: number): string {
  return `${dia}-${posicao}`;
}

/**
 * Os erros do servidor ("horarios.4", "horarios.4.inicio") presos ao intervalo de onde vieram;
 * o que não aponta para um intervalo (ex.: "horarios", lista grande demais) fica em `geral`.
 */
export function errosPorIntervalo(
  erros: { campo: string; mensagem: string }[],
  origem: { dia: number; posicao: number }[],
): { porIntervalo: Map<string, string>; geral: string[] } {
  const porIntervalo = new Map<string, string>();
  const geral: string[] = [];
  for (const { campo, mensagem } of erros) {
    const achado = /^horarios\.(\d+)(?:\.(\w+))?$/.exec(campo);
    const de = achado ? origem[Number(achado[1])] : undefined;
    if (!de) {
      geral.push(mensagem);
      continue;
    }
    const chave = chaveDoIntervalo(de.dia, de.posicao);
    const lado =
      achado?.[2] === 'inicio'
        ? 'Início: '
        : achado?.[2] === 'fim'
          ? 'Fim: '
          : '';
    // "se sobrepõe ao da posição 0": a posição é da lista do PUT, que a pessoa não vê
    const legivel = mensagem.replace(
      /ao da posição (\d+)/,
      (texto, n: string) => {
        const outro = origem[Number(n)];
        return outro
          ? `ao ${outro.posicao + 1}º intervalo de ${NOMES_DOS_DIAS[outro.dia].toLowerCase()}`
          : texto;
      },
    );
    const antes = porIntervalo.get(chave);
    porIntervalo.set(
      chave,
      antes ? `${antes} ${lado}${legivel}` : `${lado}${legivel}`,
    );
  }
  return { porIntervalo, geral };
}
