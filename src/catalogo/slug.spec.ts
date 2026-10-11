import { FORMATO_DO_SLUG, gerarSlug } from './slug.js';

describe('gerarSlug', () => {
  it.each([
    ['Barbearia Exemplo', 'barbearia-exemplo'],
    ['Barbearia São João!', 'barbearia-sao-joao'],
    ['  Estúdio   Ação & Reação  ', 'estudio-acao-reacao'],
    ['Quadra 7', 'quadra-7'],
    ['***', ''],
  ])('%s -> %s', (nome, esperado) => {
    expect(gerarSlug(nome)).toBe(esperado);
  });

  it('corta em 60 caracteres sem deixar hífen no fim', () => {
    const slug = gerarSlug(`${'a'.repeat(59)} b`);
    expect(slug).toBe('a'.repeat(59));
    expect(gerarSlug('palavra '.repeat(20)).length).toBeLessThanOrEqual(60);
    expect(gerarSlug('palavra '.repeat(20))).toMatch(FORMATO_DO_SLUG);
  });

  it('nome longo: a base de 60 caracteres pode ter hífen na posição 55', () => {
    // O serviço corta em 55 para pôr o sufixo; o corte cai logo depois de um hífen
    const base = gerarSlug(`${'a'.repeat(54)} ${'b'.repeat(20)}`);
    expect(base.slice(0, 55)).toMatch(/-$/);
  });
});
