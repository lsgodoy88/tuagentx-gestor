import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { origenWhere } from '@/lib/bodega'

const ROLES = ROLES_ADMIN_BODEGA

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  const empresaId = getEmpresaId(user)
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const origenId = req.nextUrl.searchParams.get('origenId') ?? 'propia'
  if (!q || q.length < 1) return NextResponse.json({ despachos: [] })

  const whereOrigen = origenWhere(origenId)

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
