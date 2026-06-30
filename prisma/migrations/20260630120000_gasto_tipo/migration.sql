-- Campo Tipo para gastos (Viaticos, Eventos, Papeleria, Otros). Obligatorio
-- a nivel de aplicacion (backend valida); default "Otros" solo cubre las
-- filas existentes antes de este cambio.
ALTER TABLE "gestor_staging"."Gasto"
  ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'Otros';

ALTER TABLE "gestor_staging"."Gasto"
  ADD CONSTRAINT "Gasto_tipo_check"
  CHECK ("tipo" IN ('Viaticos', 'Eventos', 'Papeleria', 'Otros'));
