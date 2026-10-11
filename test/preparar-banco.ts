import { execFileSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    urlDoBanco: string;
    urlDoRedis: string;
  }
}

let banco: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

/**
 * Sobe um Postgres e um Redis de verdade (os mesmos da produção) uma vez para todos os testes
 * e aplica as migrações. Cada aplicação de teste usa um prefixo próprio no Redis.
 */
export async function setup(projeto: TestProject): Promise<void> {
  [banco, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:18-alpine').start(),
    new RedisContainer('redis:8-alpine').start(),
  ]);
  const url = banco.getConnectionUri();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  projeto.provide('urlDoBanco', url);
  projeto.provide('urlDoRedis', redis.getConnectionUrl());
}

export async function teardown(): Promise<void> {
  await Promise.all([banco?.stop(), redis?.stop()]);
}
