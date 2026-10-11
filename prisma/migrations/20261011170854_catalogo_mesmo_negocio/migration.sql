-- Garante no banco que as ligações nunca misturam dois negócios (antes, só o código conferia)

-- DropForeignKey
ALTER TABLE "profissionais_servicos" DROP CONSTRAINT "profissionais_servicos_profissional_id_fkey";

-- DropForeignKey
ALTER TABLE "profissionais_servicos" DROP CONSTRAINT "profissionais_servicos_servico_id_fkey";

-- AlterTable (preenche as ligações que já existirem antes de exigir o valor)
ALTER TABLE "profissionais_servicos" ADD COLUMN "negocio_id" UUID;
UPDATE "profissionais_servicos" ps SET "negocio_id" = p."negocio_id"
    FROM "profissionais" p WHERE p."id" = ps."profissional_id";
ALTER TABLE "profissionais_servicos" ALTER COLUMN "negocio_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_id_negocio_id_key" ON "profissionais"("id", "negocio_id");

-- CreateIndex
CREATE UNIQUE INDEX "servicos_id_negocio_id_key" ON "servicos"("id", "negocio_id");

-- AddForeignKey
ALTER TABLE "profissionais_servicos" ADD CONSTRAINT "profissionais_servicos_profissional_id_negocio_id_fkey" FOREIGN KEY ("profissional_id", "negocio_id") REFERENCES "profissionais"("id", "negocio_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais_servicos" ADD CONSTRAINT "profissionais_servicos_servico_id_negocio_id_fkey" FOREIGN KEY ("servico_id", "negocio_id") REFERENCES "servicos"("id", "negocio_id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Feito à mão: o bloqueio de um profissional precisa ser do negócio dele. Uma chave estrangeira
-- composta resolveria, mas o Prisma não aceita relação opcional com campo obrigatório
-- (negocio_id); um gatilho faz a mesma conferência sem o Prisma enxergar.
CREATE FUNCTION bloqueio_do_mesmo_negocio() RETURNS trigger AS $$
BEGIN
    IF NEW.profissional_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM profissionais
        WHERE id = NEW.profissional_id AND negocio_id = NEW.negocio_id
    ) THEN
        RAISE EXCEPTION 'profissional % não é do negócio %', NEW.profissional_id, NEW.negocio_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bloqueios_mesmo_negocio
    BEFORE INSERT OR UPDATE OF profissional_id, negocio_id ON bloqueios
    FOR EACH ROW EXECUTE FUNCTION bloqueio_do_mesmo_negocio();
