import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { checkPermiso } from '@/lib/permisos'
import { expandirDireccion } from '@/lib/maps'

export async function GET(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const listaFilter = searchParams.get('listaId') || ''
  const cursor = searchParams.get('cursor') || null       // cursor-based
  const page = parseInt(searchParams.get('page') || '1') // legacy offset
  const limit = parseInt(searchParams.get('limit') || '10')
  const useCursor = !!cursor || searchParams.has('cursor') || (searchParams.has('limit') && !searchParams.has('page'))
  const skip = useCursor ? undefined : (page - 1) * limit

  const conDeuda = searchParams.get('conDeuda') === 'true'
  const where: any = { empresaId }
  if (conDeuda && user.role === 'vendedor') {
    // Para recaudo: todos los clientes con deuda asignada al vendedor vía SyncDeuda, sin importar lista
    const empData = await prisma.empleado.findUnique({ where: { id: user.id }, select: { apiId: true } })
    const miApiId = (user as any).apiId || empData?.apiId || null
    if (!miApiId) return NextResponse.json({ clientes: [], total: 0, page, pages: 0 })
    const deudas = await prisma.syncDeuda.findMany({
      where: { nSaldo: { gt: 0 }, condition: true, empleadoExternalId: miApiId },
      select: { clienteApiId: true },
      distinct: ['clienteApiId']
    })
    const apiIds = deudas.map((d: any) => d.clienteApiId).filter(Boolean)
    if (apiIds.length === 0) return NextResponse.json({ clientes: [], total: 0, page, pages: 0 })
    where.apiId = { in: apiIds }
  } else if (conDeuda) {
    const deudas = await prisma.syncDeuda.findMany({
      where: { nSaldo: { gt: 0 }, condition: true },
      select: { clienteApiId: true },
      distinct: ['clienteApiId']
    })
    const apiIds = deudas.map((d: any) => d.clienteApiId).filter(Boolean)
    where.apiId = { in: apiIds }
    where.empresaId = empresaId
  }

  // Si es vendedor, filtrar solo sus clientes (solo cuando NO es conDeuda — ya se filtró arriba)
  if (listaFilter && user.role === 'empresa') {
    where.listaId = listaFilter
  }

  if (user.role === 'vendedor' && !conDeuda) {
    const listasAsignadas = await prisma.empleadoLista.findMany({ where: { empleadoId: user.id }, select: { listaId: true } })
    const listaIds = listasAsignadas.map((l: any) => l.listaId)
    if (listaIds.length > 0) { where.listaId = { in: listaIds } } else { return NextResponse.json({ clientes: [], total: 0, page, pages: 0 }) }
  }
  // Si es supervisor, filtrar por listas de sus vendedores asignados
  if (user.role === 'supervisor') {
    const asignados = await prisma.supervisorVendedor.findMany({ where: { supervisorId: user.id }, select: { vendedorId: true } })
    const vendedorIds = asignados.map((a: any) => a.vendedorId)
    if (vendedorIds.length === 0) return NextResponse.json({ clientes: [], total: 0, page, pages: 0 })
    const listasAsignadas = await prisma.empleadoLista.findMany({ where: { empleadoId: { in: vendedorIds } }, select: { listaId: true } })
    const listaIds = [...new Set(listasAsignadas.map((l: any) => l.listaId))]
    if (listaIds.length > 0) { where.listaId = { in: listaIds } } else { return NextResponse.json({ clientes: [], total: 0, page, pages: 0 }) }
  }
  // Si es entregas, filtrar por ciudades asignadas
  if (user.role === 'entregas') {
    const empleado = await prisma.empleado.findUnique({ where: { id: user.id }, select: { ciudades: true } })
    if (empleado?.ciudades && empleado.ciudades.length > 0) {
      where.ciudad = { in: empleado.ciudades }
    } else {
      return NextResponse.json({ clientes: [], total: 0, page, pages: 0 })
    }
  }

  if (q) {
    const tokens = q.trim().split(/\s+/).slice(0, 4)
    // Busca q que empiece cualquier palabra del nombre: "% TOKEN%" o "TOKEN%"
    const nombreOR = tokens.flatMap(t => [
      { nombre: { contains: ' ' + t, mode: 'insensitive' as const } },
      { nombre: { startsWith: t, mode: 'insensitive' as const } },
      { nombreComercial: { contains: ' ' + t, mode: 'insensitive' as const } },
      { nombreComercial: { startsWith: t, mode: 'insensitive' as const } },
    ])
    where.OR = [...nombreOR, { nit: { startsWith: q, mode: 'insensitive' as const } }]
  }

  const select = {
    id: true,
    nombre: true,
    nombreComercial: true,
    nit: true,
    telefono: true,
    ciudad: true,
    direccion: true,
    listaId: true,
    ubicacionReal: true,
    apiId: true,
    maps: true,
    lat: true,
    lng: true,
    latTmp: true,
    lngTmp: true,
    lista: {
      select: {
        vendedores: {
          take: 1,
          select: { empleado: { select: { nombre: true } } }
        }
      }
    },
  }

  if (useCursor) {
    // Cursor-based: take limit+1 para saber si hay más
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nombre: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select,
    })
    const hasMore = clientes.length > limit
    const data = hasMore ? clientes.slice(0, limit) : clientes
    const nextCursor = hasMore ? data[data.length - 1].id : null
    return NextResponse.json({ clientes: data, nextCursor, hasMore })
  }

  // Legacy offset — mantener compatibilidad
  const [clientes, total] = await Promise.all([
    prisma.cliente.findMany({ where, orderBy: { nombre: 'asc' }, skip, take: limit, select }),
    prisma.cliente.count({ where })
  ])
  return NextResponse.json({ clientes, total, page, pages: Math.ceil(total / limit) })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const body = await req.json()

  // Importación masiva
  if (Array.isArray(body)) {
    const created = await prisma.cliente.createMany({
      data: body.map((c: any) => ({
        id: crypto.randomUUID(),
        nombre: c.nombre || 'Sin nombre',
        nombreComercial: c.nombreComercial || null,
        direccion: c.direccion || null,
        telefono: c.telefono || null,
        email: c.email || null,
        nit: c.nit || null,
        ciudad: c.ciudad || null,
        listaId: c.listaId || null,
        apiId: c.apiId || null,
        empresaId,
      })),
      skipDuplicates: true,
    })
    return NextResponse.json({ ok: true, count: created.count })
  }

  // Creación individual
  const { nit, nombre, nombreComercial, direccion, telefono, email, listaId, ciudad, apiId, maps: mapsManual } = body
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  let mapsUrl = mapsManual || null
  if (!mapsUrl && (direccion || ciudad)) {
    mapsUrl = expandirDireccion(direccion, ciudad)
  }

  const cliente = await prisma.cliente.create({
    data: {
      id: crypto.randomUUID(),
      nit: nit || null,
      nombre,
      nombreComercial: nombreComercial || null,
      direccion: direccion || null,
      telefono: telefono || null,
      email: email || null,
      apiId: apiId || null,
      ciudad: ciudad || null,
      listaId: listaId || null,
      maps: mapsUrl,
      empresaId,
    }
  })
  return NextResponse.json({ ok: true, cliente })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role === 'supervisor' && !checkPermiso(session, 'editarClientes')) {
    return NextResponse.json({ error: 'Sin permiso para editar clientes' }, { status: 403 })
  }
  const empresaId = getEmpresaId(user)
  const body = await req.json()
  const { id, apiId: _apiId, maps: mapsManual, ...campos } = body

  // Auto-generate maps if not manually provided and not already set
  let mapsToSet = mapsManual !== undefined ? (mapsManual || null) : undefined
  if (!mapsToSet) {
    const existing = await prisma.cliente.findUnique({ where: { id }, select: { maps: true } })
    if (!existing?.maps) {
      const dir = campos.direccion || null
      const ciu = campos.ciudad || null
      if (dir || ciu) {
        mapsToSet = expandirDireccion(dir, ciu)
      }
    }
  }

  const updated = await prisma.cliente.updateMany({
    where: { id, empresaId },
    data: { ...campos, ...(mapsToSet !== undefined ? { maps: mapsToSet } : {}) }
  })
  if (updated.count === 0) return NextResponse.json({ error: 'No encontrado o sin permisos' }, { status: 404 })
  return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role === 'supervisor' && !checkPermiso(session, 'editarClientes')) {
    return NextResponse.json({ error: 'Sin permiso para editar clientes' }, { status: 403 })
  }
  const empresaId = getEmpresaId(user)
  const { id } = await req.json()
  const deleted = await prisma.cliente.deleteMany({ where: { id, empresaId } })
  if (deleted.count === 0) return NextResponse.json({ error: 'No encontrado o sin permisos' }, { status: 404 })
  return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
