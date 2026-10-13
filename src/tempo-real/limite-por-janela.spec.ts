import { LimitePorJanela } from './limite-por-janela.js';

describe('LimitePorJanela', () => {
  let agora: number;
  const criar = () => new LimitePorJanela(3, 60_000, () => agora);

  beforeEach(() => {
    agora = 1_000_000;
  });

  it('deixa até o máximo na janela e recusa o seguinte', () => {
    const limite = criar();
    for (let i = 0; i < 3; i++) {
      expect(limite.cabe('1.1.1.1')).toBe(true);
      limite.registrar('1.1.1.1');
    }
    expect(limite.cabe('1.1.1.1')).toBe(false);
  });

  it('cada chave tem a própria conta', () => {
    const limite = criar();
    for (let i = 0; i < 3; i++) limite.registrar('1.1.1.1');
    expect(limite.cabe('2.2.2.2')).toBe(true);
  });

  it('passada a janela, conta do zero (e não antes)', () => {
    const limite = criar();
    for (let i = 0; i < 3; i++) limite.registrar('1.1.1.1');
    agora += 59_999;
    expect(limite.cabe('1.1.1.1')).toBe(false);
    agora += 1;
    expect(limite.cabe('1.1.1.1')).toBe(true);
    limite.registrar('1.1.1.1');
    limite.registrar('1.1.1.1');
    limite.registrar('1.1.1.1');
    expect(limite.cabe('1.1.1.1')).toBe(false);
  });

  it('a janela começa no primeiro evento, não desliza a cada novo', () => {
    const limite = criar();
    limite.registrar('1.1.1.1');
    agora += 50_000;
    limite.registrar('1.1.1.1');
    limite.registrar('1.1.1.1');
    agora += 10_000;
    // 60 s depois do primeiro: janela nova, mesmo com eventos há 10 s
    expect(limite.cabe('1.1.1.1')).toBe(true);
  });

  it('limpar esquece só as janelas vencidas', () => {
    const limite = criar();
    limite.registrar('velho');
    agora += 30_000;
    limite.registrar('novo');
    agora += 30_000;
    limite.limpar();
    expect(limite.tamanho).toBe(1);
    expect(limite.cabe('novo')).toBe(true);
  });
});
