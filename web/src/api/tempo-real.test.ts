import { apiFalsa } from '../teste/api-falsa';
import { CLIENTE, logarComo } from '../teste/render';
import { tempoRealFalso } from '../teste/websocket-falso';
import { aplicar, sair } from './sessao';
import type { EventoDoTempoReal } from './tempo-real';

describe('tempo real', () => {
  it('assina antes de abrir e manda quando a conexão abre', () => {
    const tr = tempoRealFalso();
    tr.tempoReal.assinar('barbearia');
    tr.atual().abrir();
    expect(tr.atual().enviadas).toEqual([
      { tipo: 'assinar', negocio: 'barbearia' },
    ]);
  });

  it('duas telas no mesmo negócio: só desassina quando a última sai', () => {
    const tr = tempoRealFalso();
    const a = tr.tempoReal.assinar('b');
    const b = tr.tempoReal.assinar('b');
    tr.atual().abrir();
    a();
    expect(tr.atual().enviadas).toEqual([{ tipo: 'assinar', negocio: 'b' }]);
    b();
    expect(tr.atual().enviadas.at(-1)).toEqual({
      tipo: 'desassinar',
      negocio: 'b',
    });
  });

  it('entra com o token, troca quando ele muda e sai junto com a sessão', async () => {
    apiFalsa({ 'POST /auth/sair': { status: 204 } });
    const tr = tempoRealFalso();
    logarComo(CLIENTE);
    tr.atual().abrir();
    expect(tr.atual().enviadas).toEqual([
      { tipo: 'entrar', token: 'token-c1' },
    ]);
    aplicar({ usuario: CLIENTE, tokenDeAcesso: 'outro', expiraEm: 900 });
    expect(tr.atual().enviadas.at(-1)).toEqual({
      tipo: 'entrar',
      token: 'outro',
    });
    await sair();
    expect(tr.atual().enviadas.at(-1)).toEqual({ tipo: 'sair' });
  });

  it('entrega as mensagens a quem ouve', () => {
    const tr = tempoRealFalso();
    const recebidos: EventoDoTempoReal[] = [];
    tr.tempoReal.ouvir((e) => recebidos.push(e));
    tr.tempoReal.assinar('b');
    tr.atual().abrir();
    tr.atual().entregar({
      tipo: 'horarios',
      negocio: 'b',
      de: '2026-10-19',
      ate: '2026-10-19',
    });
    expect(recebidos).toEqual([
      { tipo: 'horarios', negocio: 'b', de: '2026-10-19', ate: '2026-10-19' },
    ]);
  });

  it('caiu: volta sozinha, refaz as assinaturas e avisa que reconectou', () => {
    vi.useFakeTimers();
    const tr = tempoRealFalso();
    const recebidos: EventoDoTempoReal[] = [];
    tr.tempoReal.ouvir((e) => recebidos.push(e));
    tr.tempoReal.assinar('b');
    tr.atual().abrir();
    tr.atual().cair();
    expect(tr.conexoes).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(tr.conexoes).toHaveLength(2);
    tr.atual().abrir();
    expect(tr.atual().enviadas).toEqual([{ tipo: 'assinar', negocio: 'b' }]);
    expect(recebidos).toEqual([{ tipo: 'reconectou' }]);
  });

  it('sem assinatura nem sessão, não reconecta à toa', () => {
    vi.useFakeTimers();
    const tr = tempoRealFalso();
    const parar = tr.tempoReal.assinar('b');
    tr.atual().abrir();
    parar();
    tr.atual().cair();
    vi.advanceTimersByTime(60_000);
    expect(tr.conexoes).toHaveLength(1);
  });

  it('sessão vencida na conexão: renova e entra de novo com o token novo', async () => {
    apiFalsa({
      'POST /auth/renovar': {
        corpo: { usuario: CLIENTE, tokenDeAcesso: 'renovado', expiraEm: 900 },
      },
    });
    const tr = tempoRealFalso();
    logarComo(CLIENTE);
    tr.atual().abrir();
    tr.atual().entregar({ tipo: 'sessaoVencida' });
    await vi.waitFor(() =>
      expect(tr.atual().enviadas.at(-1)).toEqual({
        tipo: 'entrar',
        token: 'renovado',
      }),
    );
  });
});
