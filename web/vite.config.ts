import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Em dev, a API (npm run start:dev na raiz) roda na 8095; o Vite repassa estas rotas a ela */
const API = process.env.CADENCE_API ?? 'http://localhost:8095';
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
