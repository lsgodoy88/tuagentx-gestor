import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (!['empresa', 'supervisor'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { searchParams } = new URL(req.url)
  const vendedorId = searchParams.get('vendedorId') || undefined
  const estado = searchParams.get('estado') || undefined
  const fecha = searchParams.get('fecha') || undefined
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = 15
  const skip = (page - 1) * limit

  const where: any = {
    Cartera: { empresaId },
  }

  if (vendedorId) where.empleadoId = vendedorId
  if (estado && estado !== 'todos') where.envioEstado = estado
  if (fecha) {
    // Colombia = UTC-5: midnight Colombia = 05:00 UTC
    where.createdAt = {
      gte: new Date(`${fecha}T05:00:00.000Z`),
      lt: new Date(new Date(`${fecha}T05:00:00.000Z`).getTime() + 86400000),
    }
  }

  const [pagos, total] = await Promise.all([
    prisma.pagoCartera.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        Cartera: {
          include: {
            Cliente: { select: { id: true, nombre: true, nit: true, telefono: true } },
          },
        },
        Empleado: { select: { id: true, nombre: true, rol: true } },
      },
    }),
    prisma.pagoCartera.count({ where }),
  ])

  return NextResponse.json({
    pagos,
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}
