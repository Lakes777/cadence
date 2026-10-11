-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('dono', 'cliente');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_de_renovacao" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "familia" UUID NOT NULL,
    "familia_criada_em" TIMESTAMPTZ(3) NOT NULL,
    "hash" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "usado_em" TIMESTAMPTZ(3),
    "revogado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_de_renovacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_de_renovacao_hash_key" ON "tokens_de_renovacao"("hash");

-- CreateIndex
CREATE INDEX "tokens_de_renovacao_familia_idx" ON "tokens_de_renovacao"("familia");

-- CreateIndex
CREATE INDEX "tokens_de_renovacao_usuario_id_idx" ON "tokens_de_renovacao"("usuario_id");

-- AddForeignKey
ALTER TABLE "tokens_de_renovacao" ADD CONSTRAINT "tokens_de_renovacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Feito à mão: o e-mail só é único de verdade se sempre chegar normalizado (a API normaliza;
-- isto pega qualquer caminho que esqueça)
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_email_normalizado"
    CHECK ("email" = lower(btrim("email")));
