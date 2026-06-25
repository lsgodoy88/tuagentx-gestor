-- envioEstado/envioFecha/receivableAtUptres en PagoCarteraDeuda — unica fuente de
-- verdad por FACTURA, no por recibo. PagoCartera.envioEstado se deriva de estas filas.
ALTER TABLE "gestor"."PagoCarteraDeuda"
  ADD COLUMN IF NOT EXISTS "envioEstado" TEXT NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS "envioFecha" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "receivableAtUptres" TIMESTAMP;

-- Migrar estado existente heredado del PagoCartera padre, antes de que el codigo
-- nuevo empiece a derivar el estado del padre desde estas filas.
UPDATE "gestor"."PagoCarteraDeuda" pcd
SET "envioEstado" = pc."envioEstado", "envioFecha" = pc."envioFecha", "receivableAtUptres" = pc."receivableAtUptres"
FROM "gestor"."PagoCartera" pc
WHERE pc.id = pcd."pagoId";
