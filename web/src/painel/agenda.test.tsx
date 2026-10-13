import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ItemDaAgenda } from '../api/tipos';
import { apiFalsa, type PedidoFeito } from '../teste/api-falsa';
import { tempoRealFalso } from '../teste/websocket-falso';
import {
  abrirPainel,
  adiada,
  ANA,
  BRUNO,
  NEGOCIO,
  NEGOCIO_LISBOA,
  reserva,
} from './fixtures';

/** "Agora" fixo (só o Date; os timers continuam de verdade para o Testing Library) */
function agoraEm(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

function periodo(pedido: PedidoFeito | undefined) {
  const busca = new URL(pedido!.caminho, 'http://x').searchParams;
  return { de: busca.get('de'), ate: busca.get('ate') };
}

function api(agenda: ItemDaAgenda[] | (() => unknown), extra = {}) {
  return apiFalsa({
    'GET /negocios': { corpo: [NEGOCIO, NEGOCIO_LISBOA] },
    'GET /negocios/:id/agenda':
      typeof agenda === 'function'
        ? (agenda as () => { corpo: unknown })
        : { corpo: agenda },
    'GET /negocios/:id/profissionais': { corpo: [ANA, BRUNO] },
    ...extra,
  });
}

// Telas inteiras com userEvent: com a suíte toda em paralelo, 5 s (o padrão) fica justo
vi.setConfig({ testTimeout: 15_000 });

describe('agenda do dono', () => {
  beforeEach(() => agoraEm('2026-10-19T12:00:00Z'));

  it('dia: pede o dia inteiro no fuso do negócio e mostra no relógio dele', async () => {
    const falsa = api([
      // 23:30 de 19/10 em São Paulo (já é 20/10 em UTC): é do dia 19
      reserva('r1', '2026-10-20T02:30:00.000Z'),
      // 23:30 de 18/10 em São Paulo (19/10 em UTC): não é do dia 19
      reserva('r0', '2026-10-19T02:30:00.000Z'),
      reserva('r2', '2026-10-19T12:00:00.000Z', {
        status: 'cancelada',
        profissional: { id: 'p2', nome: 'Bruno' },
      }),
    ]);
    abrirPainel('/painel/n1');

    const linha = await screen.findByTestId('reserva-r1');
    expect(within(linha).getByText('23:30–00:00')).toBeInTheDocument();
    expect(within(linha).getByText('Cliente r1')).toBeInTheDocument();
    expect(within(linha).getByText('r1@exemplo.com')).toBeInTheDocument();
    expect(within(linha).getByText('R$ 35,00')).toBeInTheDocument();
    expect(within(linha).getByText('Confirmada')).toBeInTheDocument();
    expect(screen.queryByTestId('reserva-r0')).not.toBeInTheDocument();
    // Cancelada: carimbo, e sem o botão de cancelar
    const cancelada = screen.getByTestId('reserva-r2');
    expect(within(cancelada).getByText('Cancelada')).toHaveClass('carimbo');
    expect(within(cancelada).queryByRole('button')).not.toBeInTheDocument();

    expect(screen.getByText('segunda, 19 de outubro')).toBeInTheDocument();
    expect(periodo(falsa.pedidos('GET /negocios/:id/agenda')[0])).toEqual({
      de: '2026-10-19T03:00:00.000Z',
      ate: '2026-10-20T03:00:00.000Z',
    });
  });

  it('setas e "hoje" andam de dia em dia', async () => {
    const user = userEvent.setup();
    const falsa = api([]);
    abrirPainel('/painel/n1?dia=2026-10-21');
    expect(
      await screen.findByText('quarta, 21 de outubro'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));
    expect(await screen.findByText('terça, 20 de outubro')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próximo dia' }));
    await user.click(screen.getByRole('button', { name: 'Próximo dia' }));
    expect(
      await screen.findByText('quinta, 22 de outubro'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(
      await screen.findByText('segunda, 19 de outubro'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(periodo(falsa.pedidos('GET /negocios/:id/agenda').at(-1))).toEqual(
        {
          de: '2026-10-19T03:00:00.000Z',
          ate: '2026-10-20T03:00:00.000Z',
        },
      ),
    );
  });

  it('"hoje" é o do fuso do negócio, não o do navegador nem o do UTC', async () => {
    // 02:00 UTC de 20/10 ainda é 23:00 de 19/10 em São Paulo
    agoraEm('2026-10-20T02:00:00Z');
    api([]);
    abrirPainel('/painel/n1');
    expect(
      await screen.findByText('segunda, 19 de outubro'),
    ).toBeInTheDocument();
  });

  it('semana: de segunda a domingo, cada reserva no seu dia (inclusive perto da meia-noite UTC)', async () => {
    const user = userEvent.setup();
    const falsa = api([
      // Domingo 25/10, 23:30 em São Paulo = segunda 26/10 em UTC
      reserva('r1', '2026-10-26T02:30:00.000Z'),
      reserva('r2', '2026-10-21T13:00:00.000Z'),
    ]);
    abrirPainel('/painel/n1?dia=2026-10-21');
    await screen.findByTestId('reserva-r2');
    await user.click(screen.getByRole('button', { name: 'Semana' }));
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const domingo = await screen.findByRole('region', {
      name: 'domingo, 25 de outubro',
    });
    expect(within(domingo).getByTestId('reserva-r1')).toBeInTheDocument();
    const quarta = screen.getByRole('region', {
      name: 'quarta, 21 de outubro',
    });
    expect(within(quarta).getByText('10:00–10:30')).toBeInTheDocument();
    const segunda = screen.getByRole('region', {
      name: 'segunda, 19 de outubro',
    });
    expect(within(segunda).getByText('Nenhuma reserva.')).toBeInTheDocument();
    expect(periodo(falsa.pedidos('GET /negocios/:id/agenda').at(-1))).toEqual({
      de: '2026-10-19T03:00:00.000Z',
      ate: '2026-10-26T03:00:00.000Z',
    });
  });

  it('semana em Lisboa que atravessa o fim do horário de verão (25/10)', async () => {
    const falsa = api([
      // 26/10 00:30 UTC = 26/10 00:30 em Lisboa (fora da semana de 19 a 25)
      reserva('fora', '2026-10-26T00:30:00.000Z'),
      // 18/10 23:30 UTC = 19/10 00:30 em Lisboa (+1): é de segunda
      reserva('seg', '2026-10-18T23:30:00.000Z'),
    ]);
    abrirPainel('/painel/n2?visao=semana&dia=2026-10-25');
    const segunda = await screen.findByRole('region', {
      name: 'segunda, 19 de outubro',
    });
    expect(within(segunda).getByText('00:30–01:00')).toBeInTheDocument();
    expect(screen.queryByTestId('reserva-fora')).not.toBeInTheDocument();
    expect(periodo(falsa.pedidos('GET /negocios/:id/agenda')[0])).toEqual({
      de: '2026-10-18T23:00:00.000Z',
      ate: '2026-10-26T00:00:00.000Z',
    });
  });

  it('filtra por profissional', async () => {
    const user = userEvent.setup();
    api([
      reserva('r1', '2026-10-19T12:00:00.000Z'),
      reserva('r2', '2026-10-19T13:00:00.000Z', {
        profissional: { id: 'p2', nome: 'Bruno' },
      }),
    ]);
    abrirPainel('/painel/n1');
    await screen.findByTestId('reserva-r2');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Profissional' }),
      'Bruno',
    );
    expect(screen.queryByTestId('reserva-r1')).not.toBeInTheDocument();
    expect(screen.getByTestId('reserva-r2')).toBeInTheDocument();
  });

  it('cancelar: pergunta antes, manda o pedido e mostra o carimbo', async () => {
    const user = userEvent.setup();
    const r1 = reserva('r1', '2026-10-19T18:00:00.000Z');
    const falsa = api([r1], {
      'POST /reservas/:id/cancelar': {
        corpo: { ...r1, negocio: NEGOCIO, status: 'cancelada' },
      },
    });
    abrirPainel('/painel/n1');
    await user.click(
      await screen.findByRole('button', {
        name: 'Cancelar a reserva das 15:00 de Cliente r1',
      }),
    );
    const pergunta = screen.getByRole('alertdialog', {
      name: 'Cancelar a reserva das 15:00 de Cliente r1? O horário volta a ficar livre.',
    });
    // O foco vai para a saída segura
    expect(
      within(pergunta).getByRole('button', { name: 'Voltar' }),
    ).toHaveFocus();
    expect(falsa.pedidos('POST /reservas/:id/cancelar')).toHaveLength(0);

    await user.click(
      within(pergunta).getByRole('button', { name: 'Sim, cancelar' }),
    );
    const linha = screen.getByTestId('reserva-r1');
    expect(await within(linha).findByText('Cancelada')).toHaveClass('carimbo');
    expect(falsa.pedidos('POST /reservas/:id/cancelar')[0].caminho).toBe(
      '/reservas/r1/cancelar',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reserva das 15:00 de Cliente r1 cancelada.',
    );
  });

  it('cancelar recusado (4xx): mostra a mensagem do servidor', async () => {
    const user = userEvent.setup();
    api([reserva('r1', '2026-10-19T18:00:00.000Z')], {
      'POST /reservas/:id/cancelar': {
        status: 422,
        corpo: {
          message:
            'O atendimento já começou ou passou; não dá mais para cancelar',
        },
      },
    });
    abrirPainel('/painel/n1');
    await user.click(
      await screen.findByRole('button', {
        name: /Cancelar a reserva das 15:00/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O atendimento já começou ou passou; não dá mais para cancelar',
    );
    expect(
      within(screen.getByTestId('reserva-r1')).getByText('Confirmada'),
    ).toBeInTheDocument();
  });

  it('ao vivo: busca de novo sem tirar a lista e destaca a reserva que chegou', async () => {
    const tr = tempoRealFalso();
    let lista = [reserva('r1', '2026-10-19T12:00:00.000Z')];
    let lenta: ReturnType<typeof adiada<void>> | null = null;
    const falsa = api(async () => {
      if (lenta) await lenta.promessa;
      return { corpo: lista };
    });
    abrirPainel('/painel/n1');
    await screen.findByTestId('reserva-r1');
    act(() => tr.atual().abrir());
    expect(tr.atual().enviadas).toContainEqual({
      tipo: 'assinar',
      negocio: 'barbearia',
    });
    const antes = falsa.pedidos('GET /negocios/:id/agenda').length;

    // Um dia fora do período mostrado: nada a buscar
    act(() =>
      tr.atual().entregar({
        tipo: 'horarios',
        negocio: 'barbearia',
        de: '2026-10-25',
        ate: '2026-10-25',
      }),
    );
    // De outro negócio também não
    act(() =>
      tr.atual().entregar({
        tipo: 'horarios',
        negocio: 'outro',
        de: '2026-10-19',
        ate: '2026-10-19',
      }),
    );
    expect(falsa.pedidos('GET /negocios/:id/agenda')).toHaveLength(antes);

    lenta = adiada<void>();
    lista = [...lista, reserva('r2', '2026-10-19T13:00:00.000Z')];
    act(() =>
      tr.atual().entregar({
        tipo: 'horarios',
        negocio: 'barbearia',
        de: '2026-10-19',
        ate: '2026-10-19',
      }),
    );
    await waitFor(() =>
      expect(falsa.pedidos('GET /negocios/:id/agenda')).toHaveLength(antes + 1),
    );
    // Enquanto a resposta não chega, a lista continua na tela
    expect(screen.getByTestId('reserva-r1')).toBeInTheDocument();
    expect(screen.getByText('· atualizando…')).toBeInTheDocument();
    await act(async () => lenta!.resolver());

    const nova = await screen.findByTestId('reserva-r2');
    expect(nova).toHaveClass('reserva--nova');
    expect(within(nova).getByText('Nova')).toBeInTheDocument();
    expect(screen.getByTestId('reserva-r1')).not.toHaveClass('reserva--nova');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nova reserva às 10:00.',
    );
    // O destaque some sozinho
    await waitFor(() => expect(nova).not.toHaveClass('reserva--nova'), {
      timeout: 3000,
    });
  });

  it('ao vivo: catálogo mudou ou a conexão voltou também busca de novo', async () => {
    const tr = tempoRealFalso();
    const falsa = api([]);
    abrirPainel('/painel/n1');
    await screen.findByText('Nenhuma reserva.');
    act(() => tr.atual().abrir());
    const antes = falsa.pedidos('GET /negocios/:id/agenda').length;
    act(() => tr.atual().entregar({ tipo: 'catalogo', negocio: 'barbearia' }));
    await waitFor(() =>
      expect(falsa.pedidos('GET /negocios/:id/agenda')).toHaveLength(antes + 1),
    );
    act(() => tr.atual().cair());
    // A volta é com espera sorteada: aqui, o teste abre a conexão nova na mão
    await waitFor(() => expect(tr.conexoes).toHaveLength(2), { timeout: 3000 });
    act(() => tr.atual().abrir());
    await waitFor(() =>
      expect(falsa.pedidos('GET /negocios/:id/agenda')).toHaveLength(antes + 2),
    );
  });
});
