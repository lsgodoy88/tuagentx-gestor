import { prisma, DB_SCHEMA } from '@/lib/prisma'

export async function recalcularVentasMesImpulsos(
  empresaId: string,
  adapter?: any,
  empleadoId?: string,
  // En modo delta: solo recalcular clientes de ruta fija con actividad real
  soloClienteApiIds?: string[]
): Promise<void> {
  const clientesEnRutas = await (prisma as any).rutaFijaCliente.findMany({
    where: { rutaFija: { empresaId, ...(empleadoId ? { empleadoId } : {}) } },
    select: { clienteId: true },
    distinct: ['clienteId'],
  })
  if (clientesEnRutas.length === 0) return

  // Si se pasan clienteApiIds afectados, filtrar solo los que están en rutas fijas
  // y tuvieron actividad — evita llamadas HTTP innecesarias en delta
  if (soloClienteApiIds && soloClienteApiIds.length > 0) {
    const clienteIdsEnRutas = new Set(clientesEnRutas.map((r: any) => r.clienteId))
    // Resolver clienteApiIds → clienteIds para cruzar
    const clientesFiltrados = await prisma.cliente.findMany({
      where: { apiId: { in: soloClienteApiIds }, empresaId },
      select: { id: true }
    })
    const hayAfectados = clientesFiltrados.some((c: any) => clienteIdsEnRutas.has(c.id))
    if (!hayAfectados) return // ningún cliente de ruta fija tuvo actividad
  }

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

  const inicioMes = inicioVentana.toISOString().slice(0, 7)

  // Limpiar meses fuera de ventana
  await (prisma as any).ventaMesCliente.deleteMany({
    where: { clienteId: { in: clienteIds }, mes: { lt: inicioMes } }
  })

  if (mapa.size === 0) return

  // INSERT ... ON CONFLICT DO UPDATE — atómico, seguro ante concurrencia entre empresas
  const entries = Array.from(mapa.values())
  const now = new Date()
  const values = entries.map((_, i) => {
    const b = i * 5
    return `(gen_random_uuid()::text, $${b+1}::text, $${b+2}::text, $${b+3}::text, $${b+4}::float, $${b+5}::int, NOW())`
  }).join(',')
  const params = entries.flatMap(e => [e.clienteId, empresaId, e.mes, e.total, e.count])

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
