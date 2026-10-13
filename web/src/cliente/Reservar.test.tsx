import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFalsa, type PedidoFeito } from '../teste/api-falsa';
import { CLIENTE, DONO, logarComo } from '../teste/render';
import { tempoRealFalso } from '../teste/websocket-falso';
import { Reservar } from './Reservar';
import {
  AGORA,
  disponibilidade,
  instante,
  renderComLocal,
  reserva,
  semLogin,
  VITRINE,
} from './teste-do-cliente';

const HOJE = '2026-10-19';
const ROTA = { rota: '/b/:slug' };
const NO_CORTE = `/b/navalha?servico=s-corte&dia=${HOJE}`;

const DISP = 'GET /negocios/:slug/disponibilidade';
const RESERVAR = 'POST /negocios/:slug/reservas';

/** A busca (?...) de um pedido, como objeto */
const busca = (p: PedidoFeito) =>
  Object.fromEntries(new URL(p.caminho, 'http://x').searchParams);

function preparar(
  rotas: Parameters<typeof apiFalsa>[0] = {},
  livres = ['09:00', '09:15', '10:00'],
  ocupados = ['09:30'],
) {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
  const tr = tempoRealFalso();
  const falsa = apiFalsa({
    'GET /negocios/:slug': { corpo: VITRINE },
    [DISP]: (p) => ({
      corpo: disponibilidade(busca(p).data, livres, ocupados),
    }),
    ...rotas,
  });
  return { tr, falsa };
}

const radio = (nome: string | RegExp) =>
  screen.getByRole('radio', { name: nome });
const achar = (nome: string | RegExp) =>
  screen.findByRole('radio', { name: nome });
const local = () => screen.getByTestId('local').textContent;

