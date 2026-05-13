import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const esVendedor = user.role === 'vendedor'
  const esEntregas = user.role === 'entregas'
  if (!['empresa', 'supervisor', 'superadmin', 'vendedor', 'bodega', 'entregas'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const estado = searchParams.get('estado') || ''
  const desde = searchParams.get('desde') || ''
  const hasta = searchParams.get('hasta') || ''
  const cursor = searchParams.get('cursor') || null
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const useCursor = !!cursor || searchParams.has('cursor') || (searchParams.has('limit') && !searchParams.has('page'))

  // Rol entregas: solo sus órdenes entregadas (repartidorId = empleadoId)
  if (esEntregas) {
    const empleadoId = user.id // En sesión, user.id = id del Empleado
    const where: any = {
      empresaId: user.empresaId,
      estado: 'entregado',
      OR: [
        { repartidorId: empleadoId },
        { visitas: { some: { empleadoId, tipo: 'entrega' } } },
      ]
    }
    if (q) where.OR = [
      { numeroOrden: { contains: q, mode: 'insensitive' } },
      { clienteNombre: { contains: q, mode: 'insensitive' } },
    ]
    if (desde || hasta) {
      where.entregadoEl = {}
      if (desde) where.entregadoEl.gte = new Date(desde)
      if (hasta) where.entregadoEl.lte = new Date(hasta + 'T23:59:59')
    }
    const [total, ordenes] = await Promise.all([
      prisma.ordenDespacho.count({ where }),
      prisma.ordenDespacho.findMany({
        where,
        orderBy: [{ numeroOrden: 'desc' }, { entregadoEl: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, numeroOrden: true, clienteNombre: true, ciudad: true,
          estado: true, fechaOrden: true, alistadoEl: true, entregadoEl: true,
          fotosAlistamiento: true, firmaEntrega: true,
          alistadoPor: { select: { nombre: true } },
          repartidor: { select: { nombre: true } },
          visitas: {
            where: { tipo: 'entrega' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { id: true, firma: true, createdAt: true, empleado: { select: { nombre: true } } }
          }
        }
      })
    ])
    return NextResponse.json({ ordenes, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  }

  // Vendedor: filtrar por sus propios clientes via SyncDeuda
  if (esVendedor) {
    // Buscar SyncEmpleado por nombre del empleado logueado
    const syncEmp = await (prisma as any).syncEmpleado.findFirst({
      where: {
        integracion: { empresaId: user.empresaId },
        nombre: { contains: user.name, mode: 'insensitive' }
      }
    })
    const externalId = syncEmp?.externalId || null

    // Obtener NITs de clientes asignados a este vendedor
    const clientesApiIds = externalId ? await (prisma as any).syncDeuda.findMany({
      where: { empleadoExternalId: externalId },
      select: { clienteApiId: true },
      distinct: ['clienteApiId']
    }) : []

    const apiIds = clientesApiIds.map((d: any) => d.clienteApiId).filter(Boolean)

    // Obtener NITs reales de esos clientes
    const clientes = apiIds.length > 0 ? await prisma.cliente.findMany({
      where: { apiId: { in: apiIds }, empresaId: user.empresaId },
      select: { nit: true }
    }) : []

    const nits = clientes.map((c: any) => c.nit).filter(Boolean)

    const where: any = {
      empresaId: user.empresaId,
      origenVinculadaId: null, // Solo órdenes propias, no vinculadas
      ...(nits.length > 0 ? { clienteNit: { in: nits } } : { clienteNit: '__ninguno__' })
    }
    if (q) where.OR = [
      { numeroOrden: { contains: q, mode: 'insensitive' } },
      { clienteNombre: { contains: q, mode: 'insensitive' } },
    ]
    if (estado) where.estado = estado
    if (desde || hasta) {
      where.fechaOrden = {}
      if (desde) where.fechaOrden.gte = new Date(desde)
      if (hasta) where.fechaOrden.lte = new Date(hasta + 'T23:59:59')
    }

    const [total, ordenes] = await Promise.all([
      prisma.ordenDespacho.count({ where }),
      prisma.ordenDespacho.findMany({
        where,
        orderBy: [{ numeroOrden: 'desc' }, { fechaOrden: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, numeroOrden: true, clienteNombre: true, ciudad: true,
          estado: true, fechaOrden: true, alistadoEl: true, entregadoEl: true,
          fotosAlistamiento: true, firmaEntrega: true,
          alistadoPor: { select: { nombre: true } },
          repartidor: { select: { nombre: true } },
          visitas: {
            where: { tipo: 'entrega' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { id: true, firma: true, createdAt: true, empleado: { select: { nombre: true } } }
          }
        }
      })
    ])
    return NextResponse.json({ ordenes, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: user.empresaId },
    select: { bodegaPuedeEnviar: true }
  })
  const vinculaciones = await prisma.empresaVinculada.findMany({
    where: { empresaClienteId: user.empresaId, activa: true }
  })
  const vinculacionesBodega = await prisma.empresaVinculada.findMany({
    where: { empresaId: user.empresaId, activa: true }
  })

  let where: any = {}
  if (user.role === 'bodega') {
    // Bodega ve todo: propias + todas las vinculadas
    const vinIds = vinculacionesBodega.map((v: any) => v.id)
    where = vinIds.length > 0
      ? { OR: [{ empresaId: user.empresaId, origenVinculadaId: null }, { origenVinculadaId: { in: vinIds } }] }
      : { empresaId: user.empresaId }
  } else if (vinculaciones.length > 0 && !empresa?.bodegaPuedeEnviar) {
    // Empresa cliente (Leche): solo sus propias órdenes en la bodega de Lumeli
    where = { origenVinculadaId: { in: vinculaciones.map((v: any) => v.id) } }
  } else {
    // Empresa con bodega propia (Lumeli) o sin vinculación: solo sus órdenes propias
    where = { empresaId: user.empresaId, origenVinculadaId: null }
  }

  if (q) {
    where.OR = [
      { numeroOrden: { contains: q, mode: 'insensitive' } },
      { clienteNombre: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (estado) where.estado = estado
  if (desde || hasta) {
    where.fechaOrden = {}
    if (desde) where.fechaOrden.gte = new Date(desde)
    if (hasta) where.fechaOrden.lte = new Date(hasta + 'T23:59:59')
  }

  const baseSelect = {
    id: true,
    numeroOrden: true,
    clienteNombre: true,
    ciudad: true,
    estado: true,
    fechaOrden: true,
    alistadoEl: true,
    entregadoEl: true,
    fotosAlistamiento: true,
    firmaEntrega: true,
    repartidorId: true,
    alistadoPor: { select: { nombre: true } },
    repartidor: { select: { nombre: true } },
    visitas: {
      where: { tipo: 'entrega' },
      orderBy: { createdAt: 'asc' as const },
      take: 1,
      select: { id: true, firma: true, createdAt: true, empleado: { select: { nombre: true } } }
    }
  }

  if (useCursor) {
    const ordenes = await prisma.ordenDespacho.findMany({
      where,
      orderBy: [{ numeroOrden: 'desc' }, { fechaOrden: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: baseSelect,
    })
    const hasMore = ordenes.length > PAGE_SIZE
    const data = hasMore ? ordenes.slice(0, PAGE_SIZE) : ordenes
    const nextCursor = hasMore ? data[data.length - 1].id : null
    return NextResponse.json({ ordenes: data, nextCursor, hasMore })
  }

  const [total, ordenes] = await Promise.all([
    prisma.ordenDespacho.count({ where }),
    prisma.ordenDespacho.findMany({
      where,
      orderBy: [{ numeroOrden: 'desc' }, { fechaOrden: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: baseSelect,
    })
  ])
  return NextResponse.json({ ordenes, total, page, pages: Math.ceil(total / PAGE_SIZE) })
}
