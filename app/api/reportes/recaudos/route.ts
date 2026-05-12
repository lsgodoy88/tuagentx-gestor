import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') // YYYY-MM
  const empleadoId = searchParams.get('empleadoId')
  const metodo = searchParams.get('metodo')

  // Rango de fechas Bogotá → UTC
  let desde: Date | undefined
  let hasta: Date | undefined
  if (mes) {
    const [y, m] = mes.split('-').map(Number)
    // Bogotá UTC-5: día 1 de mes a las 00:00 Bogotá = 05:00 UTC
    desde = new Date(Date.UTC(y, m - 1, 1, 5, 0, 0))
    hasta = new Date(Date.UTC(y, m, 1, 5, 0, 0))
  }

  // Empleados de la empresa
  const empleados = await prisma.empleado.findMany({
    where: { empresaId },
    select: { id: true, nombre: true }
  })
  const empleadoIds = empleados.map(e => e.id)
  const empleadoMap: Record<string, string> = {}
  empleados.forEach(e => { empleadoMap[e.id] = e.nombre })

  const where: any = { empleadoId: { in: empleadoIds } }
  if (empleadoId && empleadoId !== 'all') where.empleadoId = empleadoId
  if (metodo && metodo !== 'all') where.metodopago = metodo
  if (desde && hasta) {
    // Filtrar por fechaPago — si es NULL, fallback a createdAt
    where.OR = [
      { fechaPago: { gte: desde, lt: hasta } },
      { AND: [{ fechaPago: null }, { createdAt: { gte: desde, lt: hasta } }] }
    ]
  }

  const pagos = await (prisma as any).pagoCartera.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      createdAt: true,
      fechaPago: true,
      empleadoId: true,
      monto: true,
      descuento: true,
      saldoAnterior: true,
      numeroFactura: true,
      metodopago: true,
      voucherKey: true,
      reciboToken: true,
      tokenExpira: true,
      notas: true,
      clienteApiId: true,
      clienteNombre: true,
      valorFactura: true,
      vendedorNombre: true,
      carteraId: true,
      syncDeudaId: true,
      Cartera: { select: { Cliente: { select: { nombre: true } } } },
    }
  })

  // Para pagos en modo sync (syncDeudaId) — traer cliente desde SyncDeuda
  const syncDeudaIds = pagos.filter((p: any) => p.syncDeudaId).map((p: any) => p.syncDeudaId)
  const syncDeudas = syncDeudaIds.length > 0
    ? await (prisma as any).syncDeuda.findMany({
        where: { id: { in: syncDeudaIds } },
        select: { id: true, clienteApiId: true, valor: true, numeroFactura: true }
      })
    : []
  const sdMap: Record<string, any> = {}
  syncDeudas.forEach((sd: any) => { sdMap[sd.id] = sd })

  const clienteApiIds = Array.from(new Set(syncDeudas.map((sd: any) => sd.clienteApiId).filter(Boolean))) as string[]
  const clientesSync = clienteApiIds.length > 0
    ? await prisma.cliente.findMany({
        where: { apiId: { in: clienteApiIds }, empresaId },
        select: { apiId: true, nombre: true }
      })
    : []
  const cliSyncMap: Record<string, string> = {}
  clientesSync.forEach(c => { if (c.apiId) cliSyncMap[c.apiId] = c.nombre })

  // Cartera DetalleCartera para modo manual — valor de la deuda
  const carteraIds = pagos.filter((p: any) => p.carteraId && !p.syncDeudaId).map((p: any) => p.carteraId)
  const detalles = carteraIds.length > 0
    ? await (prisma as any).detalleCartera.findMany({
        where: { carteraId: { in: carteraIds } },
        select: { carteraId: true, valorFactura: true, numeroFactura: true }
      })
    : []
  const detMap: Record<string, any> = {}
  detalles.forEach((d: any) => { detMap[d.carteraId] = d })

  // Renovar tokens expirados — admin puede ver recibos viejos
  const ahora = new Date()
  const expirados = pagos.filter((p: any) =>
    p.reciboToken && p.tokenExpira && new Date(p.tokenExpira) < ahora
  )
  for (const p of expirados) {
    const nuevoToken = randomBytes(24).toString('hex')
    const nuevaExp = new Date(Date.now() + 15 * 60 * 1000) // 15min
    await (prisma as any).pagoCartera.update({
      where: { id: p.id },
      data: { reciboToken: nuevoToken, tokenExpira: nuevaExp }
    })
    p.reciboToken = nuevoToken
  }

  const filas = pagos.map((p: any) => {
    // Prioridad: datos congelados al momento del pago → fallback a JOINs (pagos viejos)
    let cliente = p.clienteNombre || ''
    let venta: number | null = p.valorFactura !== null ? Number(p.valorFactura) : null
    let factura: number | null = p.numeroFactura ?? null

    // Fallback a JOIN si datos congelados están vacíos (pagos viejos)
    if (!cliente || venta === null) {
      if (p.syncDeudaId && sdMap[p.syncDeudaId]) {
        const sd = sdMap[p.syncDeudaId]
        if (!cliente) cliente = cliSyncMap[sd.clienteApiId] || ''
        if (venta === null) venta = Number(sd.valor) || null
        factura = factura ?? sd.numeroFactura ?? null
      } else if (p.Cartera?.Cliente?.nombre) {
        if (!cliente) cliente = p.Cartera.Cliente.nombre
        const det = detMap[p.carteraId]
        if (det) {
          if (venta === null) venta = Number(det.valorFactura) || null
          factura = factura ?? det.numeroFactura ?? null
        }
      }
    }

    return {
      id: p.id,
      registrado: p.createdAt,
      pagado: p.fechaPago ?? p.createdAt,
      vendedor: p.vendedorNombre || empleadoMap[p.empleadoId] || '—',
      empleadoId: p.empleadoId,
      cliente,
      factura,
      venta,
      saldoAnterior: p.saldoAnterior !== null ? Number(p.saldoAnterior) : null,
      monto: Number(p.monto),
      descuento: Number(p.descuento || 0),
      metodo: p.metodopago,
      voucherKey: p.voucherKey,
      reciboToken: p.reciboToken,
      notas: p.notas,
    }
  })

  // Totales
  const totalMonto = filas.reduce((s: number, f: any) => s + f.monto, 0)
  const totalDescuento = filas.reduce((s: number, f: any) => s + f.descuento, 0)
  const porMetodo: Record<string, { count: number, total: number }> = {}
  filas.forEach((f: any) => {
    if (!porMetodo[f.metodo]) porMetodo[f.metodo] = { count: 0, total: 0 }
    porMetodo[f.metodo].count++
    porMetodo[f.metodo].total += f.monto
  })

  return NextResponse.json({
    filas,
    empleados,
    totales: {
      cantidad: filas.length,
      totalMonto,
      totalDescuento,
      totalRecaudado: totalMonto + totalDescuento,
      porMetodo,
    }
  })
}
