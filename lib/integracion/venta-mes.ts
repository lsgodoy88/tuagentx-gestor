import { prisma } from '@/lib/prisma'

export async function recalcularVentasMesImpulsos(empresaId: string, adapter?: any): Promise<void> {
  const clientesEnRutas = await (prisma as any).rutaFijaCliente.findMany({
    where: { rutaFija: { empresaId } },
    select: { clienteId: true },
    distinct: ['clienteId'],
  })
  if (clientesEnRutas.length === 0) return

  const clienteIds = clientesEnRutas.map((r: any) => r.clienteId)
  const ahora = new Date()
  const inicioVentana = new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1)

  // Traer apiId de cada cliente para saber si tiene ERP
  const clientes = await prisma.cliente.findMany({
    where: { id: { in: clienteIds } },
    select: { id: true, apiId: true }
  })

  const mapa = new Map<string, { clienteId: string; mes: string; total: number; count: number }>()

  // Clientes con ERP → SyncDeuda
  const conApiId = clientes.filter((c: any) => c.apiId)
  const sinApiId = clientes.filter((c: any) => !c.apiId)

  if (conApiId.length > 0 && adapter) {
    const apiIdToClienteId = Object.fromEntries(conApiId.map((c: any) => [c.apiId, c.id]))

    // Traer ventas reales de UpTres por cada cliente (máx ~10 en rutas fijas)
    for (const cli of conApiId) {
      try {
        const ventas = await adapter.fetchVentas(inicioVentana, cli.apiId)
        for (const v of ventas) {
          if (v.cliente?.uid !== cli.apiId) continue // filtrar por cliente
          const fechaRaw = v.fCreado || v.fModificado
          if (!fechaRaw) continue
          const fecha = new Date(fechaRaw)
          if (isNaN(fecha.getTime())) continue
          const mes = fecha.toISOString().slice(0, 7)
          const clienteId = apiIdToClienteId[cli.apiId!]
          if (!clienteId) continue
          const key = `${clienteId}::${mes}`
          if (!mapa.has(key)) mapa.set(key, { clienteId, mes, total: 0, count: 0 })
          const e = mapa.get(key)!
          e.total += Number(v.vTotal || 0)
          e.count += 1
        }
      } catch {}
    }
  }

  // Clientes sin ERP → Visita
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

  const ops = Array.from(mapa.values()).map((e) =>
    (prisma as any).ventaMesCliente.upsert({
      where: { clienteId_mes: { clienteId: e.clienteId, mes: e.mes } },
      create: { clienteId: e.clienteId, empresaId, mes: e.mes, totalVenta: e.total, cantidadVisitas: e.count },
      update: { totalVenta: e.total, cantidadVisitas: e.count },
    })
  )

  if (ops.length > 0) await (prisma as any).$transaction(ops)
}
