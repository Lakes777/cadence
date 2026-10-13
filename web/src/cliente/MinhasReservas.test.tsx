import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Reserva } from '../api/tipos';
import { apiFalsa } from '../teste/api-falsa';
import { CLIENTE, logarComo } from '../teste/render';
import { tempoRealFalso } from '../teste/websocket-falso';
import { MinhasReservas } from './MinhasReservas';
import {
  AGORA,
  aviso,
  instante,
  renderComLocal,
  reserva,
} from './teste-do-cliente';

const PROXIMA = reserva();
const DEPOIS = reserva({
  id: 'r2',
  inicio: instante('2026-10-22', '15:00'),
  servico: { id: 's-barba', nome: 'Barba' },
  profissional: { id: 'p-bia', nome: 'Bia' },
  precoCentavos: 2500,
});
const ANTIGA = reserva({
  id: 'r0',
  inicio: instante('2026-10-01', '11:00'),
  status: 'cancelada',
});

function preparar(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
  const tr = tempoRealFalso();
  const falsa = apiFalsa({
    'GET /reservas': (p) => ({
      corpo: p.caminho.includes('anteriores') ? [ANTIGA] : [PROXIMA, DEPOIS],
    }),
    'GET /avisos': { corpo: [] },
    ...rotas,
  });
  logarComo(CLIENTE);
  renderComLocal(<MinhasReservas />, { rota: '/minhas', caminho: '/minhas' });
  return { tr, falsa, usuario: userEvent.setup() };
}

const cartao = (servico: string) =>
  screen.getByText(servico, { selector: 'dd' }).closest('article')!;

