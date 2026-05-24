import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([])
  const user = session.user as any

  const rutasEmpleado = await prisma.rutaEmpleado.findMany({
    where: { empleadoId: user.id },
    include: {
      ruta: {
        include: {
          clientes: {
            select: { id: true, orden: true, rezago: true, clienteId: true, cliente: { select: { id: true, nombre: true, nombreComercial: true, direccion: true, ciudad: true, telefono: true, lat: true, lng: true, ubicacionReal: true } } },
            orderBy: { orden: 'asc' }
          }
        }
      }
    },
    orderBy: { ruta: { createdAt: 'desc' } },
    take: 30
  })

  return NextResponse.json(rutasEmpleado.map((re: any) => re.ruta))
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
