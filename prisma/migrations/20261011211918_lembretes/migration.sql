-- CreateEnum
CREATE TYPE "TipoDeAviso" AS ENUM ('lembrete');

-- AlterTable
ALTER TABLE "reservas" ADD COLUMN     "lembrete_em" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "avisos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "tipo" "TipoDeAviso" NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lido_em" TIMESTAMPTZ(3),

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avisos_usuario_id_criado_em_idx" ON "avisos"("usuario_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_reserva_id_tipo_key" ON "avisos"("reserva_id", "tipo");

-- CreateIndex
CREATE INDEX "reservas_lembrete_em_idx" ON "reservas"("lembrete_em");

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
