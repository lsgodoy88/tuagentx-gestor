import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json(null)
  const user = session.user as any

  const hoy = new Date()
  const diaSemana = hoy.getDay()

  const rutaFija = await prisma.rutaFija.findFirst({
    where: {
      diaSemana,
      empleados: { some: { empleadoId: user.id } }
    },
    include: {
      clientes: {
        include: { cliente: true },
        orderBy: { orden: 'asc' }
      }
    }
  })

  if (!rutaFija) return NextResponse.json(null)

  const inicioHoy = new Date()
  inicioHoy.setHours(0, 0, 0, 0)
  const finHoy = new Date()
  finHoy.setHours(23, 59, 59, 999)

  const llegadasHoy = await prisma.visita.findMany({
    where: {
      empleadoId: user.id,
      tipo: { in: ['entrada', 'salida'] },
      createdAt: { gte: inicioHoy, lte: finHoy }
    }
  })

  return NextResponse.json({ rutaFija, llegadasHoy })
}
