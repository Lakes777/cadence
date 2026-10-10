import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';

/** Sobe a aplicação inteira (módulos reais, banco do Testcontainers), sem abrir porta. */
export async function criarApp(): Promise<INestApplication<App>> {
  process.env.DATABASE_URL = inject('urlDoBanco');
  process.env.NODE_ENV = 'test';
  process.env.NIVEL_DO_LOG = 'silent';
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = modulo.createNestApplication<INestApplication<App>>();
  app.enableShutdownHooks();
  await app.init();
  return app;
}
