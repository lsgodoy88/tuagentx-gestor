import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'

const ROLES = ROLES_ADMIN_BODEGA

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)

  const rows = await prisma.$queryRaw<[{ diasHistorialBodega: number; ciudadEntregaLocal: string | null; bodegaPuedeEnviar: boolean; ultimaSyncBodega: Date | null }]>`
    SELECT "diasHistorialBodega", "ciudadEntregaLocal", "bodegaPuedeEnviar", "ultimaSyncBodega"
    FROM gestor."Empresa" WHERE id = ${empresaId} LIMIT 1
  `
  const diasParam = req.nextUrl.searchParams.get('dias')
  const dias = diasParam ? Math.min(30, Math.max(1, parseInt(diasParam))) : (rows[0]?.diasHistorialBodega ?? 7)
  const ciudadLocal = rows[0]?.ciudadEntregaLocal ?? null
  const bodegaPuedeEnviar = rows[0]?.bodegaPuedeEnviar ?? false
  const ultimaSyncBodega = rows[0]?.ultimaSyncBodega ?? null

  const desde = new Date()
  desde.setDate(desde.getDate() - dias)

  const origenId = req.nextUrl.searchParams.get('origenId') ?? 'propia'
  const esVinculada = origenId !== 'propia' && origenId !== ''

  const whereOrigen = esVinculada
    ? { origenVinculadaId: origenId }
    : { origenVinculadaId: null }

  // Traer IDs ordenados por numeroOrden int DESC, fechaOrden DESC vía SQL nativo
  const desdeIso = desde.toISOString()
  const origenSQL = esVinculada
    ? `"origenVinculadaId" = '${origenId.replace(/'/g, "''")}'`
    : `"origenVinculadaId" IS NULL`
  const idRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM gestor."OrdenDespacho"
     WHERE "empresaId" = $1
       AND ${origenSQL}
       AND ("fechaOrden" >= $2::timestamp OR ("fechaOrden" IS NULL AND "createdAt" >= $2::timestamp))
     ORDER BY (CASE WHEN "numeroFactura" ~ '^[0-9]+$' THEN CAST("numeroFactura" AS INTEGER) ELSE 0 END) DESC`,
    empresaId, desdeIso
  )
  const ordenIds = idRows.map(r => r.id)
  const despachosRaw = ordenIds.length > 0 ? await (prisma as any).ordenDespacho.findMany({
    where: { id: { in: ordenIds } },
    select: {
      id: true, numeroOrden: true, numeroFactura: true, clienteNombre: true, clienteNit: true,
      ciudad: true, direccion: true, telefono: true, estado: true, fechaOrden: true,
      alistadoEl: true, entregadoEl: true, fotoAlistamiento: true, fotosAlistamiento: true,
      firmaEntrega: true, fotoEntrega: true, repartidorId: true, transportadora: true,
      guiaTransporte: true, vendedorApiId: true, clienteApiId: true, origenVinculadaId: true,
      alistadoPor: { select: { id: true, nombre: true } },
      repartidor: { select: { id: true, nombre: true } },
    },
  }) : []
  const orderMap = new Map(ordenIds.map((id, i) => [id, i]))
  const despachos = despachosRaw.sort((a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))

  const despachosFiltrados = despachos.filter((d: any) => d.clienteNombre && d.clienteNombre !== 'Sin nombre' && d.clienteNombre !== '')
  return NextResponse.json({ despachos: despachosFiltrados, ciudadLocal, bodegaPuedeEnviar, ultimaSyncBodega, diasHistorialBodega: dias })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const body = await req.json()
  const { numeroOrden, clienteNombre, clienteNit, ciudad, direccion, telefono } = body

  if (!numeroOrden || !clienteNombre) {
    return NextResponse.json({ error: 'Número de orden y cliente son requeridos' }, { status: 400 })
  }

  const orden = await (prisma as any).ordenDespacho.create({
    data: {
      empresaId,
      origen: 'manual',
      numeroOrden: String(numeroOrden),
      clienteNombre: String(clienteNombre),
      clienteNit: clienteNit ? String(clienteNit) : null,
      ciudad: ciudad ? String(ciudad) : null,
      direccion: direccion ? String(direccion) : null,
      telefono: telefono ? String(telefono) : null,
    },
  })

  return NextResponse.json({ orden }, { status: 201 })
}
