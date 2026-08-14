import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { calcularEstado } from '@/lib/cartera'

function normalizarCache(c: any) {
  const clienteId    = c.clienteid    || c.clienteId    || null
  const clienteApiId = c.clienteapiid || c.clienteApiId || null
  const saldoPend    = Number(c.saldopendiente ?? c.saldoPendiente ?? 0)
  const saldoTot     = Number(c.saldototal     ?? c.saldoTotal     ?? 0)
  const porEstado    = c.porestado    || c.porEstado    || {}
  const deudas       = c.deudas || []
  const empleadoNombre = c.empleadonombre || c.empleadoNombre || null
  return {
    id: clienteId || clienteApiId,
    clienteId,
    _sincronizado: true,
    saldoPendiente: saldoPend,
    saldoTotal: saldoTot,
    porEstado,
    ultimaActualizacion: c.ultimaactualizacion || c.ultimaActualizacion,
    cliente: { id: clienteId, nombre: c.nombre, nit: c.nit, telefono: c.telefono, apiId: clienteApiId },
    empleado: empleadoNombre ? { nombre: empleadoNombre } : null,
    DetalleCartera: (deudas as any[]).map((d: any) => {
      const vf = Number(d.valor || 0), ab = Number(d.abono || 0), saldo = Math.max(0, vf - ab)
      const { estado, label, color } = calcularEstado(saldo, vf, ab, d.fechaVencimiento ? new Date(d.fechaVencimiento) : null)
      return { ...d, valorFactura: vf, abonos: ab, saldoPendiente: saldo, estado, estadoLabel: label, estadoColor: color }
    }),
    PagoCartera: [],
  }
}

export async function getListaCartera(params: {
  empresaId: string
  role: string
  userId: string
  userApiId?: string | null
  q: string
  page: number
  limit: number
}) {
  const { empresaId, role, userId, userApiId, q, page, limit } = params
  const skip = (page - 1) * limit

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
  })

  if (!integracion) {
    return { carteras: [], total: 0, page, pages: 0, totalSaldoPendiente: 0, totalSaldoTotal: 0 }
  }

  // Vendedor: filtrar por apiId
  let miApiId: string | null = null
  if (role === 'vendedor') {
    miApiId = userApiId || null
    if (!miApiId) {
      const emp = await (prisma as any).empleado.findUnique({ where: { id: userId }, select: { apiId: true } })
      miApiId = emp?.apiId || null
    }
    if (!miApiId) {
      return { carteras: [], total: 0, page, pages: 0, totalSaldoPendiente: 0, totalSaldoTotal: 0, _integracion: { id: integracion.id, nombre: integracion.nombre } }
    }
  }

  const integracionMeta = { id: integracion.id, nombre: integracion.nombre }

  if (miApiId) {
    const rows: any[] = q
      ? await prisma.$queryRaw`
          SELECT cc.*, COUNT(*) OVER() AS total_count,
            SUM(cc."saldoPendiente") OVER() AS sum_pendiente,
            SUM(cc."saldoTotal") OVER() AS sum_total
          FROM ${Prisma.raw(DB_SCHEMA)}."CarteraCache" cc
          WHERE cc."integracionId" = ${integracion.id}
            AND cc."saldoPendiente" > 0
            AND cc."clienteApiId" IN (
              SELECT DISTINCT "clienteApiId" FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda"
              WHERE "integracionId" = ${integracion.id}
                AND "empleadoExternalId" = ${miApiId}
                AND condition = true
            )
            AND (cc.nombre ILIKE ${`%${q}%`} OR cc.nit ILIKE ${`%${q}%`})
          ORDER BY cc.nombre ASC
          LIMIT ${limit} OFFSET ${skip}`
      : await prisma.$queryRaw`
          SELECT cc.*, COUNT(*) OVER() AS total_count,
            SUM(cc."saldoPendiente") OVER() AS sum_pendiente,
            SUM(cc."saldoTotal") OVER() AS sum_total
          FROM ${Prisma.raw(DB_SCHEMA)}."CarteraCache" cc
          WHERE cc."integracionId" = ${integracion.id}
            AND cc."saldoPendiente" > 0
            AND cc."clienteApiId" IN (
              SELECT DISTINCT "clienteApiId" FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda"
              WHERE "integracionId" = ${integracion.id}
                AND "empleadoExternalId" = ${miApiId}
                AND condition = true
            )
          ORDER BY cc.nombre ASC
          LIMIT ${limit} OFFSET ${skip}`

    const total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0
    const totalSaldoPendiente = rows.length > 0 ? Number(rows[0].sum_pendiente ?? 0) : 0
    const totalSaldoTotal = rows.length > 0 ? Number(rows[0].sum_total ?? 0) : 0

    return { carteras: rows.map(normalizarCache), total, page, pages: Math.ceil(total / limit), totalSaldoPendiente, totalSaldoTotal, _integracion: integracionMeta }
  }

  // Admin/supervisor
  const where: any = { integracionId: integracion.id, saldoPendiente: { gt: 0 } }
  if (q) where.OR = [{ nombre: { contains: q, mode: 'insensitive' } }, { nit: { contains: q, mode: 'insensitive' } }]

  const [caches, total, agg] = await Promise.all([
    (prisma as any).carteraCache.findMany({ where, skip, take: limit, orderBy: { nombre: 'asc' } }),
    (prisma as any).carteraCache.count({ where }),
    (prisma as any).carteraCache.aggregate({ where, _sum: { saldoPendiente: true, saldoTotal: true } }),
  ])

  return {
    carteras: caches.map(normalizarCache),
    total,
    page,
    pages: Math.ceil(total / limit),
    totalSaldoPendiente: Number(agg._sum.saldoPendiente || 0),
    totalSaldoTotal: Number(agg._sum.saldoTotal || 0),
    _integracion: integracionMeta,
  }
}
