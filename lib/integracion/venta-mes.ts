import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// recalcularVentasMesImpulsos (2026-09-17 — slim)
// Fuente única: BD local. Sin HTTP a UpTres.
//   - Clientes con apiId → OrdenDespacho (isFacturada, isActiva, fechaOrdenBogota=invoicedAt)
//   - Clientes sin apiId → Visita tipo venta (caso borde, <2 registros en prod)
// Ventana: mes actual + 2 anteriores.
// Llamado por: job horario /api/sync/ventas-mes (guardian L-S 8am-6pm cada hora)

export async function recalcularVentasMesImpulsos(
  empresaId: string,
  _adapter?: any,         // ignorado — mantenido por compatibilidad de firma
  empleadoId?: string,
  soloClienteApiIds?: string[]
): Promise<void> {
  const clientesEnRutas = await (prisma as any).rutaFijaCliente.findMany({
    where: { rutaFija: { empresaId, ...(empleadoId ? { empleadoId } : {}) } },
    select: { clienteId: true },
    distinct: ['clienteId'],
  })
  if (clientesEnRutas.length === 0) return

  // Si se pasan clienteApiIds afectados, filtrar solo los que están en rutas fijas
  if (soloClienteApiIds && soloClienteApiIds.length > 0) {
    const clienteIdsEnRutas = new Set(clientesEnRutas.map((r: any) => r.clienteId))
    const clientesFiltrados = await prisma.cliente.findMany({
      where: { apiId: { in: soloClienteApiIds }, empresaId },
      select: { id: true }
    })
    const hayAfectados = clientesFiltrados.some((c: any) => clienteIdsEnRutas.has(c.id))
    if (!hayAfectados) return
  }

  const clienteIds = clientesEnRutas.map((r: any) => r.clienteId)
  const ahora = new Date()
  const inicioVentana = new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1)

  const clientes = await prisma.cliente.findMany({
    where: { id: { in: clienteIds } },
    select: { id: true, apiId: true }
  })

  const conApiId = clientes.filter((c: any) => c.apiId)
  const sinApiId = clientes.filter((c: any) => !c.apiId)

  const mapa = new Map<string, { clienteId: string; mes: string; total: number; count: number }>()

  // ── Clientes con ERP → OrdenDespacho local ────────────────────────────────
  if (conApiId.length > 0) {
    const apiIdToClienteId = Object.fromEntries(conApiId.map((c: any) => [c.apiId, c.id]))
    const ordenes = await (prisma as any).ordenDespacho.findMany({
      where: {
        clienteApiId: { in: conApiId.map((c: any) => c.apiId) },
        empresaId,
        isFacturada: true,
        isActiva: true,
        fechaOrdenBogota: { gte: inicioVentana },
      },
      select: { clienteApiId: true, totalOrden: true, fechaOrdenBogota: true }
    })
    for (const o of ordenes) {
      const clienteId = apiIdToClienteId[o.clienteApiId]
      if (!clienteId || !o.fechaOrdenBogota) continue
      const mes = new Date(o.fechaOrdenBogota).toISOString().slice(0, 7)
      const key = `${clienteId}::${mes}`
      if (!mapa.has(key)) mapa.set(key, { clienteId, mes, total: 0, count: 0 })
      const e = mapa.get(key)!
      e.total += Number(o.totalOrden || 0)
      e.count += 1
    }
  }

  // ── Clientes sin ERP → Visita (caso borde — <2 registros en prod) ─────────
  if (sinApiId.length > 0) {
    const ids = sinApiId.map((c: any) => c.id)
    const visitas = await prisma.visita.findMany({
      where: {
        clienteId: { in: ids },
        tipo: 'venta',
        monto: { gt: 0 },
        fechaBogota: { gte: inicioVentana },
      },
      select: { clienteId: true, monto: true, fechaBogota: true }
    })
    for (const v of visitas) {
      const mes = v.fechaBogota
        ? new Date(v.fechaBogota).toISOString().slice(0, 7)
        : ahora.toISOString().slice(0, 7)
      const key = `${v.clienteId}::${mes}`
      if (!mapa.has(key)) mapa.set(key, { clienteId: v.clienteId, mes, total: 0, count: 0 })
      const e = mapa.get(key)!
      e.total += Number(v.monto)
      e.count += 1
    }
  }

  const inicioMes = inicioVentana.toISOString().slice(0, 7)

  await (prisma as any).ventaMesCliente.deleteMany({
    where: { clienteId: { in: clienteIds }, mes: { lt: inicioMes } }
  })

  if (mapa.size === 0) return

  const entries = Array.from(mapa.values())
  const values = entries.map((_, i) => {
    const b = i * 6
    return `($${b+1}::text, $${b+2}::text, $${b+3}::text, $${b+4}::text, $${b+5}::float, $${b+6}::int, NOW())`
  }).join(',')
  const params = entries.flatMap(e => [randomUUID(), e.clienteId, empresaId, e.mes, e.total, e.count])

  await (prisma as any).$queryRawUnsafe(`
    INSERT INTO ${DB_SCHEMA}."VentaMesCliente" (id, "clienteId", "empresaId", mes, "totalVenta", "cantidadVisitas", "updatedAt")
    VALUES ${values}
    ON CONFLICT ("clienteId", mes) DO UPDATE
      SET "totalVenta" = EXCLUDED."totalVenta",
          "cantidadVisitas" = EXCLUDED."cantidadVisitas",
          "empresaId" = EXCLUDED."empresaId",
          "updatedAt" = NOW()
  `, ...params)
}
