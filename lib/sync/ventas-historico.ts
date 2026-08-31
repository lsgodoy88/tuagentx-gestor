/**
 * syncVentasHistorico — sync histórico de ventas (3 meses) para clientes nuevos en ruta.
 * Llamado directamente desde /api/impulsadora al agregar clientes — sin HTTP loopback.
 */
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { randomUUID } from 'crypto'

const MESES_ATRAS = 3

export async function syncVentasHistorico(params: {
  clienteIds: string[]
  empresaId: string
}): Promise<{ actualizados: number; clientesSincronizados: number }> {
  const { clienteIds, empresaId } = params

  if (!clienteIds.length) return { actualizados: 0, clientesSincronizados: 0 }

  // Solo clientes con apiId
  const clientes = await prisma.cliente.findMany({
    where: { id: { in: clienteIds }, apiId: { not: null } },
    select: { id: true, apiId: true, nombre: true },
  })

  if (!clientes.length) return { actualizados: 0, clientesSincronizados: 0 }

  // Integración UpTres
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
  })
  if (!integracion) {
    console.warn('[syncVentasHistorico] Sin integración activa para empresa', empresaId)
    return { actualizados: 0, clientesSincronizados: 0 }
  }

  const cfg = integracion.config as any
  const apiSecret = decrypt(cfg.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(cfg.apiKey, apiSecret)
  await adapter.login()

  // Rango: inicio del mes hace MESES_ATRAS hasta hoy
  const ahora = new Date()
  const desde = new Date(ahora.getFullYear(), ahora.getMonth() - MESES_ATRAS, 1)
  const hasta = ahora

  const mapa = new Map<string, { clienteId: string; mes: string; total: number; count: number }>()

  for (const cli of clientes) {
    try {
      const ventas = await adapter.fetchVentasHistorico(desde, hasta, cli.apiId!)
      const ventasFiltradas = ventas.filter((v: any) => v.cliente?.uid === cli.apiId)
      for (const v of ventasFiltradas) {
        const fechaRaw = v.fCreado || v.fModificado
        if (!fechaRaw) continue
        const fecha = new Date(fechaRaw)
        if (isNaN(fecha.getTime())) continue
        const mes = fecha.toISOString().slice(0, 7)
        const key = `${cli.id}::${mes}`
        if (!mapa.has(key)) mapa.set(key, { clienteId: cli.id, mes, total: 0, count: 0 })
        const e = mapa.get(key)!
        e.total += Number(v.vTotal || 0)
        e.count += 1
      }
    } catch (err) {
      console.error(`[syncVentasHistorico] Error cliente ${cli.nombre} (${cli.apiId}):`, err)
    }
  }

  if (mapa.size > 0) {
    const ops = Array.from(mapa.values()).map(e =>
      (prisma as any).ventaMesCliente.upsert({
        where: { clienteId_mes: { clienteId: e.clienteId, mes: e.mes } },
        create: { id: randomUUID(), clienteId: e.clienteId, empresaId, mes: e.mes, totalVenta: e.total, cantidadVisitas: e.count },
        update: { totalVenta: e.total, cantidadVisitas: e.count },
      })
    )
    await (prisma as any).$transaction(ops)
  }

  return { actualizados: mapa.size, clientesSincronizados: clientes.length }
}
