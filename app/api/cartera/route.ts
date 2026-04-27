import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcularEstado } from '@/lib/cartera'

async function poblarCarteraCache(integracionId: string, empresaId: string) {
  // Traer todas las deudas activas
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, condition: true }
  })

  // Traer clientes con apiId en un solo query
  const apiIds = [...new Set(deudas.map((d: any) => d.clienteApiId))]
  const clientes = await (prisma as any).cliente.findMany({
    where: { apiId: { in: apiIds }, empresaId },
    select: { id: true, apiId: true, nombre: true, nit: true, telefono: true, ciudad: true }
  })
  const clienteMap: Record<string, any> = {}
  clientes.forEach((c: any) => { clienteMap[c.apiId] = c })

  // Traer empleados referenciados en las deudas
  const empleadoApiIds = [...new Set(deudas.map((d: any) => d.empleadoExternalId).filter(Boolean))] as string[]
  const empleados = await (prisma as any).empleado.findMany({
    where: { apiId: { in: empleadoApiIds }, empresaId },
    select: { apiId: true, nombre: true }
  })
  const empleadoMap: Record<string, string> = {}
  empleados.forEach((e: any) => { empleadoMap[e.apiId] = e.nombre })

  // Traer pagos locales vinculados
  const deudasIds = deudas.map((d: any) => d.id)
  const pagosLocales = await (prisma as any).pagoCartera.findMany({
    where: { syncDeudaId: { in: deudasIds } }
  })
  const pagosMap: Record<string, number> = {}
  pagosLocales.forEach((p: any) => {
    if (p.syncDeudaId) pagosMap[p.syncDeudaId] = (pagosMap[p.syncDeudaId] || 0) + Number(p.monto)
  })

  // Agrupar deudas por cliente
  const porCliente: Record<string, any[]> = {}
  for (const d of deudas) {
    if (!porCliente[d.clienteApiId]) porCliente[d.clienteApiId] = []
    porCliente[d.clienteApiId].push(d)
  }

  // Crear/actualizar CarteraCache por cliente
  const ahora = new Date()
  for (const [apiId, deudasCliente] of Object.entries(porCliente)) {
    const cliente = clienteMap[apiId]
    if (!cliente) continue

    // Determinar empleado mayoritario del cliente
    const conteoEmpleado: Record<string, number> = {}
    for (const d of deudasCliente) {
      if (d.empleadoExternalId) conteoEmpleado[d.empleadoExternalId] = (conteoEmpleado[d.empleadoExternalId] || 0) + 1
    }
    const empleadoPrincipal = Object.keys(conteoEmpleado).sort((a, b) => conteoEmpleado[b] - conteoEmpleado[a])[0] ?? null

    const porEstado: Record<string, number> = { pendiente: 0, vencida: 0, mora: 0, critica: 0, pagada: 0 }
    let saldoTotal = 0
    let saldoPendiente = 0

    const deudasDetalle = deudasCliente.map((d: any) => {
      const saldoSync = Number(d.saldo)
      const saldoAnt = Number(d.saldoAnterior ?? d.saldo)
      const pagosLocal = pagosMap[d.id] || 0
      const saldoCambio = Math.abs(saldoSync - saldoAnt) > 0.01
      const saldoReal = saldoCambio ? saldoSync : Math.max(0, saldoSync - pagosLocal)

      const valor = Number(d.valor)
      const { estado } = calcularEstado(saldoReal, valor, Number(d.abono), d.fechaVencimiento)
      porEstado[estado] = (porEstado[estado] || 0) + saldoReal

      saldoTotal += valor
      saldoPendiente += saldoReal

      return {
        id: d.id,
        externalId: d.externalId,
        numeroOrden: d.numeroOrden,
        numeroFactura: d.numeroFactura,
        valor,
        saldo: saldoReal,
        abono: Number(d.abono),
        diasCredito: d.diasCredito,
        fechaVencimiento: d.fechaVencimiento,
        estado,
      }
    })

    await (prisma as any).carteraCache.upsert({
      where: { integracionId_clienteApiId: { integracionId, clienteApiId: apiId } },
      create: {
        id: `cc-${integracionId}-${apiId}`,
        empresaId,
        integracionId,
        clienteId: cliente.id,
        clienteApiId: apiId,
        nombre: cliente.nombre,
        nit: cliente.nit,
        telefono: cliente.telefono,
        ciudad: cliente.ciudad,
        empleadoExternalId: empleadoPrincipal,
        empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null,
        saldoTotal,
        saldoPendiente,
        porEstado,
        deudas: deudasDetalle,
        totalDeudas: deudasDetalle.length,
        ultimaActualizacion: ahora,
      },
      update: {
        clienteId: cliente.id,
        nombre: cliente.nombre,
        nit: cliente.nit,
        telefono: cliente.telefono,
        ciudad: cliente.ciudad,
        empleadoExternalId: empleadoPrincipal,
        empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null,
        saldoTotal,
        saldoPendiente,
        porEstado,
        deudas: deudasDetalle,
        totalDeudas: deudasDetalle.length,
        ultimaActualizacion: ahora,
      }
    })
  }

  return Object.keys(porCliente).length
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '15')
  const skip = (page - 1) * limit

  // Detectar integracion activa
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })

  if (integracion) {
    // Leer desde CarteraCache
    const where: any = { integracionId: integracion.id, saldoPendiente: { gt: 0 } }
    if (user.role === 'vendedor') {
      // En modo sync: filtrar por empleadoExternalId (apiId del empleado)
      const empleado = await (prisma as any).empleado.findUnique({ where: { id: user.id }, select: { apiId: true } })
      if (empleado?.apiId) {
        const deudasEmpleado = await (prisma as any).syncDeuda.findMany({
          where: { integracionId: integracion.id, empleadoExternalId: empleado.apiId, condition: true },
          select: { clienteApiId: true }
        })
        const clienteApiIds = [...new Set(deudasEmpleado.map((d: any) => d.clienteApiId))]
        where.clienteApiId = { in: clienteApiIds }
      } else {
        where.clienteId = { in: [] }
      }
    }
    if (q) {
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { nit: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [caches, total] = await Promise.all([
      (prisma as any).carteraCache.findMany({
        where,
        skip,
        take: limit,
        orderBy: { saldoPendiente: 'desc' }
      }),
      (prisma as any).carteraCache.count({ where })
    ])

    // Normalizar al formato que espera la UI
    const carteras = caches.map((c: any) => ({
      id: c.clienteId || c.clienteApiId,
      clienteId: c.clienteId,
      _fuente: 'sync',
      _sincronizado: true,
      saldoPendiente: Number(c.saldoPendiente),
      saldoTotal: Number(c.saldoTotal),
      porEstado: c.porEstado,
      ultimaActualizacion: c.ultimaActualizacion,
      cliente: {
        id: c.clienteId,
        nombre: c.nombre,
        nit: c.nit,
        telefono: c.telefono,
        apiId: c.clienteApiId,
      },
      empleado: c.empleadoNombre ? { nombre: c.empleadoNombre } : null,
      DetalleCartera: (c.deudas as any[] || []).map((d: any) => ({
        ...d,
        valorFactura: d.valor,
        abonos: d.abono,
        saldoPendiente: d.saldo,
        estado: d.estado,
      })),
      PagoCartera: [],
    }))

    return NextResponse.json({
      carteras,
      total,
      page,
      pages: Math.ceil(total / limit),
      _modo: 'sync',
      _integracion: { id: integracion.id, nombre: integracion.nombre }
    })
  }

  // MODO MANUAL
  const where: any = { empresaId }
  if (user.role === 'vendedor') where.empleadoId = user.id
  if (q) {
    where.Cliente = {
      OR: [
        { nombre: { contains: q, mode: 'insensitive' } },
        { nit: { contains: q, mode: 'insensitive' } },
      ]
    }
  }

  const [carteras, total] = await Promise.all([
    prisma.cartera.findMany({
      where,
      skip,
      take: limit,
      orderBy: { saldoPendiente: 'desc' },
      include: {
        Cliente: { select: { id: true, nombre: true, nit: true, telefono: true } },
        Empleado: { select: { id: true, nombre: true, email: true } },
        PagoCartera: { orderBy: { createdAt: 'desc' }, take: 1 },
        DetalleCartera: { orderBy: { createdAt: 'asc' } },
      }
    }),
    prisma.cartera.count({ where }),
  ])

  const normalized = carteras.map((c: any) => {
    const detalles = c.DetalleCartera || []
    const porEstado: Record<string, number> = { pagada: 0, abonada: 0, pendiente: 0, vencida: 0, mora: 0, critica: 0 }
    for (const d of detalles) {
      const vf = Number(d.valorFactura ?? d.valor)
      const ab = Number(d.abonos ?? 0)
      const saldo = Math.max(0, vf - ab)
      const { estado } = calcularEstado(saldo, vf, ab, d.fechaVencimiento ?? null)
      porEstado[estado] = (porEstado[estado] ?? 0) + saldo
    }
    return {
      ...c,
      _fuente: 'manual',
      _sincronizado: false,
      cliente: c.Cliente,
      empleado: c.Empleado,
      PagoCartera: c.PagoCartera,
      DetalleCartera: detalles,
      porEstado,
    }
  })

  return NextResponse.json({ carteras: normalized, total, page, pages: Math.ceil(total / limit), _modo: 'manual' })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const body = await req.json()
  const { clienteId, detalles } = body
  if (!clienteId) return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })
  let cartera = await prisma.cartera.findFirst({ where: { clienteId, empresaId } })
  const saldoTotal = detalles?.reduce((s: number, d: any) => s + Number(d.valor), 0) ?? 0
  if (!cartera) {
    cartera = await prisma.cartera.create({
      data: { clienteId, empresaId, saldoTotal, saldoPendiente: saldoTotal, fuente: 'manual' }
    })
  } else {
    cartera = await prisma.cartera.update({
      where: { id: cartera.id },
      data: { saldoTotal: { increment: saldoTotal }, saldoPendiente: { increment: saldoTotal }, updatedAt: new Date() }
    })
  }
  if (detalles?.length) {
    await prisma.detalleCartera.createMany({
      data: detalles.map((d: any) => ({
        carteraId: cartera!.id,
        numeroFactura: d.numeroFactura || null,
        valor: d.valor,
        fechaVencimiento: d.fechaVencimiento ? new Date(d.fechaVencimiento) : null,
        estado: 'pendiente',
      }))
    })
  }
  return NextResponse.json({ cartera })
}
