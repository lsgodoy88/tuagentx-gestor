/**
 * snapshot-mes.ts
 * Cierra el mes anterior y guarda snapshots de ventas y recaudo
 * por vendedor en SnapshotMes. Se ejecuta el día 1 de cada mes.
 * Misma lógica que stats/route.ts (createdAt, isActiva=true).
 */

import { prisma } from '@/lib/prisma'
import { calcularNSaldoBatch } from '@/lib/cartera/calcularSaldo'

const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

export async function runSnapshotMes(mesOverride?: string): Promise<{ ventas: number; recaudo: number; descuento: number; cartera: number; mes: string }> {
  // Mes a cerrar: el anterior al actual, o el override para backfill
  const ahora = new Date()
  const mesCierre = mesOverride ?? `${ahora.getFullYear()}-${String(ahora.getMonth()).padStart(2, '0')}`
  // ahora.getMonth() sin +1 = mes anterior

  console.log(`[snapshot-mes] Cerrando mes ${mesCierre}`)

  // Limpiar snapshots existentes del mes para recalcular desde cero
  await (prisma as any).$executeRawUnsafe(`DELETE FROM ${DB_SCHEMA}."SnapshotMes" WHERE mes = $1 AND tipo IN ('ventas','recaudo','descuento','cartera')`, mesCierre)

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
    LEFT JOIN ${DB_SCHEMA}."Empleado" e ON e."apiId" = od."vendedorApiId" AND e."empresaId" = od."empresaId"
    LEFT JOIN ${DB_SCHEMA}."MetaVenta" mv ON mv."empleadoId" = e.id
      AND mv.mes = EXTRACT(MONTH FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
      AND mv.anio = EXTRACT(YEAR  FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
    WHERE od."isActiva" = true
      AND od."isFacturada" = true
      AND TO_CHAR(od."fechaFactura" AT TIME ZONE 'America/Bogota', 'YYYY-MM') = $1
    GROUP BY od."empresaId", od."vendedorApiId", COALESCE(e.nombre, 'Sin asignar')
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
    RETURNING id
  `, mesCierre)

  const descuento = Array.isArray(descuentoInserted) ? descuentoInserted.length : 0

  // Cartera al cierre — nSaldo real por vendedor usando calcularNSaldoBatch (misma lógica que PDF)
  // 1. Traer todas las deudas activas con saldo > 0 por empresa/vendedor
  const integraciones: any[] = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true },
  })

  let carteraCount = 0
  for (const integ of integraciones) {
    const deudas: any[] = await (prisma as any).$queryRawUnsafe(`
      SELECT sd.id, sd.valor, sd.saldo, sd."nSaldo", sd."nSaldoBase", sd."nSaldoBaseAt",
             sd."ajusteManual", sd."empleadoExternalId", sd."clienteApiId"
      FROM ${DB_SCHEMA}."SyncDeuda" sd
      WHERE sd."integracionId" = $1
        AND sd.condition = true
        AND sd."clienteApiId" IS NOT NULL
        AND sd.saldo::numeric > 0
        AND sd."empleadoExternalId" IS NOT NULL
    `, integ.id)

    if (deudas.length === 0) continue

    const deudaIds = deudas.map((d: any) => d.id)
    const aplicaciones: any[] = await (prisma as any).$queryRawUnsafe(`
      SELECT pcd."syncDeudaId", pcd."montoAplicado", pcd."createdAt"
      FROM ${DB_SCHEMA}."PagoCarteraDeuda" pcd
      WHERE pcd."syncDeudaId" = ANY($1::text[])
    `, deudaIds)

    const nSaldos = calcularNSaldoBatch(deudas, aplicaciones)

    // Agrupar nSaldo por vendedorApiId
    const porVendedor = new Map<string, { total: number; clientes: Set<string> }>()
    for (const d of deudas) {
      const { nSaldo } = nSaldos[d.id] ?? { nSaldo: 0 }
      if (nSaldo <= 0) continue
      const vid = d.empleadoExternalId
      if (!porVendedor.has(vid)) porVendedor.set(vid, { total: 0, clientes: new Set() })
      const entry = porVendedor.get(vid)!
      entry.total += nSaldo
      if (d.clienteApiId) entry.clientes.add(d.clienteApiId)
    }

    if (porVendedor.size === 0) continue

    // Resolver nombres de empleados
    const apiIds = [...porVendedor.keys()]
    const empleados: any[] = await (prisma as any).empleado.findMany({
      where: { apiId: { in: apiIds }, empresaId: integ.empresaId },
      select: { id: true, apiId: true, nombre: true },
    })
    const empMap = new Map(empleados.map((e: any) => [e.apiId, e]))

    // Upsert un row por vendedor
    const upserts = [...porVendedor.entries()].map(([apiId, data]) => {
      const emp = empMap.get(apiId)
      return (prisma as any).$queryRawUnsafe(`
        INSERT INTO ${DB_SCHEMA}."SnapshotMes" (id, empresa_id, mes, tipo, empleado_id, vendedor_api_id, entidad_nombre, datos, creado_en, updated_en)
        VALUES ($1, $2, $3, 'cartera', $4, $5, $6, $7::jsonb, NOW(), NOW())
        ON CONFLICT ON CONSTRAINT "SnapshotMes_unique"
          DO UPDATE SET datos = EXCLUDED.datos, entidad_nombre = EXCLUDED.entidad_nombre, updated_en = NOW()
      `,
        `snap-${integ.empresaId}-${apiId}-${mesCierre}`.slice(0, 30) + Math.random().toString(36).slice(2,8),
        integ.empresaId,
        mesCierre,
        emp?.id ?? null,
        apiId,
        emp?.nombre ?? 'Sin nombre',
        JSON.stringify({ total: Math.round(data.total), clientes: data.clientes.size })
      )
    })
    await Promise.all(upserts)
    carteraCount += upserts.length
  }

  const cartera = carteraCount

  console.log(`[snapshot-mes] ✓ mes=${mesCierre} ventas=${ventas} recaudo=${recaudo} descuento=${descuento} cartera=${cartera}`)
  return { mes: mesCierre, ventas, recaudo, descuento, cartera }
}