describe('Reservar', () => {
  it('endereço que não existe: mensagem amigável', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
    tempoRealFalso();
    apiFalsa({
      'GET /negocios/:slug': {
        status: 404,
        corpo: { message: 'Negócio não encontrado' },
      },
    });
    renderComLocal(<Reservar />, { ...ROTA, caminho: '/b/sumiu' });
    expect(
      await screen.findByRole('heading', {
        name: 'Estabelecimento não encontrado',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Voltar ao início' }),
    ).toBeVisible();
  });

  it('erro de rede na vitrine: mostra e deixa tentar de novo', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
    tempoRealFalso();
    let vezes = 0;
    apiFalsa({
      'GET /negocios/:slug': () => {
        if (vezes++ === 0) throw new TypeError('rede');
        return { corpo: VITRINE };
      },
      [DISP]: { corpo: disponibilidade(HOJE, []) },
    });
    const usuario = userEvent.setup();
    renderComLocal(<Reservar />, { ...ROTA, caminho: '/b/navalha' });
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(
      await screen.findByRole('heading', { name: 'Barbearia Navalha' }),
    ).toBeInTheDocument();
  });

  it('escolhe serviço, profissional e dia (guardados na URL) e mostra livres e ocupados', async () => {
    const { falsa, tr } = preparar();
    const usuario = userEvent.setup();
    renderComLocal(<Reservar />, { ...ROTA, caminho: '/b/navalha' });

    await usuario.click(await achar(/Corte/));
    expect(local()).toBe('/b/navalha?servico=s-corte');
    expect(screen.getByText(/30 min · R\$ 35,00/)).toBeInTheDocument();

    // Grade do dia (hoje, no fuso do negócio)
    expect(await achar('09:00, livre')).toBeEnabled();
    expect(radio('09:30, ocupado')).toBeDisabled();
    expect(screen.getByText('Ocupado')).toBeInTheDocument();
    expect(busca(falsa.pedidos(DISP)[0])).toEqual({
      servicoId: 's-corte',
      data: HOJE,
    });
    const topo = screen.getByText('segunda, 19 de outubro').closest('header')!;
    expect(within(topo).getByText('Barbearia Navalha')).toBeInTheDocument();
    expect(within(topo).getByText('Qualquer profissional')).toBeInTheDocument();
    expect(within(topo).getByText('R$ 35,00')).toBeInTheDocument();

    // Barba só a Bia faz: a Ana nem aparece
    await usuario.click(radio(/Barba/));
    expect(radio('Bia')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Ana' })).toBeNull();
    await usuario.click(radio('Bia'));
    await usuario.click(radio(/terça, 20 de outubro/));
    expect(local()).toBe(
      '/b/navalha?servico=s-barba&profissional=p-bia&dia=2026-10-20',
    );
    await waitFor(() =>
      expect(busca(falsa.pedidos(DISP).at(-1)!)).toEqual({
        servicoId: 's-barba',
        data: '2026-10-20',
        profissionalId: 'p-bia',
      }),
    );

    // Assina o negócio para o tempo real
    tr.atual().abrir();
    expect(tr.atual().enviadas).toContainEqual({
      tipo: 'assinar',
      negocio: 'navalha',
    });
  });

  it('volta ao mesmo lugar pela URL e anda pelas semanas até o fim da janela', async () => {
    const { falsa } = preparar();
    const usuario = userEvent.setup();
    renderComLocal(<Reservar />, {
      ...ROTA,
      caminho: '/b/navalha?servico=s-corte&profissional=p-ana&dia=2026-10-21',
    });
    expect(await achar(/quarta, 21 de outubro/)).toBeChecked();
    expect(radio('Ana')).toBeChecked();
    await waitFor(() =>
      expect(busca(falsa.pedidos(DISP)[0])).toEqual({
        servicoId: 's-corte',
        data: '2026-10-21',
        profissionalId: 'p-ana',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Dias anteriores' }),
    ).toBeDisabled();
    for (let i = 0; i < 8; i++) {
      await usuario.click(
        screen.getByRole('button', { name: 'Próximos dias' }),
      );
    }
    // 19/10 + 60 dias = 18/12, o último
    expect(radio(/sexta, 18 de dezembro/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Próximos dias' }),
    ).toBeDisabled();
  });

  it('sem login, confirmar leva ao login com a volta para o mesmo horário', async () => {
    preparar();
    await semLogin();
    const usuario = userEvent.setup();
    renderComLocal(<Reservar />, { ...ROTA, caminho: NO_CORTE });
    await usuario.click(await achar('09:15, livre'));
    await usuario.click(
      screen.getByRole('button', { name: 'Entrar e confirmar' }),
    );
    const destino = new URL(local()!, 'http://x');
    expect(destino.pathname).toBe('/entrar');
    expect(destino.searchParams.get('volta')).toBe(
      `/b/navalha?servico=s-corte&dia=${HOJE}&hora=09%3A15`,
    );
  });

  it('logado, volta do login com a hora marcada e reserva com Idempotency-Key', async () => {
    const feita = reserva({ inicio: instante(HOJE, '09:15') });
    const { falsa } = preparar({
      [RESERVAR]: { status: 201, corpo: feita },
    });
    logarComo(CLIENTE);
    const usuario = userEvent.setup();
    renderComLocal(<Reservar />, {
      ...ROTA,
      caminho: `${NO_CORTE}&hora=09:15`,
    });
    expect(await achar('09:15, livre')).toBeChecked();
    expect(
      screen.getByText(`segunda, 19 de outubro, 09:15 · Corte · R$ 35,00`),
    ).toBeInTheDocument();
    await usuario.click(
      screen.getByRole('button', { name: 'Confirmar reserva' }),
    );

    const [pedido] = falsa.pedidos(RESERVAR);
    expect(pedido.caminho).toBe('/negocios/navalha/reservas');
    expect(pedido.corpo).toEqual({
      servicoId: 's-corte',
      inicio: instante(HOJE, '09:15'),
    });
    expect(pedido.cabecalhos['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      await screen.findByText('Ponto batido: reserva confirmada'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Barbearia Navalha' }),
    ).toBeInTheDocument();
    expect(screen.getByText('09:15')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('R$ 35,00')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ver minhas reservas' }),
    ).toHaveAttribute('href', '/minhas');
  });

  it('a hora da URL que já foi pega não fica marcada', async () => {
    preparar({}, ['09:00']);
    logarComo(CLIENTE);
    renderComLocal(<Reservar />, {
      ...ROTA,
      caminho: `${NO_CORTE}&hora=09:15`,
    });
    expect(await achar('09:00, livre')).not.toBeChecked();
    expect(
      screen.getByText(
        'O horário 09:15 não está mais livre. Escolha outro horário.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirmar reserva' }),
    ).toBeDisabled();
  });

  it('erro de rede: reenviar usa a mesma chave; trocar o horário gera outra', async () => {
    let vezes = 0;
    const { falsa } = preparar({
      [RESERVAR]: () => {
        vezes++;
        if (vezes <= 2) throw new TypeError('rede');
        return { status: 201, corpo: reserva() };
      },
    });
    logarComo(CLIENTE);
    const usuario = userEvent.setup();
    renderComLocal(<Reservar />, { ...ROTA, caminho: NO_CORTE });
    const confirmar = () =>
      usuario.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

    await usuario.click(await achar('09:00, livre'));
    await confirmar();
    expect(
      await screen.findByText('Sem conexão com o servidor. Tente de novo.'),
    ).toBeInTheDocument();
    await confirmar();
    await screen.findByText('Sem conexão com o servidor. Tente de novo.');
    const [primeiro, segundo] = falsa
      .pedidos(RESERVAR)
      .map((p) => p.cabecalhos['Idempotency-Key']);
    expect(segundo).toBe(primeiro);

    await usuario.click(radio('10:00, livre'));
    await confirmar();
    await screen.findByText('Ponto batido: reserva confirmada');
    const terceiro = falsa.pedidos(RESERVAR)[2];
    expect(terceiro.cabecalhos['Idempotency-Key']).not.toBe(primeiro);
    expect(terceiro.corpo).toMatchObject({ inicio: instante(HOJE, '10:00') });
  });

  it('409: mostra a mensagem, busca de novo e desmarca; a próxima tentativa tem chave nova', async () => {
    let livres = ['09:00', '10:00'];
    let vezes = 0;
    const { falsa } = preparar({
      [DISP]: () => ({ corpo: disponibilidade(HOJE, livres) }),
      [RESERVAR]: () =>
        vezes++ === 0
          ? {
              status: 409,
              corpo: {
                message:
                  'Este horário não está disponível (pode ter acabado de ser reservado); escolha outro',
              },
            }
          : { status: 201, corpo: reserva() },
    });
    logarComo(CLIENTE);
    const usuario = userEvent.setup();
    renderComLocal(<Reservar />, { ...ROTA, caminho: NO_CORTE });
    await usuario.click(await achar('09:00, livre'));
    livres = ['10:00'];
    await usuario.click(
      screen.getByRole('button', { name: 'Confirmar reserva' }),
    );
    expect(
      await screen.findByText(/pode ter acabado de ser reservado/),
    ).toBeInTheDocument();
    await waitFor(() => expect(falsa.pedidos(DISP)).toHaveLength(2));
    expect(
      screen.queryByRole('radio', { name: '09:00, livre' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirmar reserva' }),
    ).toBeDisabled();

    await usuario.click(radio('10:00, livre'));
    await usuario.click(
      screen.getByRole('button', { name: 'Confirmar reserva' }),
    );
    await screen.findByText('Ponto batido: reserva confirmada');
    const [a, b] = falsa.pedidos(RESERVAR);
    expect(b.cabecalhos['Idempotency-Key']).not.toBe(
      a.cabecalhos['Idempotency-Key'],
    );
  });

  it('dono logado vê que precisa entrar como cliente', async () => {
    preparar();
    logarComo(DONO);
    const usuario = userEvent.setup();
    renderComLocal(<Reservar />, { ...ROTA, caminho: NO_CORTE });
    await usuario.click(await achar('09:00, livre'));
    expect(screen.getByText(/Você entrou como estabelecimento/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Confirmar reserva' }),
    ).toBeDisabled();
  });

  describe('tempo real', () => {
    async function montarAoVivo(livresDepois: string[]) {
      let livres = ['09:00', '09:15', '10:00'];
      const preparo = preparar({
        [DISP]: () => ({ corpo: disponibilidade(HOJE, livres, ['09:30']) }),
      });
      logarComo(CLIENTE);
      const usuario = userEvent.setup();
      renderComLocal(<Reservar />, { ...ROTA, caminho: NO_CORTE });
      await achar('09:00, livre');
      preparo.tr.atual().abrir();
      const mudar = () => {
        livres = livresDepois;
      };
      return { ...preparo, usuario, mudar };
    }

    it('o horário que some ganha o contorno por ~1 s e é anunciado', async () => {
      const { tr, falsa, mudar } = await montarAoVivo(['09:00', '10:00']);
      mudar();
      // Outro dia: nada a buscar
      act(() =>
        tr.atual().entregar({
          tipo: 'horarios',
          negocio: 'navalha',
          de: '2026-10-20',
          ate: '2026-10-21',
        }),
      );
      act(() =>
        tr.atual().entregar({
          tipo: 'horarios',
          negocio: 'outro',
          de: HOJE,
          ate: HOJE,
        }),
      );
      expect(falsa.pedidos(DISP)).toHaveLength(1);

      act(() =>
        tr.atual().entregar({
          tipo: 'horarios',
          negocio: 'navalha',
          de: '2026-10-18',
          ate: HOJE,
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('radio', { name: '09:15, livre' }),
        ).not.toBeInTheDocument(),
      );
      expect(falsa.pedidos(DISP)).toHaveLength(2);
      expect(
        screen.getByText('O horário 09:15 não está mais livre.'),
      ).toBeInTheDocument();
      // O que estava escolhido (nada) continua igual; o contorno some sozinho
      await waitFor(() =>
        expect(document.querySelector('.horario--tomado')).toBeNull(),
      );
    });

    it('se era o escolhido, desmarca e avisa', async () => {
      const disp = (livres: string[], ocupados: string[]) =>
        disponibilidade(HOJE, livres, ocupados);
      let resposta = disp(['09:00', '09:15'], []);
      const { tr } = preparar({ [DISP]: () => ({ corpo: resposta }) });
      logarComo(CLIENTE);
      const usuario = userEvent.setup();
      renderComLocal(<Reservar />, { ...ROTA, caminho: NO_CORTE });
      await usuario.click(await achar('09:15, livre'));
      tr.atual().abrir();

      resposta = disp(['09:00'], ['09:15']);
      act(() =>
        tr.atual().entregar({
          tipo: 'horarios',
          negocio: 'navalha',
          de: HOJE,
          ate: HOJE,
        }),
      );
      expect(
        await screen.findByText(
          'Alguém reservou 09:15 antes de você. Escolha outro horário.',
        ),
      ).toBeInTheDocument();
      const ocupado = radio('09:15, ocupado');
      expect(ocupado).toBeDisabled();
      expect(ocupado.closest('.horario')).toHaveClass('horario--tomado');
      expect(
        screen.getByRole('button', { name: 'Confirmar reserva' }),
      ).toBeDisabled();
      expect(screen.getByText('Escolha um horário livre.')).toBeInTheDocument();
      await waitFor(
        () =>
          expect(ocupado.closest('.horario')).not.toHaveClass(
            'horario--tomado',
          ),
        { timeout: 2000 },
      );
    });

    it('catalogo com endereço novo vai para ele (sem empilhar no histórico)', async () => {
      const { tr, falsa } = await montarAoVivo([]);
      act(() =>
        tr.atual().entregar({
          tipo: 'catalogo',
          negocio: 'navalha',
          novoEndereco: 'navalha-centro',
        }),
      );
      await waitFor(() =>
        expect(local()).toBe(`/b/navalha-centro?servico=s-corte&dia=${HOJE}`),
      );
      await waitFor(() =>
        expect(
          falsa.pedidos('GET /negocios/:slug').map((p) => p.caminho),
        ).toContain('/negocios/navalha-centro'),
      );
      await waitFor(() =>
        expect(tr.atual().enviadas).toContainEqual({
          tipo: 'assinar',
          negocio: 'navalha-centro',
        }),
      );
    });

    it('catalogo sem endereço novo e reconectou buscam vitrine e horários de novo', async () => {
      const { tr, falsa } = await montarAoVivo(['09:00']);
      act(() => tr.atual().entregar({ tipo: 'catalogo', negocio: 'navalha' }));
      await waitFor(() => expect(falsa.pedidos(DISP)).toHaveLength(2));
      expect(falsa.pedidos('GET /negocios/:slug')).toHaveLength(2);

      act(() => tr.atual().cair());
      await waitFor(() => expect(tr.conexoes).toHaveLength(2), {
        timeout: 3000,
      });
      act(() => tr.atual().abrir());
      await waitFor(() => expect(falsa.pedidos(DISP)).toHaveLength(3));
      expect(falsa.pedidos('GET /negocios/:slug')).toHaveLength(3);
    });
  });
});
