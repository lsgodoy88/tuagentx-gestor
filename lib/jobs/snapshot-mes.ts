/**
 * snapshot-mes.ts
 * Cierra el mes anterior y guarda snapshots de ventas y recaudo
 * por vendedor en SnapshotMes. Se ejecuta el día 1 de cada mes.
 * Misma lógica que stats/route.ts (createdAt, isActiva=true).
 */

import { prisma } from '@/lib/prisma'

const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

export async function runSnapshotMes(mesOverride?: string): Promise<{ ventas: number; recaudo: number; descuento: number; cartera: number; mes: string }> {
  // Mes a cerrar: el anterior al actual, o el override para backfill
  const ahora = new Date()
  const mesCierre = mesOverride ?? `${ahora.getFullYear()}-${String(ahora.getMonth()).padStart(2, '0')}`
  // ahora.getMonth() sin +1 = mes anterior

  console.log(`[snapshot-mes] Cerrando mes ${mesCierre}`)

  // Ventas por empresa/vendedor del mes cerrado
  const ventasInserted: any = await (prisma as any).$queryRawUnsafe(`
    INSERT INTO ${DB_SCHEMA}."SnapshotMes" (id, empresa_id, mes, tipo, vendedor_api_id, entidad_nombre, datos, creado_en, updated_en)
    SELECT
      gen_random_uuid()::text,
      od."empresaId",
      $1,
      'ventas',
      od."vendedorApiId",
      COALESCE(e.nombre, 'Sin asignar'),
      jsonb_build_object(
        'total',   SUM(od."totalOrden")::float,
        'ordenes', COUNT(*)::int,
        'meta',    COALESCE(MAX(mv."metaPesos")::float, 0)
      ),
      NOW(), NOW()
    FROM ${DB_SCHEMA}."OrdenDespacho" od
    LEFT JOIN ${DB_SCHEMA}."Empleado" e ON e."vendedorId" = od."vendedorApiId" AND e."empresaId" = od."empresaId"
    LEFT JOIN ${DB_SCHEMA}."MetaVenta" mv ON mv."empleadoId" = e.id
      AND mv.mes = EXTRACT(MONTH FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
      AND mv.anio = EXTRACT(YEAR  FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
    WHERE od."isActiva" = true
      AND od."isFacturada" = true
      AND TO_CHAR(od."fechaFactura" AT TIME ZONE 'America/Bogota', 'YYYY-MM') = $1
    GROUP BY od."empresaId", od."vendedorApiId", COALESCE(e.nombre, 'Sin asignar')
    ON CONFLICT DO NOTHING
    RETURNING id
  `, mesCierre)

  // Recaudo por empresa/empleado del mes cerrado
  const recaudoInserted: any = await (prisma as any).$queryRawUnsafe(`
    INSERT INTO ${DB_SCHEMA}."SnapshotMes" (id, empresa_id, mes, tipo, empleado_id, entidad_nombre, datos, creado_en, updated_en)
    SELECT
      gen_random_uuid()::text,
      e."empresaId",
      $1,
      'recaudo',
      v."empleadoId",
      e.nombre,
      jsonb_build_object(
        'total',  SUM(v.monto)::float,
        'cobros', COUNT(*)::int,
        'meta',   COALESCE(MAX(mr."metaPesos")::float, 0)
      ),
      NOW(), NOW()
    FROM ${DB_SCHEMA}."Visita" v
    JOIN ${DB_SCHEMA}."Empleado" e ON e.id = v."empleadoId"
    LEFT JOIN ${DB_SCHEMA}."MetaRecaudo" mr ON mr."empleadoId" = e.id
      AND mr.mes = EXTRACT(MONTH FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
      AND mr.anio = EXTRACT(YEAR  FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
    WHERE v.tipo = 'cobro'
      AND TO_CHAR(DATE_TRUNC('month', v."fechaBogota" AT TIME ZONE 'America/Bogota'), 'YYYY-MM') = $1
    GROUP BY e."empresaId", v."empleadoId", e.nombre
    ON CONFLICT DO NOTHING
    RETURNING id
  `, mesCierre)

  const ventas = Array.isArray(ventasInserted) ? ventasInserted.length : 0
  const recaudo = Array.isArray(recaudoInserted) ? recaudoInserted.length : 0

  // Descuentos por empresa/empleado del mes cerrado
  const descuentoInserted: any = await (prisma as any).$queryRawUnsafe(`
    INSERT INTO ${DB_SCHEMA}."SnapshotMes" (id, empresa_id, mes, tipo, empleado_id, entidad_nombre, datos, creado_en, updated_en)
    SELECT
      gen_random_uuid()::text,
      e."empresaId",
      $1,
      'descuento',
      p."empleadoId",
      e.nombre,
      jsonb_build_object('total', SUM(p.descuento)::float, 'pagos', COUNT(*)::int),
      NOW(), NOW()
    FROM ${DB_SCHEMA}."PagoCartera" p
    JOIN ${DB_SCHEMA}."Empleado" e ON e.id = p."empleadoId"
    WHERE p.descuento > 0
      AND TO_CHAR(DATE_TRUNC('month', p."createdAt" AT TIME ZONE 'America/Bogota'), 'YYYY-MM') = $1
    GROUP BY e."empresaId", p."empleadoId", e.nombre
    ON CONFLICT DO NOTHING
    RETURNING id
  `, mesCierre)

  const descuento = Array.isArray(descuentoInserted) ? descuentoInserted.length : 0

  // Cartera al cierre — total, pendiente y clientes por vendedor desde CarteraCache
  const carteraInserted: any = await (prisma as any).$queryRawUnsafe(`
    INSERT INTO ${DB_SCHEMA}."SnapshotMes" (id, empresa_id, mes, tipo, empleado_id, vendedor_api_id, entidad_nombre, datos, creado_en, updated_en)
    SELECT
      gen_random_uuid()::text,
      cc."empresaId",
      $1,
      'cartera',
      e.id,
      cc."empleadoExternalId",
      cc."empleadoNombre",
      jsonb_build_object(
        'total',     SUM(cc."saldoTotal")::float,
        'pendiente', SUM(cc."saldoPendiente")::float,
        'clientes',  COUNT(*)::int
      ),
      NOW(), NOW()
    FROM ${DB_SCHEMA}."CarteraCache" cc
    LEFT JOIN ${DB_SCHEMA}."Empleado" e ON e."apiId" = cc."empleadoExternalId" AND e."empresaId" = cc."empresaId"
    WHERE cc."saldoTotal" > 0
    GROUP BY cc."empresaId", cc."empleadoExternalId", cc."empleadoNombre", e.id
    ON CONFLICT DO NOTHING
    RETURNING id
  `, mesCierre)

  const cartera = Array.isArray(carteraInserted) ? carteraInserted.length : 0

  console.log(`[snapshot-mes] ✓ mes=${mesCierre} ventas=${ventas} recaudo=${recaudo} descuento=${descuento} cartera=${cartera}`)
  return { mes: mesCierre, ventas, recaudo, descuento, cartera }
}
