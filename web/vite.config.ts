import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** A PORTA do .env da raiz (a da API em dev), ou a padrão dela */
function portaDaApi(): string {
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    return /^PORTA=(\d+)/m.exec(env)?.[1] ?? '3000';
  } catch {
    return '3000';
  }
}

/** Em dev, o Vite repassa as rotas da API (npm run start:dev na raiz) para ela */
const API = process.env.CADENCE_API ?? `http://localhost:${portaDaApi()}`;
const ROTAS_DA_API = [
  '/auth',
  '/negocios',
  '/reservas',
  '/avisos',
  '/saude',
  '/demo',
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      ...Object.fromEntries(ROTAS_DA_API.map((rota) => [rota, API])),
      '/tempo-real': { target: API, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/teste/preparar.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
