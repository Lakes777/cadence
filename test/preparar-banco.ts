import { execFileSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    urlDoBanco: string;
  }
}

let banco: StartedPostgreSqlContainer | undefined;

/** Sobe um Postgres de verdade (o mesmo da produção) uma vez para todos os testes e aplica as migrações. */
export async function setup(projeto: TestProject): Promise<void> {
  banco = await new PostgreSqlContainer('postgres:18-alpine').start();
  const url = banco.getConnectionUri();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  projeto.provide('urlDoBanco', url);
}

export async function teardown(): Promise<void> {
  await banco?.stop();
}
