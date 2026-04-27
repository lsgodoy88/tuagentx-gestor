import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([], { status: 401 })
  const user = session.user as any

  if (!['empresa', 'supervisor', 'superadmin'].includes(user.role)) {
    return NextResponse.json([], { status: 403 })
  }

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { searchParams } = new URL(req.url)
  const empleadoId = searchParams.get('empleadoId')
  const fecha = searchParams.get('fecha')

  const tipo = searchParams.get('tipo')
  const q = searchParams.get('q')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '200')
  const skip = (page - 1) * limit
  const where: any = {
    empleado: { empresaId },
  }
  if (tipo) where.tipo = tipo
  if (q) where.cliente = { nombre: { contains: q, mode: 'insensitive' } }

  if (empleadoId) where.empleadoId = empleadoId
  if (fecha) {
    const inicio = new Date(fecha + 'T05:00:00.000Z')
    const fin = new Date(fecha + 'T05:00:00.000Z')
    fin.setDate(fin.getDate() + 1)
    where.fechaBogota = { gte: inicio, lt: fin }
  }

  const [visitas, total] = await Promise.all([
    prisma.visita.findMany({
      where,
      include: { cliente: true, empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.visita.count({ where })
  ])

  return NextResponse.json({ visitas, total })
}
