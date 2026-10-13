import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Profissional } from '../api/tipos';
import { apiFalsa } from '../teste/api-falsa';
import {
  abrirPainel,
  ANA,
  BRUNO,
  CORTE,
  NEGOCIO,
  NEGOCIO_LISBOA,
} from './fixtures';

const BASE = {
  'GET /negocios': { corpo: [NEGOCIO, NEGOCIO_LISBOA] },
  'GET /negocios/:id/profissionais': { corpo: [ANA, BRUNO] },
  'GET /negocios/:id/servicos': { corpo: [CORTE] },
};

// Telas inteiras com userEvent: com a suíte toda em paralelo, 5 s (o padrão) fica justo
vi.setConfig({ testTimeout: 15_000 });

describe('profissionais', () => {
  it('cria, renomeia e desativa', async () => {
    const user = userEvent.setup();
    let ana = ANA;
    const falsa = apiFalsa({
      ...BASE,
      'POST /negocios/:id/profissionais': (p) => ({
        status: 201,
        corpo: { ...BRUNO, id: 'p3', nome: (p.corpo as { nome: string }).nome },
      }),
      'PATCH /negocios/:id/profissionais/:pid': (p) => {
        ana = { ...ana, ...(p.corpo as object) };
        return { corpo: ana };
      },
    });
    abrirPainel('/painel/n1/profissionais');

    await user.type(
      await screen.findByRole('textbox', { name: /^Novo profissional/ }),
      'Carla',
    );
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(
      await screen.findByRole('heading', { name: 'Carla' }),
    ).toBeInTheDocument();
    expect(falsa.pedidos('POST /negocios/:id/profissionais')[0]).toMatchObject({
      caminho: '/negocios/n1/profissionais',
      corpo: { nome: 'Carla' },
    });

    await user.click(screen.getByRole('button', { name: 'Renomear Ana' }));
    const campo = screen.getByRole('textbox', { name: /^Novo nome de Ana/ });
    await user.clear(campo);
    await user.type(campo, 'Ana Paula');
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(
      await screen.findByRole('heading', { name: 'Ana Paula' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Desativar Ana Paula' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Ativar Ana Paula' }),
    ).toBeInTheDocument();
    expect(
      falsa
        .pedidos('PATCH /negocios/:id/profissionais/:pid')
        .map((p) => p.corpo),
    ).toEqual([{ nome: 'Ana Paula' }, { ativo: false }]);
  });

  it('serviços que faz: manda a lista inteira no PUT', async () => {
    const user = userEvent.setup();
    const barba = { ...CORTE, id: 's2', nome: 'Barba' };
    const falsa = apiFalsa({
      ...BASE,
      'GET /negocios/:id/servicos': { corpo: [CORTE, barba] },
      'PUT /negocios/:id/profissionais/:pid/servicos': (p) => ({
        corpo: { ...ANA, ...(p.corpo as object) },
      }),
    });
    abrirPainel('/painel/n1/profissionais');
    const ana = await screen.findByRole('article', { name: 'Ana' });
    await user.click(within(ana).getByText('Serviços que faz (1)'));
    expect(within(ana).getByRole('checkbox', { name: 'Corte' })).toBeChecked();
    await user.click(within(ana).getByRole('checkbox', { name: 'Barba' }));
    await user.click(
      within(ana).getByRole('button', { name: 'Salvar serviços' }),
    );
    expect(
      await within(ana).findByText('Serviços salvos.'),
    ).toBeInTheDocument();
    expect(
      falsa.pedidos('PUT /negocios/:id/profissionais/:pid/servicos')[0],
    ).toMatchObject({
      caminho: '/negocios/n1/profissionais/p1/servicos',
      corpo: { servicoIds: ['s1', 's2'] },
    });
    expect(within(ana).getByText('Serviços que faz (2)')).toBeInTheDocument();
  });

  it('horário semanal: monta a semana, copia para os dias úteis e manda o PUT certo', async () => {
    const user = userEvent.setup();
    const falsa = apiFalsa({
      ...BASE,
      'PUT /negocios/:id/profissionais/:pid/horarios': (p) => ({
        corpo: { ...ANA, ...(p.corpo as Pick<Profissional, 'horarios'>) },
      }),
    });
    abrirPainel('/painel/n1/profissionais');
    const ana = await screen.findByRole('article', { name: 'Ana' });
    await user.click(within(ana).getByText('Horário semanal'));

    expect(
      within(ana).getByRole('textbox', {
        name: 'Início do 1º intervalo de segunda',
      }),
    ).toHaveValue('09:00');
    // Segundo intervalo na segunda: começa onde o primeiro acabou
    await user.click(
      within(ana).getByRole('button', {
        name: 'Adicionar intervalo na segunda',
      }),
    );
    const inicio2 = within(ana).getByRole('textbox', {
      name: 'Início do 2º intervalo de segunda',
    });
    expect(inicio2).toHaveValue('12:00');
    await user.clear(inicio2);
    await user.type(inicio2, '13:00');
    await user.type(
      within(ana).getByRole('textbox', {
        name: 'Fim do 2º intervalo de segunda',
      }),
      '18:00',
    );
    await user.click(
      within(ana).getByRole('button', {
        name: 'Copiar segunda para os outros dias úteis',
      }),
    );
    // Sábado de manhã, e a sexta só até o almoço
    await user.click(
      within(ana).getByRole('button', {
        name: 'Adicionar intervalo no sábado',
      }),
    );
    await user.click(
      within(ana).getByRole('button', {
        name: 'Remover o 2º intervalo de sexta',
      }),
    );
    await user.click(
      within(ana).getByRole('button', { name: 'Salvar horário' }),
    );

    expect(await within(ana).findByText('Horário salvo.')).toBeInTheDocument();
    const manha = { inicio: '09:00', fim: '12:00' };
    const tarde = { inicio: '13:00', fim: '18:00' };
    expect(
      falsa.pedidos('PUT /negocios/:id/profissionais/:pid/horarios')[0],
    ).toMatchObject({
      caminho: '/negocios/n1/profissionais/p1/horarios',
      corpo: {
        horarios: [
          { diaDaSemana: 1, ...manha },
          { diaDaSemana: 1, ...tarde },
          { diaDaSemana: 2, ...manha },
          { diaDaSemana: 2, ...tarde },
          { diaDaSemana: 3, ...manha },
          { diaDaSemana: 3, ...tarde },
          { diaDaSemana: 4, ...manha },
          { diaDaSemana: 4, ...tarde },
          { diaDaSemana: 5, ...manha },
          { diaDaSemana: 6, inicio: '09:00', fim: '18:00' },
        ],
      },
    });
  });

  it('horário semanal: o erro do servidor aparece no intervalo dele', async () => {
    const user = userEvent.setup();
    apiFalsa({
      ...BASE,
      'PUT /negocios/:id/profissionais/:pid/horarios': {
        status: 400,
        corpo: {
          message: 'Dados inválidos',
          erros: [
            {
              campo: 'horarios.1',
              mensagem: 'Este intervalo se sobrepõe ao da posição 0',
            },
          ],
        },
      },
    });
    abrirPainel('/painel/n1/profissionais');
    const ana = await screen.findByRole('article', { name: 'Ana' });
    await user.click(within(ana).getByText('Horário semanal'));
    await user.click(
      within(ana).getByRole('button', {
        name: 'Adicionar intervalo na segunda',
      }),
    );
    const inicio2 = within(ana).getByRole('textbox', {
      name: 'Início do 2º intervalo de segunda',
    });
    await user.clear(inicio2);
    await user.type(inicio2, '11:00');
    await user.type(
      within(ana).getByRole('textbox', {
        name: 'Fim do 2º intervalo de segunda',
      }),
      '14:00',
    );
    await user.click(
      within(ana).getByRole('button', { name: 'Salvar horário' }),
    );

    expect(await within(ana).findByRole('alert')).toHaveTextContent(
      'Confira os intervalos marcados.',
    );
    expect(inicio2).toHaveAttribute('aria-invalid', 'true');
    expect(inicio2).toHaveAccessibleDescription(
      'Este intervalo se sobrepõe ao 1º intervalo de segunda',
    );
    expect(
      within(ana).getByRole('textbox', {
        name: 'Início do 1º intervalo de segunda',
      }),
    ).not.toHaveAttribute('aria-invalid');
  });
});

