import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([])
  const user = session.user as any

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const fecha = searchParams.get('fecha') || ''
  const cursor = searchParams.get('cursor') || null
  const limit = parseInt(searchParams.get('limit') || '15')
  const page = parseInt(searchParams.get('page') || '1')
  const useCursor = !!cursor || searchParams.has('cursor') || (searchParams.has('limit') && !searchParams.has('page'))
  const skip = useCursor ? undefined : (page - 1) * limit

  const isAdmin = ['empresa', 'supervisor'].includes(user.role)

  const where: any = {}

  // Filtro por usuario o empresa
  if (!isAdmin) {
    where.empleadoId = user.id
  } else if (user.empresaId) {
    where.empleado = { empresaId: user.empresaId }
  }

  // Filtro por fecha
  if (fecha) {
    const nextDay = new Date(fecha + 'T00:00:00.000Z')
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    const nextDayStr = nextDay.toISOString().slice(0, 10)
    where.fechaBogota = {
      gte: new Date(fecha + 'T05:00:00.000Z'),
      lte: new Date(nextDayStr + 'T04:59:59.999Z'),
    }
  }

  // Filtro por cliente — nombre o NIT
  if (q) {
    where.AND = [
      ...(where.AND || []),
      {
        cliente: {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { nit: { contains: q, mode: 'insensitive' } },
          ]
        }
      }
    ]
  }

  const select = {
    id: true, tipo: true, monto: true, nota: true, factura: true,
    firma: true, lat: true, lng: true, esLibre: true,
    createdAt: true, fechaBogota: true, clienteId: true,
    cliente: { select: { id: true, nombre: true, nit: true, direccion: true } },
    empleado: { select: { id: true, nombre: true } }
  }

  if (useCursor) {
    const visitas = await prisma.visita.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select,
    })
    const hasMore = visitas.length > limit
    const data = hasMore ? visitas.slice(0, limit) : visitas
    const nextCursor = hasMore ? data[data.length - 1].id : null
    return NextResponse.json({ visitas: data, nextCursor, hasMore })
  }

  const [visitas, total] = await Promise.all([
    prisma.visita.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, select }),
    prisma.visita.count({ where })
  ])
  return NextResponse.json({ visitas, total, page, pages: Math.ceil(total / limit) })
  } catch (err: any) {
    console.error('visitas/todas error:', err)
    return NextResponse.json({ error: 'Error interno', detail: err?.message }, { status: 500 })
  }
}
