-- totalOrden en OrdenDespacho — monto de la factura desde UpTres
-- Campo nullable: registros existentes quedan en NULL, se pobla en sync futuro
ALTER TABLE "gestor"."OrdenDespacho"
  ADD COLUMN IF NOT EXISTS "totalOrden" DECIMAL(14,2);