describe('serviços', () => {
  it('cria com o preço em reais convertido para centavos', async () => {
    const user = userEvent.setup();
    const falsa = apiFalsa({
      ...BASE,
      'GET /negocios/:id/servicos': { corpo: [] },
      'POST /negocios/:id/servicos': (p) => ({
        status: 201,
        corpo: { id: 's9', ativo: true, ...(p.corpo as object) },
      }),
    });
    abrirPainel('/painel/n1/servicos');
    expect(await screen.findByText(/Nenhum serviço ainda/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /^Nome/ }), 'Barba');
    const duracao = screen.getByRole('spinbutton', { name: /^Duração/ });
    await user.clear(duracao);
    await user.type(duracao, '45');
    const preco = screen.getByRole('textbox', { name: /^Preço/ });
    // Preço que não é dinheiro: nem manda
    await user.type(preco, 'trinta');
    await user.click(screen.getByRole('button', { name: 'Criar serviço' }));
    expect(preco).toHaveAccessibleDescription(
      'Digite o preço em reais, como 35,00',
    );
    expect(falsa.pedidos('POST /negocios/:id/servicos')).toHaveLength(0);

    await user.clear(preco);
    // 0,29 * 100 em ponto flutuante dá 28,999...; aqui tem que dar 29
    await user.type(preco, '0,29');
    await user.click(screen.getByRole('button', { name: 'Criar serviço' }));
    const linha = await screen.findByRole('row', { name: /Barba/ });
    expect(within(linha).getByText('R$ 0,29')).toBeInTheDocument();
    expect(within(linha).getByText('45 min')).toBeInTheDocument();
    expect(falsa.pedidos('POST /negocios/:id/servicos')[0].corpo).toEqual({
      nome: 'Barba',
      duracaoMin: 45,
      precoCentavos: 29,
    });
  });

  it('edita (o preço volta como 35,00) e mostra o erro do campo', async () => {
    const user = userEvent.setup();
    let tentativa = 0;
    const falsa = apiFalsa({
      ...BASE,
      'PATCH /negocios/:id/servicos/:sid': (p) =>
        ++tentativa === 1
          ? {
              status: 400,
              corpo: {
                message: 'Dados inválidos',
                erros: [
                  {
                    campo: 'duracaoMin',
                    mensagem: 'A duração precisa ser múltipla de 5 minutos',
                  },
                ],
              },
            }
          : { corpo: { ...CORTE, ...(p.corpo as object) } },
    });
    abrirPainel('/painel/n1/servicos');
    await user.click(
      await screen.findByRole('button', { name: 'Editar Corte' }),
    );
    const preco = screen.getByRole('textbox', { name: /^Preço/ });
    expect(preco).toHaveValue('35,00');
    const duracao = screen.getByRole('spinbutton', { name: /^Duração/ });
    await user.clear(duracao);
    await user.type(duracao, '33');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(duracao).toHaveAccessibleDescription(
      'A duração precisa ser múltipla de 5 minutos',
    );

    await user.clear(duracao);
    await user.type(duracao, '40');
    await user.clear(preco);
    await user.type(preco, '1.234,50');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('R$ 1.234,50')).toBeInTheDocument();
    expect(falsa.pedidos('PATCH /negocios/:id/servicos/:sid')[1]).toMatchObject(
      {
        caminho: '/negocios/n1/servicos/s1',
        corpo: { nome: 'Corte', duracaoMin: 40, precoCentavos: 123450 },
      },
    );
  });

  it('desativa e ativa', async () => {
    const user = userEvent.setup();
    const falsa = apiFalsa({
      ...BASE,
      'PATCH /negocios/:id/servicos/:sid': (p) => ({
        corpo: { ...CORTE, ...(p.corpo as object) },
      }),
    });
    abrirPainel('/painel/n1/servicos');
    await user.click(
      await screen.findByRole('button', { name: 'Desativar Corte' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Ativar Corte' }),
    ).toBeInTheDocument();
    expect(falsa.pedidos('PATCH /negocios/:id/servicos/:sid')[0].corpo).toEqual(
      {
        ativo: false,
      },
    );
  });
});

