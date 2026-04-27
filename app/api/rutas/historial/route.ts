import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([])
  const user = session.user as any

  const rutasEmpleado = await prisma.rutaEmpleado.findMany({
    where: { empleadoId: user.id },
    include: {
      ruta: {
        include: {
          clientes: {
            include: { cliente: true },
            orderBy: { orden: 'asc' }
          }
        }
      }
    },
    orderBy: { ruta: { createdAt: 'desc' } }
  })

  return NextResponse.json(rutasEmpleado.map((re: any) => re.ruta))
}
