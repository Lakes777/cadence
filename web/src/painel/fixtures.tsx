import type {
  ItemDaAgenda,
  Negocio,
  Profissional,
  Servico,
} from '../api/tipos';
import { DONO, logarComo, renderNaRota } from '../teste/render';
import { Painel } from './Painel';

/** Só para os testes do painel */

export const NEGOCIO: Negocio = {
  id: 'n1',
  nome: 'Barbearia Exemplo',
  slug: 'barbearia',
  fuso: 'America/Sao_Paulo',
};

export const NEGOCIO_LISBOA: Negocio = {
  id: 'n2',
  nome: 'Estúdio Lisboa',
  slug: 'estudio-lisboa',
  fuso: 'Europe/Lisbon',
};

export const ANA: Profissional = {
  id: 'p1',
  nome: 'Ana',
  ativo: true,
  servicoIds: ['s1'],
  horarios: [{ diaDaSemana: 1, inicio: '09:00', fim: '12:00' }],
};

export const BRUNO: Profissional = {
  id: 'p2',
  nome: 'Bruno',
  ativo: true,
  servicoIds: [],
  horarios: [],
};

export const CORTE: Servico = {
  id: 's1',
  nome: 'Corte',
  duracaoMin: 30,
  precoCentavos: 3500,
  ativo: true,
};

export function reserva(
  id: string,
  inicio: string,
  extra: Partial<ItemDaAgenda> = {},
): ItemDaAgenda {
  const fim = new Date(new Date(inicio).getTime() + 30 * 60_000).toISOString();
  return {
    id,
    servico: { id: 's1', nome: 'Corte' },
    profissional: { id: 'p1', nome: 'Ana' },
    inicio,
    fim,
    precoCentavos: 3500,
    status: 'confirmada',
    cliente: { nome: `Cliente ${id}`, email: `${id}@exemplo.com` },
    ...extra,
  };
}

/** Logado como dono, no caminho dado (ex.: "/painel/n1?dia=2026-10-19") */
export function abrirPainel(caminho: string) {
  logarComo(DONO);
  return renderNaRota(<Painel />, { rota: '/painel/*', caminho });
}

/** Uma promessa que o teste resolve quando quiser (resposta "lenta" do servidor) */
export function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}
