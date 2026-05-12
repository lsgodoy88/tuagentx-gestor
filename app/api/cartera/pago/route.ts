import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { generarReciboToken } from '@/lib/recibos'
import { calcularEstado } from '@/lib/cartera'
import { getConsecutivo } from '@/lib/consecutivo'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const pagoWhere: any = {
    OR: [
      { Cartera: { empresaId } },
      { AND: [{ carteraId: null }, { Empleado: { empresaId } }] },
    ],
  }
  if (user.role === 'vendedor') pagoWhere.AND = [{ empleadoId: user.id }]
  const pagos = await (prisma as any).pagoCartera.findMany({
    where: pagoWhere,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      Cartera: { include: { Cliente: { select: { id: true, nombre: true, nit: true } } } },
      Empleado: { select: { id: true, nombre: true } },
      Aplicaciones: true,
    }
  })

  // Hidratar cliente para pagos sync (sin Cartera)
  const syncPagos = pagos.filter((p: any) => !p.carteraId)
  const clienteMap = new Map<string, any>()
  if (syncPagos.length > 0) {
    const apps = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { pagoId: { in: syncPagos.map((p: any) => p.id) } },
      orderBy: { createdAt: 'asc' },
    })
    const firstAppByPago = new Map<string, any>()
    for (const a of apps) if (!firstAppByPago.has(a.pagoId)) firstAppByPago.set(a.pagoId, a)
    const sdIds = Array.from(new Set(apps.map((a: any) => a.syncDeudaId)))
    const sds = sdIds.length > 0
      ? await (prisma as any).syncDeuda.findMany({ where: { id: { in: sdIds } } })
      : []
    const sdMap = new Map(sds.map((s: any) => [s.id, s]))
    const apiIds = Array.from(new Set(sds.map((s: any) => s.clienteApiId).filter(Boolean))) as string[]
    const clientes = apiIds.length > 0
      ? await (prisma as any).cliente.findMany({ where: { apiId: { in: apiIds }, empresaId } })
      : []
    const cliByApi = new Map(clientes.map((c: any) => [c.apiId, c]))
    for (const p of syncPagos) {
      const fa = firstAppByPago.get(p.id)
      if (!fa) continue
      const sd: any = sdMap.get(fa.syncDeudaId)
      if (!sd) continue
      const cli: any = cliByApi.get(sd.clienteApiId)
      if (cli) clienteMap.set(p.id, { id: cli.id, nombre: cli.nombre, nit: cli.nit })
    }
  }

  const normalized = pagos.map((p: any) => ({
    ...p,
    metodoPago: p.metodopago,
    cartera: {
      ...(p.Cartera || {}),
      cliente: p.Cartera?.Cliente || clienteMap.get(p.id) || null,
    },
    empleado: p.Empleado,
  }))
  return NextResponse.json({ pagos: normalized })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const empleadoId = user.role === 'empresa' ? null : user.id
  const body = await req.json()
  const { carteraId, monto, descuento = 0, tipo = 'abono', metodoPago = 'efectivo', notas, detalleIds, voucherKey, voucherDatosIA, lat, lng, gpsAccuracy, fechaPago } = body

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

  // Validación de input
  if (!Number.isFinite(montoNum) || montoNum < 0) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
  }
  if (!Number.isFinite(descuentoNum) || descuentoNum < 0) {
    return NextResponse.json({ error: 'Descuento inválido' }, { status: 400 })
  }
  if (notas && typeof notas === 'string' && notas.length > 1000) {
    return NextResponse.json({ error: 'Notas demasiado largas (máx 1000)' }, { status: 400 })
  }

  const totalAplicado = montoNum + descuentoNum
  if (totalAplicado <= 0) {
    return NextResponse.json({ error: 'El total del pago debe ser mayor a 0' }, { status: 400 })
  }

  let numeroRecibo: string | null = null
  try { numeroRecibo = await getConsecutivo(empId) } catch {}

  // Token temporal 15 minutos
  const { reciboToken, tokenExpira } = generarReciboToken()

  // fechaPago — del voucher si es transferencia, sino ahora
  let fechaPagoFinal: Date = new Date()
  if (fechaPago) {
    fechaPagoFinal = new Date(fechaPago)
  } else if (voucherDatosIA?.fecha) {
    const f = new Date(voucherDatosIA.fecha)
    if (!isNaN(f.getTime())) fechaPagoFinal = f
  }

  // Saldo anterior + valor factura — sumar DetalleCartera afectadas
  let saldoAnteriorTotal: number | null = null
  let valorFacturaTotal: number | null = null
  let numFact: number | null = null
  if (Array.isArray(detalleIds) && detalleIds.length > 0) {
    const detalles = await (prisma as any).detalleCartera.findMany({
      where: { id: { in: detalleIds } },
      select: { saldoPendiente: true, numeroFactura: true, valorFactura: true }
    })
    if (detalles.length > 0) {
      saldoAnteriorTotal = detalles.reduce((s: number, d: any) => s + Number(d.saldoPendiente), 0)
      valorFacturaTotal = detalles.reduce((s: number, d: any) => s + Number(d.valorFactura || 0), 0)
      numFact = detalles[0].numeroFactura ?? null
    }
  }

  // Congelar nombres
  const clienteData = await (prisma as any).cartera.findUnique({
    where: { id: carteraId },
    select: { Cliente: { select: { apiId: true, nombre: true } } }
  })
  const empleadoData = await prisma.empleado.findUnique({
    where: { id: empId },
    select: { nombre: true }
  })

  const { pago, nuevoSaldo: saldoFinal } = await prisma.$transaction(async (tx: any) => {

  const pago = await tx.pagoCartera.create({
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
      fechaPago: fechaPagoFinal,
      saldoAnterior: saldoAnteriorTotal,
      numeroFactura: numFact,
      clienteApiId: clienteData?.Cliente?.apiId || null,
      clienteNombre: clienteData?.Cliente?.nombre || null,
      valorFactura: valorFacturaTotal,
      vendedorNombre: empleadoData?.nombre || null,
      ...(['transferencia', 'nequi', 'banco'].includes(metodoPago) && voucherKey ? {
        voucherKey,
        voucherDatosIA: voucherDatosIA ?? undefined,
      } : {}),
      ...(lat != null && lng != null ? { latCobro: Number(lat), lngCobro: Number(lng), gpsAccuracy: gpsAccuracy != null ? Number(gpsAccuracy) : null } : {}),
    } as any
  })

  if (Array.isArray(detalleIds) && detalleIds.length > 0) {
    const detalles = await tx.detalleCartera.findMany({ where: { id: { in: detalleIds }, carteraId } })
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
      await tx.detalleCartera.update({ where: { id: d.id }, data: { abonos: nuevosAbonos, estado } })
    }
  } else if (tipo === 'total') {
    await tx.detalleCartera.updateMany({
      where: { carteraId, estado: { not: 'pagada' } },
      data: { estado: 'pagada' }
    })
  }

  const todosDetalles = await tx.detalleCartera.findMany({ where: { carteraId } })
  const nuevoSaldo = todosDetalles.reduce((acc: number, d: any) => {
    if (d.estado === 'pagada') return acc
    const vf = Number(d.valorFactura ?? d.valor)
    const ab = Number(d.abonos ?? 0)
    return acc + Math.max(0, vf - ab)
  }, 0)

  await tx.cartera.update({
    where: { id: carteraId },
    data: { saldoPendiente: Math.max(0, nuevoSaldo), updatedAt: new Date() }
  })

    return { pago, nuevoSaldo }
  }, { isolationLevel: 'Serializable', timeout: 10000 })

  const cfgEmp = (cartera as any)?.Empresa?.configRecibos as any
  const anchoPapel = cfgEmp?.anchoPapel || '80mm'
  return NextResponse.json({ pago, saldoPendiente: Math.max(0, saldoFinal), anchoPapel })
}
