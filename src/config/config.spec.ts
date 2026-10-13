import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { lerConfig } from './config.js';

const URL_VALIDA = 'postgresql://cadence:senha@localhost:5432/cadence';
const SEGREDO = 'x'.repeat(32);
const REDIS = 'redis://localhost:6380';
const BASE = {
  DATABASE_URL: URL_VALIDA,
  JWT_SEGREDO: SEGREDO,
  REDIS_URL: REDIS,
};

describe('lerConfig', () => {
  it('usa os padrões quando só o banco, o Redis e o segredo são informados', () => {
    const config = lerConfig(BASE);
    expect(config).toEqual({
      NODE_ENV: 'production',
      PORTA: 3000,
      DATABASE_URL: URL_VALIDA,
      REDIS_URL: REDIS,
      PREFIXO_DA_FILA: 'cadence',
      NIVEL_DO_LOG: 'info',
      JWT_SEGREDO: SEGREDO,
      PEDIDOS_DE_CONTA_POR_MINUTO: 10,
      PEDIDOS_PUBLICOS_POR_MINUTO: 120,
      CONEXOES_POR_IP: 20,
      CONFIANCA_NO_PROXY: 'loopback',
      CADENCE_DEMO: false,
      VISITANTES_POR_HORA: 300,
    });
  });

  it.each([
    ['true', true],
    ['false', false],
    ['1', true],
    ['0', false],
  ])('lê CADENCE_DEMO=%s como %s', (valor, esperado) => {
    expect(lerConfig({ ...BASE, CADENCE_DEMO: valor }).CADENCE_DEMO).toBe(
      esperado,
    );
  });

  it('converte a porta de texto para número', () => {
    expect(lerConfig({ ...BASE, PORTA: '8093' }).PORTA).toBe(8093);
  });

  it('aceita postgres:// além de postgresql://', () => {
    const url = 'postgres://cadence@banco/cadence';
    expect(lerConfig({ ...BASE, DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it('devolve uma configuração congelada', () => {
    expect(Object.isFrozen(lerConfig(BASE))).toBe(true);
  });

  it('recusa a falta do banco com uma mensagem clara', () => {
    expect(() => lerConfig({ JWT_SEGREDO: SEGREDO, REDIS_URL: REDIS })).toThrow(
      /DATABASE_URL: DATABASE_URL é obrigatória/,
    );
  });

  it('recusa o segredo de exemplo do .env.exemplo (está público no GitHub)', () => {
    const exemplo = parseEnv(readFileSync('.env.exemplo', 'utf8'));
    expect(exemplo.JWT_SEGREDO).toBeDefined();
    expect(() => lerConfig(exemplo)).toThrow(/- JWT_SEGREDO:/);
  });

  it('aceita uma lista de redes de confiança para o proxy', () => {
    const valor = 'loopback, 172.30.0.0/24';
    expect(
      lerConfig({ ...BASE, CONFIANCA_NO_PROXY: valor }).CONFIANCA_NO_PROXY,
    ).toBe(valor);
  });

  it('recusa a falta do segredo dos tokens', () => {
    expect(() =>
      lerConfig({ DATABASE_URL: URL_VALIDA, REDIS_URL: REDIS }),
    ).toThrow(/JWT_SEGREDO: JWT_SEGREDO é obrigatório/);
  });

  it('recusa a falta do Redis com uma mensagem clara', () => {
    expect(() =>
      lerConfig({ DATABASE_URL: URL_VALIDA, JWT_SEGREDO: SEGREDO }),
    ).toThrow(/REDIS_URL: REDIS_URL é obrigatória/);
  });

  it('aceita rediss:// (Redis com TLS)', () => {
    const url = 'rediss://:senha@redis.exemplo:6380/2';
    expect(lerConfig({ ...BASE, REDIS_URL: url }).REDIS_URL).toBe(url);
  });

  it.each([
    [
      'endereço de outro banco',
      { ...BASE, DATABASE_URL: 'mysql://localhost/x' },
    ],
    [
      'endereço do Redis sem redis://',
      { ...BASE, REDIS_URL: 'localhost:6380' },
    ],
    ['prefixo da fila com dois-pontos', { ...BASE, PREFIXO_DA_FILA: 'a:b' }],
    ['porta fora da faixa', { ...BASE, PORTA: '70000' }],
    ['porta que não é número', { ...BASE, PORTA: 'oito' }],
    ['ambiente desconhecido', { ...BASE, NODE_ENV: 'prod' }],
    ['nível de log desconhecido', { ...BASE, NIVEL_DO_LOG: 'tudo' }],
    ['segredo curto', { ...BASE, JWT_SEGREDO: 'x'.repeat(31) }],
    ['limite de pedidos zerado', { ...BASE, PEDIDOS_DE_CONTA_POR_MINUTO: '0' }],
    ['confiar em qualquer proxy', { ...BASE, CONFIANCA_NO_PROXY: 'true' }],
    ['número de saltos do proxy', { ...BASE, CONFIANCA_NO_PROXY: '1' }],
    ['proxy com caractere estranho', { ...BASE, CONFIANCA_NO_PROXY: 'a;b' }],
    ['demonstração com valor estranho', { ...BASE, CADENCE_DEMO: 'talvez' }],
  ])('recusa %s', (_caso, env) => {
    expect(() => lerConfig(env)).toThrow(/^Configuração inválida/);
  });

  it('lista todos os problemas de uma vez, sem mostrar valores', () => {
    const segredo = 'mysql://usuario:senha-secreta@localhost/x';
    try {
      lerConfig({ ...BASE, DATABASE_URL: segredo, PORTA: '0' });
      expect.unreachable();
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain('- DATABASE_URL:');
      expect(mensagem).toContain('- PORTA:');
      expect(mensagem).not.toContain('senha-secreta');
    }
  });
});
