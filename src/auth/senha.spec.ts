import { CUSTO_PADRAO, conferirSenha, gerarHashDeSenha } from './senha.js';

// Custo baixo para os testes andarem rápido; o padrão é testado uma vez
const BARATO = { N: 2 ** 10, r: 8, p: 1 };

describe('senha', () => {
  it('confere a senha certa e recusa a errada (com o custo padrão)', async () => {
    const hash = await gerarHashDeSenha('cavalo-bateria-grampo');
    expect(hash).toMatch(
      new RegExp(`^scrypt\\$${CUSTO_PADRAO.N}\\$8\\$1\\$[\\w-]+\\$[\\w-]+$`),
    );
    await expect(conferirSenha('cavalo-bateria-grampo', hash)).resolves.toBe(
      true,
    );
    await expect(conferirSenha('cavalo-bateria-grampa', hash)).resolves.toBe(
      false,
    );
  });

  it('gera um sal diferente a cada vez', async () => {
    const a = await gerarHashDeSenha('mesma senha', BARATO);
    const b = await gerarHashDeSenha('mesma senha', BARATO);
    expect(a).not.toBe(b);
  });

  it('lê o custo do próprio hash (dá para subir o padrão sem invalidar os antigos)', async () => {
    const hash = await gerarHashDeSenha('senha antiga', BARATO);
    expect(hash.startsWith('scrypt$1024$8$1$')).toBe(true);
    await expect(conferirSenha('senha antiga', hash)).resolves.toBe(true);
  });

  it('trata formas Unicode equivalentes como a mesma senha', async () => {
    const composta = 'café'; // é como um caractere só
    const decomposta = 'café'; // e + acento separado
    const hash = await gerarHashDeSenha(composta, BARATO);
    await expect(conferirSenha(decomposta, hash)).resolves.toBe(true);
  });

  it.each([
    ['vazio', ''],
    ['outro algoritmo', 'bcrypt$10$abc'],
    ['partes faltando', 'scrypt$1024$8$1$sal'],
    ['custo que não é número', 'scrypt$muito$8$1$c2Fs$aGFzaA'],
    ['hash do tamanho errado', 'scrypt$1024$8$1$c2Fs$aGFzaA'],
  ])('recusa um hash mal formado (%s) sem lançar erro', async (_caso, hash) => {
    await expect(conferirSenha('qualquer', hash)).resolves.toBe(false);
  });
});
