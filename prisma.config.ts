import { defineConfig } from 'prisma/config';

// O endereço do banco vem do ambiente (em dev: `node --env-file=.env`, ou exportado no shell).
// `prisma generate` não precisa dele; `migrate` precisa.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