describe('bloqueios', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'));
  });

  function preencher(rotulo: RegExp, valor: string) {
    fireEvent.change(screen.getByLabelText(rotulo), {
      target: { value: valor },
    });
  }

  it('lista o período no fuso do negócio e cria com a hora convertida (Lisboa, verão)', async () => {
    const user = userEvent.setup();
    const falsa = apiFalsa({
      ...BASE,
      'GET /negocios/:id/bloqueios': {
        corpo: [
          {
            id: 'b1',
            profissionalId: null,
            inicio: '2026-04-10T23:00:00.000Z',
            fim: '2026-04-11T23:00:00.000Z',
            motivo: 'Feriado',
          },
        ],
      },
      'POST /negocios/:id/bloqueios': (p) => ({
        status: 201,
        corpo: {
          id: 'b2',
          motivo: null,
          profissionalId: null,
          ...(p.corpo as object),
        },
      }),
    });
    abrirPainel('/painel/n2/bloqueios');

    // 23:00 UTC em abril é meia-noite em Lisboa (+1)
    const linha = await screen.findByRole('row', { name: /Feriado/ });
    expect(within(linha).getByText('Negócio todo')).toBeInTheDocument();
    expect(within(linha).getByText('11/04/2026 00:00')).toBeInTheDocument();
    expect(within(linha).getByText('12/04/2026 00:00')).toBeInTheDocument();
    const busca = new URL(
      falsa.pedidos('GET /negocios/:id/bloqueios')[0].caminho,
      'http://x',
    ).searchParams;
    // 20/03 ainda é inverno (+0); 90 dias depois, verão (+1)
    expect(busca.get('de')).toBe('2026-03-20T00:00:00.000Z');
    expect(busca.get('ate')).toBe('2026-06-18T23:00:00.000Z');

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Vale para' }),
      'Ana',
    );
    preencher(/^Data de início/, '2026-07-15');
    preencher(/^Hora de início/, '09:00');
    preencher(/^Data do fim/, '2026-07-15');
    preencher(/^Hora do fim/, '18:00');
    await user.type(screen.getByRole('textbox', { name: /^Motivo/ }), 'Médico');
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));

    await waitFor(() =>
      expect(falsa.pedidos('POST /negocios/:id/bloqueios')).toHaveLength(1),
    );
    expect(falsa.pedidos('POST /negocios/:id/bloqueios')[0].corpo).toEqual({
      profissionalId: 'p1',
      inicio: '2026-07-15T08:00:00.000Z',
      fim: '2026-07-15T17:00:00.000Z',
      motivo: 'Médico',
    });
  });

  it('a hora que não existe (o relógio pula em 29/03 em Lisboa) é recusada antes de mandar', async () => {
    const user = userEvent.setup();
    const falsa = apiFalsa({
      ...BASE,
      'GET /negocios/:id/bloqueios': { corpo: [] },
      'POST /negocios/:id/bloqueios': { status: 201, corpo: {} },
    });
    abrirPainel('/painel/n2/bloqueios');
    expect(
      await screen.findByText('Nenhum bloqueio nesse período.'),
    ).toBeInTheDocument();
    preencher(/^Data de início/, '2026-03-29');
    preencher(/^Hora de início/, '01:30');
    preencher(/^Data do fim/, '2026-03-29');
    preencher(/^Hora do fim/, '03:00');
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    expect(
      screen.getByLabelText(/^Data de início/),
    ).toHaveAccessibleDescription(
      'Esse horário não existe em Europe/Lisbon nesse dia (o relógio pula no horário de verão)',
    );
    expect(falsa.pedidos('POST /negocios/:id/bloqueios')).toHaveLength(0);

    // Depois do pulo, vale: 03:00 de verão = 02:00 UTC
    preencher(/^Hora de início/, '02:30');
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    await waitFor(() =>
      expect(falsa.pedidos('POST /negocios/:id/bloqueios')).toHaveLength(1),
    );
    expect(falsa.pedidos('POST /negocios/:id/bloqueios')[0].corpo).toEqual({
      inicio: '2026-03-29T01:30:00.000Z',
      fim: '2026-03-29T02:00:00.000Z',
    });
  });

  it('mostra o erro do servidor no campo e remove com confirmação', async () => {
    const user = userEvent.setup();
    const falsa = apiFalsa({
      ...BASE,
      'GET /negocios/:id/bloqueios': {
        corpo: [
          {
            id: 'b1',
            profissionalId: 'p2',
            inicio: '2026-03-25T12:00:00.000Z',
            fim: '2026-03-25T15:00:00.000Z',
            motivo: null,
          },
        ],
      },
      'POST /negocios/:id/bloqueios': {
        status: 400,
        corpo: {
          message: 'Dados inválidos',
          erros: [
            { campo: 'fim', mensagem: 'O fim precisa ser depois do início' },
          ],
        },
      },
      'DELETE /negocios/:id/bloqueios/:bid': { status: 204 },
    });
    abrirPainel('/painel/n1/bloqueios');
    const linha = await screen.findByRole('row', { name: /Bruno/ });
    // São Paulo: 12:00 UTC = 09:00
    expect(within(linha).getByText('25/03/2026 09:00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    expect(
      await screen.findByText('O fim precisa ser depois do início'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Data do fim/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    await user.click(
      within(linha).getByRole('button', { name: /^Remover o bloqueio/ }),
    );
    expect(
      screen.getByRole('alertdialog', { name: /^Remover o bloqueio \(Bruno/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sim, remover' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('row', { name: /Bruno/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      falsa.pedidos('DELETE /negocios/:id/bloqueios/:bid')[0].caminho,
    ).toBe('/negocios/n1/bloqueios/b1');
  });
});

describe('dados do negócio', () => {
  it('copia o link público', async () => {
    const user = userEvent.setup();
    apiFalsa(BASE);
    abrirPainel('/painel/n1/negocio');
    await user.click(
      await screen.findByRole('button', { name: 'Copiar link' }),
    );
    expect(await screen.findByText('Link copiado.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(
      'http://localhost:3000/b/barbearia',
    );
    expect(
      screen.getByRole('link', { name: /Abrir a página/ }),
    ).toHaveAttribute('href', '/b/barbearia');
  });

  it('sem a API do clipboard, copia pelo jeito antigo', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const copiar = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      value: copiar,
      configurable: true,
    });
    apiFalsa(BASE);
    abrirPainel('/painel/n1/negocio');
    await user.click(
      await screen.findByRole('button', { name: 'Copiar link' }),
    );
    expect(await screen.findByText('Link copiado.')).toBeInTheDocument();
    expect(copiar).toHaveBeenCalledWith('copy');
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it('salva só o que mudou e mostra o 409 de endereço repetido no campo', async () => {
    const user = userEvent.setup();
    let tentativa = 0;
    const falsa = apiFalsa({
      ...BASE,
      'PATCH /negocios/:id': (p) =>
        ++tentativa === 1
          ? {
              status: 409,
              corpo: { message: 'Este endereço já está em uso; escolha outro' },
            }
          : { corpo: { ...NEGOCIO, ...(p.corpo as object) } },
    });
    abrirPainel('/painel/n1/negocio');
    const endereco = await screen.findByRole('textbox', { name: /^Endereço$/ });
    await user.clear(endereco);
    await user.type(endereco, 'ocupado');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Este endereço já está em uso; escolha outro'),
    ).toBeInTheDocument();
    expect(endereco).toHaveAttribute('aria-invalid', 'true');

    await user.clear(endereco);
    await user.type(endereco, 'barbearia-centro');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText(
        'Dados salvos. O endereço antigo deixou de funcionar.',
      ),
    ).toBeInTheDocument();
    expect(falsa.pedidos('PATCH /negocios/:id').map((p) => p.corpo)).toEqual([
      { slug: 'ocupado' },
      { slug: 'barbearia-centro' },
    ]);
    // O link público já é o novo
    expect(
      screen.getByRole('textbox', { name: 'Endereço público' }),
    ).toHaveValue('http://localhost:3000/b/barbearia-centro');
  });
});
