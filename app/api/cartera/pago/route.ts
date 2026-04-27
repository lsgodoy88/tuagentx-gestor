import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcularEstado } from '@/lib/cartera'
import { getConsecutivo } from '@/lib/consecutivo'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const pagoWhere: any = { Cartera: { empresaId } }
  if (user.role === 'vendedor') pagoWhere.empleadoId = user.id
  const pagos = await prisma.pagoCartera.findMany({
    where: pagoWhere,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      Cartera: { include: { Cliente: { select: { id: true, nombre: true, nit: true } } } },
      Empleado: { select: { id: true, nombre: true } },
    }
  })
  const normalized = pagos.map((p: any) => ({
    ...p,
    metodoPago: p.metodopago,
    cartera: { ...p.Cartera, cliente: p.Cartera?.Cliente },
    empleado: p.Empleado,
  }))
  return NextResponse.json({ pagos: normalized })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const empleadoId = user.role === 'empresa' ? null : user.id
  const body = await req.json()
  const { carteraId, monto, descuento = 0, tipo = 'abono', metodoPago = 'efectivo', notas, detalleIds, voucherKey, voucherDatosIA } = body

  if (!carteraId || !monto) return NextResponse.json({ error: 'carteraId y monto requeridos' }, { status: 400 })

  const cartera = await prisma.cartera.findFirst({ where: { id: carteraId, empresaId }, include: { Empresa: { select: { configRecibos: true } } } })
  if (!cartera) return NextResponse.json({ error: 'Cartera no encontrada' }, { status: 404 })

  let empId = empleadoId
  if (!empId) {
    const emp = await prisma.empleado.findFirst({
      where: { empresaId, activo: true, ...(cartera.empleadoId ? { id: cartera.empleadoId } : {}) }
    })
    if (!emp) return NextResponse.json({ error: 'No hay empleados activos para registrar pago' }, { status: 400 })
    empId = emp.id
  }

  const montoNum = Number(monto)
  const descuentoNum = Number(descuento)
  const totalAplicado = montoNum + descuentoNum

  let numeroRecibo: string | null = null
  try { numeroRecibo = await getConsecutivo(empId) } catch {}

  // Token temporal 15 minutos
  const reciboToken = randomBytes(24).toString('hex')
  const tokenExpira = new Date(Date.now() + 15 * 60 * 1000)

  const pago = await prisma.pagoCartera.create({
    data: {
      carteraId,
      empleadoId: empId,
      monto: montoNum,
      descuento: descuentoNum,
      tipo,
      metodopago: metodoPago,
      notas: notas || null,
      numeroRecibo,
      reciboToken,
      tokenExpira,
      ...(['transferencia', 'nequi', 'banco'].includes(metodoPago) && voucherKey ? {
        voucherKey,
        voucherDatosIA: voucherDatosIA ?? undefined,
      } : {}),
    }
  })

  if (Array.isArray(detalleIds) && detalleIds.length > 0) {
    const detalles = await prisma.detalleCartera.findMany({ where: { id: { in: detalleIds }, carteraId } })
    const saldoTotal = detalles.reduce((acc: number, d: any) => {
      const vf = Number(d.valorFactura ?? d.valor)
      const ab = Number(d.abonos ?? 0)
      return acc + Math.max(0, vf - ab)
    }, 0)
    for (const d of detalles as any[]) {
      const vf = Number(d.valorFactura ?? d.valor)
      const ab = Number(d.abonos ?? 0)
      const saldoFactura = Math.max(0, vf - ab)
      const proporcion = saldoTotal > 0 ? saldoFactura / saldoTotal : 1 / detalles.length
      const abonoFactura = Math.min(saldoFactura, totalAplicado * proporcion)
      const nuevosAbonos = ab + abonoFactura
      const nuevaSaldo = Math.max(0, vf - nuevosAbonos)
      const { estado } = calcularEstado(nuevaSaldo, vf, nuevosAbonos, d.fechaVencimiento ?? null)
      await prisma.detalleCartera.update({ where: { id: d.id }, data: { abonos: nuevosAbonos, estado } })
    }
  } else if (tipo === 'total') {
    await prisma.detalleCartera.updateMany({
      where: { carteraId, estado: { not: 'pagada' } },
      data: { estado: 'pagada' }
    })
  }

  const todosDetalles = await prisma.detalleCartera.findMany({ where: { carteraId } })
  const nuevoSaldo = todosDetalles.reduce((acc: number, d: any) => {
    if (d.estado === 'pagada') return acc
    const vf = Number(d.valorFactura ?? d.valor)
    const ab = Number(d.abonos ?? 0)
    return acc + Math.max(0, vf - ab)
  }, 0)

  await prisma.cartera.update({
    where: { id: carteraId },
    data: { saldoPendiente: Math.max(0, nuevoSaldo), updatedAt: new Date() }
  })

  const cfgEmp = (cartera as any)?.Empresa?.configRecibos as any
  const anchoPapel = cfgEmp?.anchoPapel || '80mm'
  return NextResponse.json({ pago, saldoPendiente: Math.max(0, nuevoSaldo), anchoPapel })
}
