-- Modulo de gastos para vendedores/impulsadoras: registro con evidencia
-- adjunta (foto/PDF) y reconocimiento IA (igual patron que vouchers de
-- recaudos por transferencia). Cada empleado de campo ve solo los suyos;
-- admin (empresa/supervisor) ve todos. Inmutable para el dueño una vez
-- creado -- solo admin puede editar/eliminar.
CREATE TABLE IF NOT EXISTS "gestor_staging"."Gasto" (
  "id"              TEXT NOT NULL,
  "empresaId"       TEXT NOT NULL,
  "empleadoId"      TEXT NOT NULL,
  "fechaAgregacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaDoc"        TIMESTAMP(3),
  "concepto"        TEXT NOT NULL,
  "valor"           DECIMAL(12,2) NOT NULL,
  "evidenciaKey"    TEXT NOT NULL,
  "datosIA"         JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Gasto_empresaId_empleadoId_idx"
  ON "gestor_staging"."Gasto"("empresaId", "empleadoId");

ALTER TABLE "gestor_staging"."Gasto"
  ADD CONSTRAINT "Gasto_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "gestor_staging"."Empresa"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gestor_staging"."Gasto"
  ADD CONSTRAINT "Gasto_empleadoId_fkey"
  FOREIGN KEY ("empleadoId") REFERENCES "gestor_staging"."Empleado"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
