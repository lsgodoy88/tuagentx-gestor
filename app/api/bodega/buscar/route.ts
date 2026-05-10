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
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const origenId = req.nextUrl.searchParams.get('origenId') ?? 'propia'
  if (!q || q.length < 1) return NextResponse.json({ despachos: [] })

  const esVinculada = origenId !== 'propia' && origenId !== ''
  const whereOrigen = esVinculada
    ? { origenVinculadaId: origenId }
    : { origenVinculadaId: null }

  const despachos = await (prisma as any).ordenDespacho.findMany({
    where: {
      empresaId,
      ...whereOrigen,
      OR: [
        { numeroOrden: { contains: q, mode: 'insensitive' } },
        { clienteNombre: { contains: q, mode: 'insensitive' } },
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      alistadoPor: { select: { id: true, nombre: true } },
      repartidor: { select: { id: true, nombre: true } },
    }
  })
  return NextResponse.json({ despachos })
}
