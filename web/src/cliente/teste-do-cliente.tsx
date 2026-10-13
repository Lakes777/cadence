import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { renovar } from '../api/sessao';
import type { Aviso, Reserva, Vitrine } from '../api/tipos';
import type { DisponibilidadeDoDia } from './dados';

/** Mostra onde o navegador está (para conferir a URL depois de navegar) */
function Local() {
  const local = useLocation();
  return <output data-testid="local">{local.pathname + local.search}</output>;
}

/** Como renderNaRota, mas com a URL atual sempre visível em data-testid="local" */
export function renderComLocal(
  tela: ReactElement,
  { rota = '/', caminho = '/' }: { rota?: string; caminho?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route
          path={rota}
          element={
            <>
              {tela}
              <Local />
            </>
          }
        />
        <Route path="*" element={<Local />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Termina a recuperação da sessão sem login (a API falsa responde 404 ao /auth/renovar) */
export async function semLogin(): Promise<void> {
  await renovar();
}

export const FUSO = 'America/Sao_Paulo';
/** Segunda, 19/10/2026, 08:00 em São Paulo */
export const AGORA = new Date('2026-10-19T08:00:00-03:00');

export const VITRINE: Vitrine = {
  nome: 'Barbearia Navalha',
  slug: 'navalha',
  fuso: FUSO,
  profissionais: [
    { id: 'p-ana', nome: 'Ana' },
    { id: 'p-bia', nome: 'Bia' },
  ],
  servicos: [
    {
      id: 's-corte',
      nome: 'Corte',
      duracaoMin: 30,
      precoCentavos: 3500,
      profissionalIds: ['p-ana', 'p-bia'],
    },
    {
      id: 's-barba',
      nome: 'Barba',
      duracaoMin: 60,
      precoCentavos: 2500,
      profissionalIds: ['p-bia'],
    },
  ],
};

/** "09:30" de um dia em São Paulo, como ISO em UTC */
export const instante = (dia: string, hora: string) =>
  new Date(`${dia}T${hora}:00-03:00`).toISOString();

const mais30 = (iso: string) =>
  new Date(Date.parse(iso) + 30 * 60_000).toISOString();

/** Disponibilidade do Corte num dia, com as horas livres e as ocupadas */
export function disponibilidade(
  dia: string,
  livres: string[],
  ocupados: string[] = [],
): DisponibilidadeDoDia {
  return {
    data: dia,
    fuso: FUSO,
    servico: { id: 's-corte', nome: 'Corte', duracaoMin: 30 },
    horarios: livres.map((hora) => ({
      inicio: instante(dia, hora),
      fim: mais30(instante(dia, hora)),
      hora,
      profissionalIds: ['p-ana'],
    })),
    ocupados: ocupados.map((hora) => ({
      inicio: instante(dia, hora),
      fim: mais30(instante(dia, hora)),
      hora,
    })),
  };
}

export function reserva(mudanca: Partial<Reserva> = {}): Reserva {
  const inicio = mudanca.inicio ?? instante('2026-10-20', '10:00');
  return {
    id: 'r1',
    negocio: { nome: 'Barbearia Navalha', slug: 'navalha', fuso: FUSO },
    servico: { id: 's-corte', nome: 'Corte' },
    profissional: { id: 'p-ana', nome: 'Ana' },
    inicio,
    fim: mais30(inicio),
    precoCentavos: 3500,
    status: 'confirmada',
    ...mudanca,
  };
}

export function aviso(mudanca: Partial<Aviso> = {}): Aviso {
  return {
    id: 'a1',
    tipo: 'lembrete',
    texto: 'Lembrete: Corte amanhã às 10:00 na Barbearia Navalha.',
    reservaId: 'r1',
    reservaCancelada: false,
    criadoEm: '2026-10-19T13:00:00.000Z',
    lidoEm: null,
    ...mudanca,
  };
}
