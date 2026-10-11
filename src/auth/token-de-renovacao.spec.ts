import {
  DIAS_DA_FAMILIA,
  DIAS_DO_TOKEN_DE_RENOVACAO,
  fimDaFamilia,
  expiracaoDoTokenDeRenovacao,
  hashDoToken,
  novoTokenDeRenovacao,
} from './token-de-renovacao.js';

describe('token de renovação', () => {
  it('tem 256 bits aleatórios em base64url', () => {
    const token = novoTokenDeRenovacao();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(novoTokenDeRenovacao()).not.toBe(token);
  });

  it('guarda só o SHA-256 (determinístico, diferente do token)', () => {
    const token = novoTokenDeRenovacao();
    expect(hashDoToken(token)).toBe(hashDoToken(token));
    expect(hashDoToken(token)).not.toBe(token);
    expect(hashDoToken('abc')).toBe(
      'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0',
    );
  });

  it(`vence ${DIAS_DO_TOKEN_DE_RENOVACAO} dias depois`, () => {
    const agora = new Date('2026-10-11T12:00:00Z');
    expect(expiracaoDoTokenDeRenovacao(agora, agora).toISOString()).toBe(
      '2026-11-10T12:00:00.000Z',
    );
  });

  it(`nunca passa do fim da família (${DIAS_DA_FAMILIA} dias depois do login)`, () => {
    const login = new Date('2026-10-11T12:00:00Z');
    expect(fimDaFamilia(login).toISOString()).toBe('2027-01-09T12:00:00.000Z');
    const quaseNoFim = new Date('2027-01-01T12:00:00Z');
    expect(expiracaoDoTokenDeRenovacao(quaseNoFim, login).toISOString()).toBe(
      '2027-01-09T12:00:00.000Z',
    );
  });
});
