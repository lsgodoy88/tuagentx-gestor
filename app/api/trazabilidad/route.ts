import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (!['empresa', 'supervisor', 'superadmin'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const estado = searchParams.get('estado') || ''
  const desde = searchParams.get('desde') || ''
  const hasta = searchParams.get('hasta') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))

  const where: any = { empresaId: user.empresaId }

  if (q) {
    where.OR = [
      { numeroOrden: { contains: q, mode: 'insensitive' } },
      { clienteNombre: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (estado) where.estado = estado
  if (desde) where.fechaOrden = { ...(where.fechaOrden || {}), gte: new Date(desde) }
  if (hasta) where.fechaOrden = { ...(where.fechaOrden || {}), lte: new Date(hasta + 'T23:59:59') }

  const [total, ordenes] = await Promise.all([
    prisma.ordenDespacho.count({ where }),
    prisma.ordenDespacho.findMany({
      where,
      orderBy: { fechaOrden: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        numeroOrden: true,
        clienteNombre: true,
        ciudad: true,
        estado: true,
        fechaOrden: true,
        alistadoEl: true,
        entregadoEl: true,
        fotosAlistamiento: true,
        alistadoPor: { select: { nombre: true } },
        repartidor: { select: { nombre: true } },
        visitas: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            firma: true,
            createdAt: true,
            empleado: { select: { nombre: true } },
          }
        }
      }
    })
  ])

  return NextResponse.json({ ordenes, total, page, pages: Math.ceil(total / PAGE_SIZE) })
}
