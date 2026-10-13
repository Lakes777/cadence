import { createHash } from 'node:crypto';
import {
  dataLocal,
  diaDaSemana,
  localParaUtc,
  textoDaData,
  type DataLocal,
} from '../disponibilidade/fuso.js';

/**
 * O conteúdo da Barbearia Exemplo e as reservas de clientes fictícios. Tudo aqui é puro (sem
 * banco): recebe "agora" e devolve o que gravar, por isso é testado sem Postgres.
 */

export interface ServicoDeExemplo {
  nome: string;
  duracaoMin: number;
  precoCentavos: number;
}

export const SERVICOS: readonly ServicoDeExemplo[] = [
  { nome: 'Corte', duracaoMin: 30, precoCentavos: 4500 },
  { nome: 'Barba', duracaoMin: 30, precoCentavos: 3500 },
  { nome: 'Corte e barba', duracaoMin: 60, precoCentavos: 7000 },
  { nome: 'Acabamento (pezinho)', duracaoMin: 15, precoCentavos: 1500 },
];

/** Um intervalo do horário semanal, em minutos desde a meia-noite (0 = domingo) */
export interface IntervaloDeExemplo {
  diaDaSemana: number;
  inicioMin: number;
  fimMin: number;
}

export interface ProfissionalDeExemplo {
  nome: string;
  /** Nomes dos serviços que faz */
  servicos: readonly string[];
  horarios: readonly IntervaloDeExemplo[];
}

const h = (hora: number) => hora * 60;
const dias = (de: number, ate: number, inicio: number, fim: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => ({
    diaDaSemana: de + i,
    inicioMin: h(inicio),
    fimMin: h(fim),
  }));

export const PROFISSIONAIS: readonly ProfissionalDeExemplo[] = [
  {
    nome: 'Rafael Souza',
    servicos: SERVICOS.map((s) => s.nome),
    // Seg a sex com almoço; sábado só de manhã
    horarios: [
      ...dias(1, 5, 9, 12),
      ...dias(1, 5, 13, 19),
      { diaDaSemana: 6, inicioMin: h(9), fimMin: h(14) },
    ],
  },
  {
    nome: 'Camila Ribeiro',
    servicos: ['Corte', 'Corte e barba', 'Acabamento (pezinho)'],
    // Ter a sáb, entra mais tarde e almoça das 14 às 15
    horarios: [...dias(2, 6, 10, 14), ...dias(2, 6, 15, 20)],
  },
  {
    nome: 'Diego Martins',
    servicos: ['Barba', 'Corte e barba', 'Acabamento (pezinho)'],
    horarios: dias(1, 6, 9, 18),
  },
];

/** Clientes fictícios das reservas de exemplo (o dono visitante vê estes nomes na agenda) */
export const CLIENTES: readonly string[] = [
  'Lucas Almeida',
  'Mariana Costa',
  'Pedro Henrique Lima',
  'Juliana Ferreira',
  'Gabriel Rocha',
  'Beatriz Nunes',
  'Thiago Carvalho',
  'Fernanda Gomes',
];

/** "Pedro Henrique Lima" -> "pedro.henrique.lima" (a parte antes do @ do e-mail) */
export function apelido(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.');
}

export interface BloqueioDeExemplo {
  profissional: string;
  inicio: Date;
  fim: Date;
  motivo: string;
}

export interface ReservaDeExemplo {
  profissional: string;
  servico: string;
  cliente: string;
  inicio: Date;
  fim: Date;
}

/** Quantos dias à frente (contando hoje) a agenda de exemplo ocupa */
export const DIAS_DE_RESERVAS = 7;
/** Em cada horário livre da grade, a chance (em %) de já haver uma reserva */
const OCUPACAO = 35;
const PASSO_MIN = 30;
const MINUTO_MS = 60_000;

/** A folga de exemplo: Diego, daqui a 3 dias, das 14 às 18 */
export function bloqueioDeExemplo(
  agora: Date,
  fuso: string,
): BloqueioDeExemplo {
  const data = maisDias(dataLocal(agora, fuso), 3);
  return {
    profissional: 'Diego Martins',
    inicio: emUtc(data, h(14), fuso),
    fim: emUtc(data, h(18), fuso),
    motivo: 'Consulta médica',
  };
}

/**
 * As reservas de exemplo dos próximos 7 dias, sempre depois de `agora`, dentro do expediente,
 * fora do bloqueio e sem sobrepor outra do mesmo profissional (a restrição de exclusão do
 * banco recusaria). A escolha de cada horário sai de um hash da data e da hora, não de um
 * sorteio: rodar a semeadura duas vezes dá a mesma agenda.
 */
export function reservasDeExemplo(
  agora: Date,
  fuso: string,
  bloqueio: BloqueioDeExemplo,
): ReservaDeExemplo[] {
  const servicos = new Map(SERVICOS.map((s) => [s.nome, s]));
  const hoje = dataLocal(agora, fuso);
  const reservas: ReservaDeExemplo[] = [];
  for (let d = 0; d < DIAS_DE_RESERVAS; d++) {
    const data = maisDias(hoje, d);
    const semana = diaDaSemana(data);
    for (const p of PROFISSIONAIS) {
      for (const intervalo of p.horarios) {
        if (intervalo.diaDaSemana !== semana) continue;
        let minuto = intervalo.inicioMin;
        while (minuto < intervalo.fimMin) {
          const sorte = numeroDe(`${textoDaData(data)}|${p.nome}|${minuto}`);
          const servico = servicos.get(
            p.servicos[sorte.servico % p.servicos.length],
          );
          const inicio = localParaUtc(data, minuto, fuso);
          if (
            servico &&
            inicio &&
            sorte.ocupa < OCUPACAO &&
            minuto + servico.duracaoMin <= intervalo.fimMin
          ) {
            const fim = new Date(
              inicio.getTime() + servico.duracaoMin * MINUTO_MS,
            );
            const noBloqueio =
              bloqueio.profissional === p.nome &&
              inicio < bloqueio.fim &&
              fim > bloqueio.inicio;
            if (inicio > agora && !noBloqueio) {
              reservas.push({
                profissional: p.nome,
                servico: servico.nome,
                cliente: CLIENTES[sorte.cliente % CLIENTES.length],
                inicio,
                fim,
              });
              // A próxima começa quando esta acaba: nunca duas ao mesmo tempo com ele
              minuto += servico.duracaoMin;
              continue;
            }
          }
          minuto += PASSO_MIN;
        }
      }
    }
  }
  return reservas.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Três números estáveis a partir de um texto (o mesmo texto dá sempre os mesmos) */
function numeroDe(texto: string) {
  const bytes = createHash('sha256').update(texto).digest();
  return { ocupa: bytes[0] % 100, servico: bytes[1], cliente: bytes[2] };
}

function maisDias({ ano, mes, dia }: DataLocal, n: number): DataLocal {
  const d = new Date(Date.UTC(ano, mes - 1, dia + n));
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
  };
}

function emUtc(data: DataLocal, minutos: number, fuso: string): Date {
  const instante = localParaUtc(data, minutos, fuso);
  if (!instante) throw new Error(`hora que não existe em ${fuso}`);
  return instante;
}