describe('MinhasReservas', () => {
  it('lista as próximas como cartões de ponto, com data e hora no fuso do negócio', async () => {
    const { falsa } = preparar();
    const corte = (
      await screen.findByText('Corte', { selector: 'dd' })
    ).closest('article')!;
    expect(
      within(corte).getByRole('heading', { name: 'Barbearia Navalha' }),
    ).toBeInTheDocument();
    expect(within(corte).getByText('terça, 20 de outubro')).toBeInTheDocument();
    expect(within(corte).getByText('10:00')).toBeInTheDocument();
    expect(within(corte).getByText('Ana')).toBeInTheDocument();
    expect(within(corte).getByText('R$ 35,00')).toBeInTheDocument();
    expect(within(corte).getByText('Confirmada')).toBeInTheDocument();
    expect(falsa.pedidos('GET /reservas')[0].caminho).toBe(
      '/reservas?periodo=proximas',
    );
    expect(screen.getByRole('tab', { name: 'Próximas' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('aba Anteriores (também pelas setas) mostra a cancelada com o carimbo, sem cancelar', async () => {
    const { falsa, usuario } = preparar();
    await screen.findByText('Barba', { selector: 'dd' });
    screen.getByRole('tab', { name: 'Próximas' }).focus();
    await usuario.keyboard('{ArrowRight}');
    const anteriores = screen.getByRole('tab', { name: 'Anteriores' });
    expect(anteriores).toHaveFocus();
    expect(anteriores).toHaveAttribute('aria-selected', 'true');
    const antiga = (
      await screen.findByText('Cancelada', { selector: 'dd' })
    ).closest('article')!;
    expect(within(antiga).getAllByText('Cancelada')).toHaveLength(2);
    expect(
      within(antiga).queryByRole('button', { name: 'Cancelar reserva' }),
    ).toBeNull();
    expect(falsa.pedidos('GET /reservas').at(-1)!.caminho).toBe(
      '/reservas?periodo=anteriores',
    );
  });

  it('cancela com confirmação; o 422 do servidor aparece como veio', async () => {
    let vezes = 0;
    const { falsa, usuario } = preparar({
      'POST /reservas/:id/cancelar': () =>
        vezes++ === 0
          ? {
              status: 422,
              corpo: {
                message:
                  'Pela internet, só dá para cancelar até 2 h antes; fale com o estabelecimento',
              },
            }
          : { corpo: { ...PROXIMA, status: 'cancelada' } },
    });
    await screen.findByText('Corte', { selector: 'dd' });
    const corte = cartao('Corte');
    await usuario.click(
      within(corte).getByRole('button', { name: 'Cancelar reserva' }),
    );
    expect(within(corte).getByText(/Cancelar esta reserva\?/)).toBeVisible();
    await usuario.click(
      within(corte).getByRole('button', { name: 'Sim, cancelar' }),
    );
    expect(await within(corte).findByRole('alert')).toHaveTextContent(
      'só dá para cancelar até 2 h antes',
    );

    await usuario.click(
      within(corte).getByRole('button', { name: 'Sim, cancelar' }),
    );
    await waitFor(() =>
      expect(within(corte).getAllByText('Cancelada')).toHaveLength(2),
    );
    expect(falsa.pedidos('POST /reservas/:id/cancelar')[0].caminho).toBe(
      '/reservas/r1/cancelar',
    );
    expect(
      within(corte).queryByRole('button', { name: /cancelar/i }),
    ).toBeNull();
  });

  it('"Não, manter" desiste sem chamar o servidor', async () => {
    const { falsa, usuario } = preparar();
    await screen.findByText('Corte', { selector: 'dd' });
    const corte = cartao('Corte');
    await usuario.click(
      within(corte).getByRole('button', { name: 'Cancelar reserva' }),
    );
    await usuario.click(
      within(corte).getByRole('button', { name: 'Não, manter' }),
    );
    expect(
      within(corte).getByRole('button', { name: 'Cancelar reserva' }),
    ).toBeVisible();
    expect(falsa.pedidos('POST /reservas/:id/cancelar')).toHaveLength(0);
  });

  it('avisos: destaca os não lidos, marca como lido e mostra a reserva cancelada', async () => {
    const { falsa, usuario } = preparar({
      'GET /avisos': {
        corpo: [
          aviso(),
          aviso({
            id: 'a0',
            texto: 'Lembrete: Barba antiga.',
            reservaId: 'r0',
            reservaCancelada: true,
            lidoEm: '2026-10-01T10:00:00.000Z',
          }),
        ],
      },
      'POST /avisos/:id/lido': {
        corpo: aviso({ lidoEm: '2026-10-19T11:00:00.000Z' }),
      },
    });
    const avisos = screen.getByRole('complementary', { name: /Avisos/ });
    expect(await within(avisos).findByText('1 não lido')).toBeInTheDocument();
    const novo = within(avisos)
      .getByText(/Corte amanhã/)
      .closest('li')!;
    expect(novo).toHaveClass('aviso-item--novo');
    expect(
      within(avisos).getByText('Esta reserva foi cancelada depois.'),
    ).toBeInTheDocument();

    await usuario.click(
      within(novo).getByRole('button', { name: 'Marcar como lido' }),
    );
    await waitFor(() => expect(novo).not.toHaveClass('aviso-item--novo'));
    expect(within(avisos).queryByText('1 não lido')).toBeNull();
    expect(falsa.pedidos('POST /avisos/:id/lido')[0].caminho).toBe(
      '/avisos/a1/lido',
    );
  });

  it('erro ao buscar: mostra e tenta de novo', async () => {
    let vezes = 0;
    const { usuario } = preparar({
      'GET /reservas': () => {
        if (vezes++ === 0) throw new TypeError('rede');
        return { corpo: [PROXIMA] };
      },
    });
    const painel = screen.getByRole('tabpanel');
    expect(
      await within(painel).findByText(/Sem conexão com o servidor/),
    ).toBeVisible();
    await usuario.click(
      within(painel).getByRole('button', { name: 'Tentar de novo' }),
    );
    expect(
      await screen.findByText('Corte', { selector: 'dd' }),
    ).toBeInTheDocument();
  });

  describe('tempo real', () => {
    it('reserva nova entra na ordem; cancelada atualiza o cartão e o aviso', async () => {
      const { tr } = preparar({ 'GET /avisos': { corpo: [aviso()] } });
      await screen.findByText('Barba', { selector: 'dd' });
      await screen.findByText(/Corte amanhã/);
      tr.atual().abrir();

      const nova: Reserva = reserva({
        id: 'r3',
        inicio: instante('2026-10-21', '09:00'),
        servico: { id: 's-luzes', nome: 'Luzes' },
      });
      act(() => tr.atual().entregar({ tipo: 'reserva', reserva: nova }));
      const servicos = await screen.findAllByText(/^(Corte|Luzes|Barba)$/, {
        selector: 'dd',
      });
      expect(servicos.map((s) => s.textContent)).toEqual([
        'Corte',
        'Luzes',
        'Barba',
      ]);
      expect(
        screen.getByText('Nova reserva: Luzes em Barbearia Navalha.'),
      ).toBeInTheDocument();

      act(() =>
        tr.atual().entregar({
          tipo: 'reserva',
          reserva: { ...PROXIMA, status: 'cancelada' },
        }),
      );
      await waitFor(() =>
        expect(within(cartao('Corte')).getAllByText('Cancelada')).toHaveLength(
          2,
        ),
      );
      expect(
        screen.getByText('Esta reserva foi cancelada depois.'),
      ).toBeInTheDocument();
    });

    it('aviso chega na hora; reconectou busca de novo', async () => {
      const { tr, falsa } = preparar();
      await screen.findByText('Corte', { selector: 'dd' });
      tr.atual().abrir();
      act(() =>
        tr.atual().entregar({
          tipo: 'aviso',
          aviso: aviso({ id: 'a9', texto: 'Lembrete: Barba amanhã.' }),
        }),
      );
      expect(
        await screen.findByText('Lembrete: Barba amanhã.', {
          selector: '.aviso-item__texto',
        }),
      ).toBeInTheDocument();
      expect(screen.getByText('1 não lido')).toBeInTheDocument();

      act(() => tr.atual().cair());
      await waitFor(() => expect(tr.conexoes).toHaveLength(2), {
        timeout: 3000,
      });
      act(() => tr.atual().abrir());
      await waitFor(() =>
        expect(falsa.pedidos('GET /reservas')).toHaveLength(2),
      );
      expect(falsa.pedidos('GET /avisos')).toHaveLength(2);
    });
  });
});
