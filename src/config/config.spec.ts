import { lerConfig } from './config.js';

const URL_VALIDA = 'postgresql://cadence:senha@localhost:5432/cadence';

describe('lerConfig', () => {
  it('usa os padrões quando só o banco é informado', () => {
    const config = lerConfig({ DATABASE_URL: URL_VALIDA });
    expect(config).toEqual({
      NODE_ENV: 'production',
      PORTA: 3000,
      DATABASE_URL: URL_VALIDA,
      NIVEL_DO_LOG: 'info',
    });
  });

  it('converte a porta de texto para número', () => {
    expect(lerConfig({ DATABASE_URL: URL_VALIDA, PORTA: '8093' }).PORTA).toBe(
      8093,
    );
  });

  it('aceita postgres:// além de postgresql://', () => {
    const url = 'postgres://cadence@banco/cadence';
    expect(lerConfig({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it('devolve uma configuração congelada', () => {
    expect(Object.isFrozen(lerConfig({ DATABASE_URL: URL_VALIDA }))).toBe(true);
  });

  it('recusa a falta do banco com uma mensagem clara', () => {
    expect(() => lerConfig({})).toThrow(
      /DATABASE_URL: DATABASE_URL é obrigatória/,
    );
  });

  it.each([
    ['endereço de outro banco', { DATABASE_URL: 'mysql://localhost/x' }],
    ['porta fora da faixa', { DATABASE_URL: URL_VALIDA, PORTA: '70000' }],
    ['porta que não é número', { DATABASE_URL: URL_VALIDA, PORTA: 'oito' }],
    ['ambiente desconhecido', { DATABASE_URL: URL_VALIDA, NODE_ENV: 'prod' }],
    [
      'nível de log desconhecido',
      { DATABASE_URL: URL_VALIDA, NIVEL_DO_LOG: 'tudo' },
    ],
  ])('recusa %s', (_caso, env) => {
    expect(() => lerConfig(env)).toThrow(/^Configuração inválida/);
  });

  it('lista todos os problemas de uma vez, sem mostrar valores', () => {
    const segredo = 'mysql://usuario:senha-secreta@localhost/x';
    try {
      lerConfig({ DATABASE_URL: segredo, PORTA: '0' });
      expect.unreachable();
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain('- DATABASE_URL:');
      expect(mensagem).toContain('- PORTA:');
      expect(mensagem).not.toContain('senha-secreta');
    }
  });
});
