import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['empresa', 'supervisor', 'bodega']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const rows = await prisma.$queryRaw<[{ diasHistorialBodega: number; ciudadEntregaLocal: string | null; bodegaPuedeEnviar: boolean; ultimaSyncBodega: Date | null }]>`
    SELECT "diasHistorialBodega", "ciudadEntregaLocal", "bodegaPuedeEnviar", "ultimaSyncBodega"
    FROM gestor."Empresa" WHERE id = ${empresaId} LIMIT 1
  `
  const dias = rows[0]?.diasHistorialBodega ?? 7
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

  const despachos = await (prisma as any).ordenDespacho.findMany({
    where: {
      empresaId,
      ...whereOrigen,
      OR: [
        { fechaOrden: { gte: desde } },
        { fechaOrden: null, createdAt: { gte: desde } },
      ],
    },
    include: {
      alistadoPor: { select: { id: true, nombre: true } },
      repartidor: { select: { id: true, nombre: true } },
    },
    orderBy: [{ numeroOrden: 'desc' }],
  })

  return NextResponse.json({ despachos, ciudadLocal, bodegaPuedeEnviar, ultimaSyncBodega })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
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
