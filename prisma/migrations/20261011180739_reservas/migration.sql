-- CreateEnum
CREATE TYPE "StatusDaReserva" AS ENUM ('confirmada', 'cancelada');

-- CreateTable
CREATE TABLE "reservas" (
    "id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "servico_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "status" "StatusDaReserva" NOT NULL DEFAULT 'confirmada',
    "cancelada_em" TIMESTAMPTZ(3),
    "chave_idempotencia" TEXT NOT NULL,
    "hash_do_pedido" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservas_negocio_id_inicio_idx" ON "reservas"("negocio_id", "inicio");

-- CreateIndex
CREATE INDEX "reservas_profissional_id_inicio_idx" ON "reservas"("profissional_id", "inicio");

-- CreateIndex
CREATE INDEX "reservas_cliente_id_inicio_idx" ON "reservas"("cliente_id", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_cliente_id_chave_idempotencia_key" ON "reservas"("cliente_id", "chave_idempotencia");

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_profissional_id_negocio_id_fkey" FOREIGN KEY ("profissional_id", "negocio_id") REFERENCES "profissionais"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_servico_id_negocio_id_fkey" FOREIGN KEY ("servico_id", "negocio_id") REFERENCES "servicos"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Feito à mão: as regras que o Prisma não sabe descrever

ALTER TABLE "reservas" ADD CONSTRAINT "reservas_intervalo_valido"
    CHECK ("inicio" < "fim");
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_preco_valido"
    CHECK ("preco_centavos" >= 0);
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_cancelamento_coerente"
    CHECK (("status" = 'cancelada') = ("cancelada_em" IS NOT NULL));

-- A garantia contra reserva dupla: duas reservas confirmadas do mesmo profissional não podem
-- ter intervalos que se sobreponham ([) : terminar às 10:00 e começar às 10:00 pode). Quem
-- chega depois, mesmo no mesmo milissegundo, recebe o erro 23P01 e a API responde 409.
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_sem_sobreposicao"
    EXCLUDE USING gist (
        "profissional_id" WITH =,
        tstzrange("inicio", "fim", '[)') WITH &&
    ) WHERE ("status" = 'confirmada');
