-- receivableAtUptres en PagoCartera — fecha real en que UpTres confirmó el pago.
-- Permite distinguir un pago lento (sin confirmar aun, normal) de uno huerfano real
-- (createdAt viejo, envioEstado='pendiente', sin receivableAtUptres nunca poblado).
ALTER TABLE "gestor"."PagoCartera"
  ADD COLUMN IF NOT EXISTS "receivableAtUptres" TIMESTAMP;
