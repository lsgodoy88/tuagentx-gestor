import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'
import { calcularEstado } from '@/lib/cartera'
import { getConsecutivo } from '@/lib/consecutivo' 

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const empleadoId = user.role === 'empresa' ? null : user.id

  const body = await req.json()
  const { syncDeudaIds, clienteApiId, monto, descuento = 0, metodoPago = 'efectivo', notas, voucherKey, voucherDatosIA, lineasPago, lat, lng, gpsAccuracy } = body

  if (!clienteApiId || !monto) return NextResponse.json({ error: 'clienteApiId y monto requeridos' }, { status: 400 })

  const cliente = await prisma.cliente.findFirst({
    where: { apiId: clienteApiId, empresaId },
    select: { id: true }
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  let empId = empleadoId
  if (!empId) {
    const emp = await prisma.empleado.findFirst({ where: { empresaId, activo: true } })
    if (!emp) return NextResponse.json({ error: 'Sin empleado activo' }, { status: 400 })
    empId = emp.id
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { configRecibos: true }
  })
  const anchoPapel = (empresa as any)?.configRecibos?.anchoPapel || '80mm'

  // Si vienen lineas (multi-metodo), agregamos
  const lineasValidas = Array.isArray(lineasPago)
    ? lineasPago.filter((l: any) => Number(l?.monto || 0) > 0).map((l: any) => ({
        metodoPago: l.metodoPago || 'efectivo',
        monto: Number(l.monto || 0),
        descuento: Number(l.descuento || 0),
        voucherKey: l.voucherKey || null,
        voucherDatosIA: l.voucherDatosIA || null,
      }))
    : []
  const montoNum = lineasValidas.length > 0
    ? lineasValidas.reduce((s: number, l: any) => s + l.monto, 0)
    : Number(monto)
  const descuentoNum = lineasValidas.length > 0
    ? lineasValidas.reduce((s: number, l: any) => s + l.descuento, 0)
    : Number(descuento)
  const metodoPagoFinal = lineasValidas.length > 1 ? 'mixto' : (lineasValidas[0]?.metodoPago || metodoPago)
  const totalAplicado = montoNum + descuentoNum

  // Buscar deudas por externalId, ordenadas FIFO (más antigua primero)
  const externalIds = Array.isArray(syncDeudaIds) ? syncDeudaIds : []
  const deudas = externalIds.length > 0
    ? await (prisma as any).syncDeuda.findMany({
        where: { externalId: { in: externalIds }, clienteApiId },
        orderBy: [{ fechaVencimiento: 'asc' }, { numeroFactura: 'asc' }],
      })
    : []

  const reciboToken = randomBytes(24).toString('hex')
  const tokenExpira = new Date(Date.now() + 15 * 60 * 1000)
  let numeroRecibo: string | null = null
  try { numeroRecibo = await getConsecutivo(empId) } catch {}

  // Aplicación FIFO: cubrir totalmente la más antigua, luego la siguiente
  const aplicaciones: { syncDeudaId: string, numeroFactura: number | null, externalId: string, montoAplicado: number }[] = []
  let restante = totalAplicado
  for (const d of deudas) {
    if (restante <= 0) break
    const saldoActual = Number(d.saldo)
    if (saldoActual <= 0) continue
    const aplicar = Math.min(saldoActual, restante)
    aplicaciones.push({
      syncDeudaId: d.id,
      numeroFactura: d.numeroFactura ?? null,
      externalId: d.externalId,
      montoAplicado: aplicar,
    })
    restante -= aplicar
  }

  const pago = await (prisma as any).pagoCartera.create({
    data: {
      empleadoId: empId,
      monto: montoNum,
      descuento: descuentoNum,
      tipo: 'abono',
      metodopago: metodoPagoFinal,
      notas: notas || null,
      ...(lineasValidas.length > 0 ? { lineasPago: lineasValidas } : {}),
      ...(lat != null && lng != null ? { latCobro: Number(lat), lngCobro: Number(lng), gpsAccuracy: gpsAccuracy != null ? Number(gpsAccuracy) : null } : {}),
      numeroRecibo,
      reciboToken,
      tokenExpira,
      ...(aplicaciones.length > 0 ? { syncDeudaId: aplicaciones[0].syncDeudaId } : {}),
      ...(lineasValidas.length === 0 && ['transferencia', 'nequi', 'banco'].includes(metodoPago) && voucherKey ? {
        voucherKey,
        voucherDatosIA: voucherDatosIA ?? undefined,
      } : {}),
      ...(aplicaciones.length > 0 ? {
        Aplicaciones: {
          create: aplicaciones.map(a => ({
            syncDeudaId: a.syncDeudaId,
            numeroFactura: a.numeroFactura,
            externalId: a.externalId,
            montoAplicado: a.montoAplicado,
          }))
        }
      } : {}),
    }
  })

  // Actualizar saldos de cada deuda aplicada
  for (const a of aplicaciones) {
    const d = deudas.find((x: any) => x.id === a.syncDeudaId)
    if (!d) continue
    const nuevoSaldo = Math.max(0, Number(d.saldo) - a.montoAplicado)
    const nuevoAbono = Number(d.abono || 0) + a.montoAplicado
    await (prisma as any).syncDeuda.update({
      where: { id: d.id },
      data: { saldo: nuevoSaldo, abono: nuevoAbono, condition: nuevoSaldo > 0 }
    })
  }

  // Repoblar cache del cliente
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
    select: { id: true }
  })
  if (integracion) {
    const { actualizarCache } = await import('@/lib/integracion/sync')
    await actualizarCache(new Set([clienteApiId]), integracion.id, empresaId)
  }

  return NextResponse.json({ pago, anchoPapel })
}
