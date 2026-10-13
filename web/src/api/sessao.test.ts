import { api, ErroDaApi } from './cliente';
import { apiFalsa } from '../teste/api-falsa';
import { CLIENTE, logarComo } from '../teste/render';
import { estadoDaSessao, iniciarSessao, renovar, tokenAtual } from './sessao';

const sessao = (token: string) => ({
  usuario: CLIENTE,
  tokenDeAcesso: token,
  expiraEm: 900,
});

describe('sessão', () => {
  it('recupera a sessão pelo cookie ao abrir a página', async () => {
    apiFalsa({ 'POST /auth/renovar': { corpo: sessao('novo') } });
    expect(estadoDaSessao().carregando).toBe(true);
    expect(await iniciarSessao()).toBe(true);
    expect(tokenAtual()).toBe('novo');
    expect(estadoDaSessao()).toEqual({ usuario: CLIENTE, carregando: false });
  });

  it('sem cookie (401), termina deslogada', async () => {
    apiFalsa({ 'POST /auth/renovar': { status: 401 } });
    expect(await iniciarSessao()).toBe(false);
    expect(estadoDaSessao()).toEqual({ usuario: null, carregando: false });
  });

  it('renovações ao mesmo tempo na aba viram um pedido só', async () => {
    const falsa = apiFalsa({ 'POST /auth/renovar': { corpo: sessao('x') } });
    await Promise.all([renovar(), renovar(), renovar()]);
    expect(falsa.pedidos('POST /auth/renovar')).toHaveLength(1);
  });

  it('renova dentro da trava compartilhada entre as abas', async () => {
    const travas: string[] = [];
    vi.stubGlobal('navigator', {
      locks: {
        request: (nome: string, fazer: () => Promise<unknown>) => {
          travas.push(nome);
          return fazer();
        },
      },
    });
    apiFalsa({ 'POST /auth/renovar': { corpo: sessao('x') } });
    await renovar();
    expect(travas).toEqual(['cadence-renovacao']);
  });

  it('manda o JSON que as rotas de /auth exigem', async () => {
    const falsa = apiFalsa({ 'POST /auth/renovar': { corpo: sessao('x') } });
    await renovar();
    expect(falsa.pedidos()[0].cabecalhos['Content-Type']).toBe(
      'application/json',
    );
  });
});

describe('api', () => {
  it('manda o token e devolve o JSON', async () => {
    logarComo(CLIENTE);
    const falsa = apiFalsa({ 'GET /reservas': { corpo: [] } });
    expect(await api('/reservas')).toEqual([]);
    expect(falsa.pedidos()[0].cabecalhos.Authorization).toBe('Bearer token-c1');
  });

  it('token vencido: renova uma vez e repete o pedido com o token novo', async () => {
    logarComo(CLIENTE);
    const falsa = apiFalsa({
      'GET /reservas': (p) =>
        p.cabecalhos.Authorization === 'Bearer novo'
          ? { corpo: ['ok'] }
          : { status: 401 },
      'POST /auth/renovar': { corpo: sessao('novo') },
    });
    expect(await api('/reservas')).toEqual(['ok']);
    expect(falsa.pedidos('GET /reservas')).toHaveLength(2);
  });

  it('renovação recusada: o erro é 401 e a sessão acaba', async () => {
    logarComo(CLIENTE);
    apiFalsa({
      'GET /reservas': { status: 401 },
      'POST /auth/renovar': { status: 401 },
    });
    await expect(api('/reservas')).rejects.toMatchObject({ status: 401 });
    expect(estadoDaSessao().usuario).toBeNull();
  });

  it('erro de validação traz a mensagem de cada campo', async () => {
    apiFalsa({
      'POST /auth/cadastro': {
        status: 400,
        corpo: {
          message: 'Dados inválidos',
          erros: [{ campo: 'senha', mensagem: 'Curta demais' }],
        },
      },
    });
    const erro = await api('/auth/cadastro', {
      metodo: 'POST',
      corpo: {},
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDaApi);
    expect((erro as ErroDaApi).doCampo('senha')).toBe('Curta demais');
  });

  it('sem rede, a mensagem diz isso', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('falhou')));
    await expect(api('/reservas')).rejects.toThrow('Sem conexão');
  });

  it('429 vira um pedido para esperar', async () => {
    apiFalsa({
      'POST /auth/entrar': {
        status: 429,
        corpo: { message: 'ThrottlerException' },
      },
    });
    await expect(
      api('/auth/entrar', { metodo: 'POST', corpo: {} }),
    ).rejects.toThrow('Espere um minuto');
  });
});
