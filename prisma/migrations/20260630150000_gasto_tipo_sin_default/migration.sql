-- El campo tipo es obligado, sin valor automatico — el usuario SIEMPRE lo
-- elige manualmente (decision confirmada 30/06). El default 'Otros' de la
-- migracion anterior (20260630120000_gasto_tipo) era temporal solo para
-- cubrir filas creadas antes de este campo — ya no debe aplicar a filas
-- nuevas.
ALTER TABLE "gestor_staging"."Gasto" ALTER COLUMN "tipo" DROP DEFAULT;
