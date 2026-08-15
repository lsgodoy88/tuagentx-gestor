import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { resolverEmpresaIdOrigen, resolverEmpresaIdOperador } from '@/lib/bodega'

const LIMIT = 50

export async function getDespachoLog(params: {
  empresaId: string
  origenId: string
  cursor: string | null
  role: string
  apiId?: string
}) {
  const { empresaId, origenId, cursor, role, apiId } = params

  let empresaIdLog: string
  let empresaIdOrden: string

  if (origenId && origenId !== 'propia') {
    empresaIdLog = empresaId
    empresaIdOrden = await resolverEmpresaIdOrigen(prisma, empresaId, origenId)
  } else {
    empresaIdOrden = empresaId
    empresaIdLog = await resolverEmpresaIdOperador(prisma, empresaId)
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT l.id, l."numeroFactura", l."clienteNombre", l.modo, l."guiaTransporte", l.transportadora, l."despachadoEl", l."despachadoPorNombre",
           o."alistadoEl", o.ciudad, o."fotosAlistamiento", o."fotoAlistamiento",
           o.id as "ordenId", o."fechaOrden", o."fechaFactura", o.direccion,
           o."num_cajas", o."entregadoEl", o."firmaEntrega", COALESCE(l."observacion", o."observacion") as observacion,
           o."urlSeguimiento",
           ap.nombre as "alistadoPorNombre",
           rp.nombre as "repartidorNombre",
           vnd.nombre as "vendedorNombre"
    FROM ${DB_SCHEMA}."DespachoLog" l
    INNER JOIN ${DB_SCHEMA}."OrdenDespacho" o
      ON o."numeroFactura" = l."numeroFactura"
      AND o."empresaId" = $2
    LEFT JOIN ${DB_SCHEMA}."Empleado" ap ON ap.id = o."alistadoPorId"
    LEFT JOIN ${DB_SCHEMA}."Empleado" rp ON rp.id = o."repartidorId"
    LEFT JOIN ${DB_SCHEMA}."Empleado" vnd ON vnd."apiId" = o."vendedorApiId" AND vnd."empresaId" = $2
    WHERE l."empresaId" IN ($1, $2)
      ${role === 'vendedor' && apiId ? `AND o."vendedorApiId" = '${apiId.replace(/'/g, "''")}'` : ''}
      ${cursor ? `AND l."despachadoEl" < (SELECT "despachadoEl" FROM ${DB_SCHEMA}."DespachoLog" WHERE id = '${cursor.replace(/'/g, "''")}' LIMIT 1)` : ''}
    GROUP BY l.id, l."numeroFactura", l."clienteNombre", l.modo, l."guiaTransporte", l.transportadora, l."despachadoEl", l."despachadoPorNombre", o."alistadoEl", o.ciudad, o."fotosAlistamiento", o."fotoAlistamiento", o.id, o."fechaOrden", o."fechaFactura", o.direccion, o."num_cajas", o."entregadoEl", o."firmaEntrega", o."urlSeguimiento", ap.nombre, rp.nombre, vnd.nombre
    ORDER BY l."despachadoEl" DESC
    LIMIT ${LIMIT + 1}
  `, empresaIdLog, empresaIdOrden)

  const hayMas = rows.length > LIMIT
  const data = hayMas ? rows.slice(0, LIMIT) : rows
  const nextCursor = hayMas ? data[data.length - 1].id : null

  const serialized = data.map((r: any) => ({
    ...r,
    despachadoEl: r.despachadoEl instanceof Date ? r.despachadoEl.toISOString() : (String(r.despachadoEl).endsWith('Z') ? String(r.despachadoEl) : String(r.despachadoEl) + 'Z'),
    alistadoEl: r.alistadoEl instanceof Date ? r.alistadoEl.toISOString() : r.alistadoEl ? (String(r.alistadoEl).endsWith('Z') ? String(r.alistadoEl) : String(r.alistadoEl) + 'Z') : null,
    ciudad: r.ciudad || null,
    fotosAlistamiento: r.fotosAlistamiento || null,
    fotoAlistamiento: r.fotoAlistamiento || null,
    direccion: r.direccion || null,
    fechaOrden: r.fechaOrden instanceof Date ? r.fechaOrden.toISOString() : r.fechaOrden || null,
    fechaFactura: r.fechaFactura instanceof Date ? r.fechaFactura.toISOString() : r.fechaFactura || null,
    entregadoEl: r.entregadoEl instanceof Date ? r.entregadoEl.toISOString() : r.entregadoEl || null,
    num_cajas: r.num_cajas ?? 0,
    urlSeguimiento: r.urlSeguimiento || null,
    alistadoPor: r.alistadoPorNombre ? { nombre: r.alistadoPorNombre } : null,
    repartidor: r.repartidorNombre ? { nombre: r.repartidorNombre } : null,
  }))

  return { data: serialized, nextCursor, hayMas }
}
