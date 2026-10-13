import { diasAfetados, lerMensagem } from './mensagens.js';

describe('lerMensagem', () => {
  it('aceita as quatro mensagens do navegador', () => {
    expect(lerMensagem('{"tipo":"entrar","token":"abc"}')).toEqual({
      ok: true,
      mensagem: { tipo: 'entrar', token: 'abc' },
    });
    expect(lerMensagem('{"tipo":"sair"}')).toEqual({
      ok: true,
      mensagem: { tipo: 'sair' },
    });
    expect(
      lerMensagem('{"tipo":"assinar","negocio":"barbearia-do-ze"}'),
    ).toEqual({
      ok: true,
      mensagem: { tipo: 'assinar', negocio: 'barbearia-do-ze' },
    });
    expect(lerMensagem('{"tipo":"desassinar","negocio":"ze"}')).toEqual({
      ok: true,
      mensagem: { tipo: 'desassinar', negocio: 'ze' },
    });
  });

  it('recusa texto que não é JSON', () => {
    expect(lerMensagem('assinar ze')).toEqual({
      ok: false,
      erro: 'Mensagem não é JSON',
    });
  });

  it('recusa tipo desconhecido (ou ausente) dizendo quais existem', () => {
    for (const texto of ['{"tipo":"apagar"}', '{}', '[]', '"oi"', 'null']) {
      expect(lerMensagem(texto)).toEqual({
        ok: false,
        erro: 'Mensagem inválida: use tipo entrar, sair, assinar ou desassinar',
      });
    }
  });

  it('recusa negócio fora do formato do slug, dizendo o campo', () => {
    for (const negocio of ['Barbearia', 'a b', '../x', '', 'a'.repeat(61)]) {
      const lida = lerMensagem(JSON.stringify({ tipo: 'assinar', negocio }));
      expect(lida.ok).toBe(false);
      expect(!lida.ok && lida.erro).toMatch(/^negocio: /);
    }
  });

  it('recusa token vazio ou grande demais', () => {
    for (const token of ['', 'x'.repeat(2001), 42]) {
      expect(lerMensagem(JSON.stringify({ tipo: 'entrar', token })).ok).toBe(
        false,
      );
    }
  });
});

describe('diasAfetados', () => {
  const SP = 'America/Sao_Paulo';

  it('reserva dentro de um dia: só aquele dia, na data local', () => {
    expect(
      diasAfetados(
        new Date('2026-10-19T09:00:00-03:00'),
        new Date('2026-10-19T09:30:00-03:00'),
        SP,
      ),
    ).toEqual({ de: '2026-10-19', ate: '2026-10-19' });
  });

  it('usa o fuso do negócio, não o UTC (22h em São Paulo já é amanhã em UTC)', () => {
    expect(
      diasAfetados(
        new Date('2026-10-19T22:00:00-03:00'),
        new Date('2026-10-19T23:00:00-03:00'),
        SP,
      ),
    ).toEqual({ de: '2026-10-19', ate: '2026-10-19' });
    expect(
      diasAfetados(
        new Date('2026-10-19T22:00:00-03:00'),
        new Date('2026-10-19T23:00:00-03:00'),
        'Asia/Tokyo',
      ),
    ).toEqual({ de: '2026-10-20', ate: '2026-10-20' });
  });

  it('terminar à meia-noite não mexe no dia seguinte', () => {
    expect(
      diasAfetados(
        new Date('2026-10-19T23:00:00-03:00'),
        new Date('2026-10-20T00:00:00-03:00'),
        SP,
      ),
    ).toEqual({ de: '2026-10-19', ate: '2026-10-19' });
  });

  it('bloqueio de vários dias: do primeiro ao último', () => {
    expect(
      diasAfetados(
        new Date('2026-12-20T00:00:00-03:00'),
        new Date('2027-01-05T00:00:00-03:00'),
        SP,
      ),
    ).toEqual({ de: '2026-12-20', ate: '2027-01-04' });
  });
});
