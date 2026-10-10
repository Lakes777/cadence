import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Todos os arquivos usam o mesmo banco: em série, para um não mexer nos dados do outro
    fileParallelism: false,
    globalSetup: ['test/preparar-banco.ts'],
    // Baixar a imagem do Postgres na primeira vez pode demorar
    hookTimeout: 120_000,
  },
});
