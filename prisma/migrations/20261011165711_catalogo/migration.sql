-- CreateTable
CREATE TABLE "negocios" (
    "id" UUID NOT NULL,
    "dono_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fuso" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negocios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profissionais" (
    "id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicos" (
    "id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "duracao_min" INTEGER NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profissionais_servicos" (
    "profissional_id" UUID NOT NULL,
    "servico_id" UUID NOT NULL,

    CONSTRAINT "profissionais_servicos_pkey" PRIMARY KEY ("profissional_id","servico_id")
);

-- CreateTable
CREATE TABLE "horarios_de_trabalho" (
    "id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "dia_da_semana" INTEGER NOT NULL,
    "inicio_min" INTEGER NOT NULL,
    "fim_min" INTEGER NOT NULL,

    CONSTRAINT "horarios_de_trabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueios" (
    "id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "profissional_id" UUID,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "motivo" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "negocios_slug_key" ON "negocios"("slug");

-- CreateIndex
CREATE INDEX "negocios_dono_id_idx" ON "negocios"("dono_id");

-- CreateIndex
CREATE INDEX "profissionais_negocio_id_idx" ON "profissionais"("negocio_id");

-- CreateIndex
CREATE INDEX "servicos_negocio_id_idx" ON "servicos"("negocio_id");

-- CreateIndex
CREATE INDEX "profissionais_servicos_servico_id_idx" ON "profissionais_servicos"("servico_id");

-- CreateIndex
CREATE INDEX "horarios_de_trabalho_profissional_id_idx" ON "horarios_de_trabalho"("profissional_id");

-- CreateIndex
CREATE INDEX "bloqueios_negocio_id_inicio_idx" ON "bloqueios"("negocio_id", "inicio");

-- CreateIndex
CREATE INDEX "bloqueios_profissional_id_idx" ON "bloqueios"("profissional_id");

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_dono_id_fkey" FOREIGN KEY ("dono_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais_servicos" ADD CONSTRAINT "profissionais_servicos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais_servicos" ADD CONSTRAINT "profissionais_servicos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_de_trabalho" ADD CONSTRAINT "horarios_de_trabalho_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Feito à mão: regras que o Prisma não sabe descrever

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "negocios" ADD CONSTRAINT "negocios_slug_valido"
    CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") <= 60);

ALTER TABLE "servicos" ADD CONSTRAINT "servicos_duracao_valida"
    CHECK ("duracao_min" BETWEEN 5 AND 480 AND "duracao_min" % 5 = 0);
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_preco_valido"
    CHECK ("preco_centavos" BETWEEN 0 AND 10000000);

ALTER TABLE "horarios_de_trabalho" ADD CONSTRAINT "horarios_dia_valido"
    CHECK ("dia_da_semana" BETWEEN 0 AND 6);
ALTER TABLE "horarios_de_trabalho" ADD CONSTRAINT "horarios_intervalo_valido"
    CHECK ("inicio_min" >= 0 AND "fim_min" <= 1440 AND "inicio_min" < "fim_min");
-- Dois intervalos do mesmo profissional no mesmo dia não podem se sobrepor ([) : 12:00 encosta em 12:00)
ALTER TABLE "horarios_de_trabalho" ADD CONSTRAINT "horarios_sem_sobreposicao"
    EXCLUDE USING gist (
        "profissional_id" WITH =,
        "dia_da_semana" WITH =,
        int4range("inicio_min", "fim_min") WITH &&
    );

ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_intervalo_valido"
    CHECK ("inicio" < "fim");
