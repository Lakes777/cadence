import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
    REDIS_URL: inject('urlDoRedis'),
    // Uma fila por aplicação: o trabalhador de uma (com o relógio dela) não pega as tarefas de outra
    PREFIXO_DA_FILA: `teste-${randomUUID()}`,
    NODE_ENV: 'test',
    NIVEL_DO_LOG: 'silent',
    JWT_SEGREDO: 'segredo-dos-testes-de-ponta-a-ponta-0123456789',
    // Alto para os testes não esbarrarem no limite; o teste do limite sobe o próprio app
    PEDIDOS_DE_CONTA_POR_MINUTO: '1000',
    PEDIDOS_PUBLICOS_POR_MINUTO: '10000',
    // process.env fica com o que a aplicação anterior pôs: sem isto, a demonstração ligada
    // num arquivo vazaria para os seguintes
    CADENCE_DEMO: 'false',
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
