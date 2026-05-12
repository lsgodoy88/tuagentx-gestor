-- Campos congelados en PagoCartera — pago autosuficiente independiente de SyncDeuda
ALTER TABLE "gestor"."PagoCartera"
  ADD COLUMN IF NOT EXISTS "fechaPago" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "saldoAnterior" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "numeroFactura" INTEGER,
  ADD COLUMN IF NOT EXISTS "clienteApiId" TEXT,
  ADD COLUMN IF NOT EXISTS "clienteNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "valorFactura" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "vendedorNombre" TEXT;

-- Campos extendidos en SyncLog — bitácora de syncs con detalle
ALTER TABLE "gestor"."SyncLog"
  ADD COLUMN IF NOT EXISTS "zombis" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pagosConfrontados" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "empleadosSincronizados" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "duracionMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "disparadoPor" TEXT NOT NULL DEFAULT 'cron';

-- externalUpdatedAt en SyncDeuda — para confrontación pagos vs UpTres
ALTER TABLE "gestor"."SyncDeuda"
  ADD COLUMN IF NOT EXISTS "externalUpdatedAt" TIMESTAMP(3);
