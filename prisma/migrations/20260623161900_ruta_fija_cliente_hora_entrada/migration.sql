-- horaEntrada en RutaFijaCliente — hora planeada de llegada al punto (formato HH:mm)
-- Campo nullable: puntos existentes quedan sin hora configurada, sin alerta hasta que se asigne
-- NOTA: este .sql se versiona con schema "gestor" (el de produccion) por consistencia con
-- las migraciones anteriores. En staging se aplica manualmente contra "gestor_staging".
ALTER TABLE "gestor"."RutaFijaCliente"
  ADD COLUMN IF NOT EXISTS "horaEntrada" TEXT;
