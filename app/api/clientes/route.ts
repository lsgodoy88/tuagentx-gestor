import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermiso } from '@/lib/permisos'
import { expandirDireccion } from '@/lib/maps'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '10')
  const skip = (page - 1) * limit

  const where: any = { empresaId }

  // Si es vendedor, filtrar solo sus clientes
  if (user.role === 'vendedor') {
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
    where.OR = [
      { nombre: { contains: q, mode: 'insensitive' } },
      { nombreComercial: { contains: q, mode: 'insensitive' } },
      { nit: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [clientes, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      orderBy: { nombre: 'asc' },
      skip,
      take: limit,
      select: {
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
      }
    }),
    prisma.cliente.count({ where })
  ])

  return NextResponse.json({ clientes, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

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
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role === 'supervisor' && !checkPermiso(session, 'editarClientes')) {
    return NextResponse.json({ error: 'Sin permiso para editar clientes' }, { status: 403 })
  }
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
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
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role === 'supervisor' && !checkPermiso(session, 'editarClientes')) {
    return NextResponse.json({ error: 'Sin permiso para editar clientes' }, { status: 403 })
  }
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { id } = await req.json()
  const deleted = await prisma.cliente.deleteMany({ where: { id, empresaId } })
  if (deleted.count === 0) return NextResponse.json({ error: 'No encontrado o sin permisos' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
