import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';

/**
 * Sobe a aplicação inteira (módulos reais, banco do Testcontainers), sem abrir porta.
 * `env` troca variáveis só desta aplicação (ex.: um limite de pedidos menor) e `ajustar` troca
 * peças do módulo (ex.: o relógio).
 */
export async function criarApp(
  env: Record<string, string> = {},
  ajustar: (modulo: TestingModuleBuilder) => TestingModuleBuilder = (m) => m,
): Promise<INestApplication<App>> {
  Object.assign(process.env, {
    DATABASE_URL: inject('urlDoBanco'),
    NODE_ENV: 'test',
    NIVEL_DO_LOG: 'silent',
    JWT_SEGREDO: 'segredo-dos-testes-de-ponta-a-ponta-0123456789',
    // Alto para os testes não esbarrarem no limite; o teste do limite sobe o próprio app
    PEDIDOS_DE_CONTA_POR_MINUTO: '1000',
    ...env,
  });
  const modulo = await ajustar(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarApp(app);
  app.enableShutdownHooks();
  await app.init();
  return app as unknown as INestApplication<App>;
}
