import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'
import { calcularEstado } from '@/lib/cartera'

async function getConsecutivo(empleadoId: string): Promise<string> {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yy = String(now.getFullYear()).slice(-2)
  const count = await (prisma as any).pagoCartera.count({ where: { empleadoId } })
  return `REC-${mm}${yy}-${String(count + 1).padStart(3, '0')}`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const empleadoId = user.role === 'empresa' ? null : user.id

  const body = await req.json()
  const { syncDeudaIds, clienteApiId, monto, descuento = 0, metodoPago = 'efectivo', notas, voucherKey, voucherDatosIA } = body

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

  const montoNum = Number(monto)
  const descuentoNum = Number(descuento)
  const totalAplicado = montoNum + descuentoNum

  // Buscar deudas por externalId
  const externalIds = Array.isArray(syncDeudaIds) ? syncDeudaIds : []
  const deudas = externalIds.length > 0
    ? await (prisma as any).syncDeuda.findMany({ where: { externalId: { in: externalIds }, clienteApiId } })
    : []

  const reciboToken = randomBytes(24).toString('hex')
  const tokenExpira = new Date(Date.now() + 15 * 60 * 1000)
  let numeroRecibo: string | null = null
  try { numeroRecibo = await getConsecutivo(empId) } catch {}

  const pago = await (prisma as any).pagoCartera.create({
    data: {
      empleadoId: empId,
      monto: montoNum,
      descuento: descuentoNum,
      tipo: 'abono',
      metodopago: metodoPago,
      notas: notas || null,
      numeroRecibo,
      reciboToken,
      tokenExpira,
      ...(deudas.length > 0 ? { syncDeudaId: deudas[0].id } : {}),
      ...(['transferencia', 'nequi', 'banco'].includes(metodoPago) && voucherKey ? {
        voucherKey,
        voucherDatosIA: voucherDatosIA ?? undefined,
      } : {}),
    }
  })

  // Aplicar abono a cada deuda proporcionalmente
  if (deudas.length > 0) {
    const saldoTotal = deudas.reduce((s: number, d: any) => s + Number(d.saldo), 0)
    for (const d of deudas) {
      const proporcion = saldoTotal > 0 ? Number(d.saldo) / saldoTotal : 1 / deudas.length
      const abonoDeuda = Math.min(Number(d.saldo), totalAplicado * proporcion)
      const nuevoSaldo = Math.max(0, Number(d.saldo) - abonoDeuda)
      const nuevoAbono = Number(d.abono || 0) + abonoDeuda
      await (prisma as any).syncDeuda.update({
        where: { id: d.id },
        data: { saldo: nuevoSaldo, abono: nuevoAbono, condition: nuevoSaldo > 0 }
      })
    }
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
