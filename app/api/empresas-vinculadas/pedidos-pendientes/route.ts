import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa' && user.role !== 'supervisor') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const pedidos = await prisma.ruta.findMany({
    where: {
      empresaVinculadaId: { not: null },
      empresaVinculada: { empresaId },
      cerrada: false,
      empleados: { none: {} },
    },
    include: {
      empresaVinculada: { select: { nombre: true, color: true } },
      clientes: {
        take: 1,
        orderBy: { orden: 'asc' },
        include: { cliente: { select: { nombre: true, direccion: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ pedidos })
}
