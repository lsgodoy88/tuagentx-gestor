import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([])
  const user = session.user as any

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const fecha = searchParams.get('fecha') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '15')
  const skip = (page - 1) * limit

  const where: any = { empleadoId: user.id }

  if (fecha) {
    // Compensar UTC-5 de Bogotá: el día local inicia a las 05:00Z y termina a las 04:59:59.999Z del día siguiente
    const nextDay = new Date(fecha + 'T00:00:00.000Z')
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    const nextDayStr = nextDay.toISOString().slice(0, 10)
    where.fechaBogota = {
      gte: new Date(fecha + 'T05:00:00.000Z'),
      lte: new Date(nextDayStr + 'T04:59:59.999Z'),
    }
  }

  if (q) {
    where.cliente = { nombre: { contains: q, mode: 'insensitive' } }
  }

  const [visitas, total] = await Promise.all([
    prisma.visita.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, tipo: true, monto: true, nota: true, factura: true,
        firma: true, lat: true, lng: true, esLibre: true,
        createdAt: true, fechaBogota: true, clienteId: true,
        cliente: { select: { id: true, nombre: true, direccion: true } }
      }
    }),
    prisma.visita.count({ where })
  ])

  return NextResponse.json({ visitas, total, page, pages: Math.ceil(total / limit) })
}
