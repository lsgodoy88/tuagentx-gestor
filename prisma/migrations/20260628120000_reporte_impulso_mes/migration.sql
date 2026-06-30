-- Snapshot mensual de solo lectura del reporte de impulsadoras (rutero,
-- clientes, metas, ventas, % cumplimiento). Se congela el ultimo dia del mes
-- a las 23:59 via Guardian, antes de que el rutero pueda cambiar para el mes
-- nuevo. El Reporte (tab) lee este snapshot si existe; si no existe (mes en
-- curso), sigue calculando en vivo como hoy.
CREATE TABLE IF NOT EXISTS "gestor_staging"."ReporteImpulsoMes" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "mes" INTEGER NOT NULL,
  "anio" INTEGER NOT NULL,
  "resultados" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReporteImpulsoMes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReporteImpulsoMes_empresaId_mes_anio_key"
  ON "gestor_staging"."ReporteImpulsoMes"("empresaId", "mes", "anio");

CREATE INDEX IF NOT EXISTS "ReporteImpulsoMes_empresaId_idx"
  ON "gestor_staging"."ReporteImpulsoMes"("empresaId");

ALTER TABLE "gestor_staging"."ReporteImpulsoMes"
  ADD CONSTRAINT "ReporteImpulsoMes_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "gestor_staging"."Empresa"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
