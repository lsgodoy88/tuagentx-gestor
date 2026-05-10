import { prisma } from '@/lib/prisma'

export async function recalcularVentasMesImpulsos(empresaId: string): Promise<void> {
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

  if (conApiId.length > 0) {
    const apiIds = conApiId.map((c: any) => c.apiId)
    const apiIdToClienteId = Object.fromEntries(conApiId.map((c: any) => [c.apiId, c.id]))

    const deudas = await (prisma as any).syncDeuda.findMany({
      where: {
        clienteApiId: { in: apiIds },
        modificadoEn: { gte: inicioVentana },
        condition: true,
      },
      select: { clienteApiId: true, valor: true, modificadoEn: true }
    })

    for (const d of deudas) {
      const clienteId = apiIdToClienteId[d.clienteApiId]
      if (!clienteId) continue
      const mes = d.modificadoEn
        ? new Date(d.modificadoEn).toISOString().slice(0, 7)
        : ahora.toISOString().slice(0, 7)
      const key = `${clienteId}::${mes}`
      if (!mapa.has(key)) mapa.set(key, { clienteId, mes, total: 0, count: 0 })
      const e = mapa.get(key)!
      e.total += Number(d.valor)
      e.count += 1
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
  console.log(`[ventaMes] ${empresaId} → ${ops.length} registros actualizados`)
}
