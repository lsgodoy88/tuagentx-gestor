import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const { empresaId, role } = session.user as any
  if (!['empresa', 'supervisor', 'bodega'].includes(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const empresa = await (prisma as any).empresa.findUnique({
    where: { id: empresaId }, select: { id: true, nombre: true }
  })

  const vinculadas = await (prisma as any).empresaVinculada.findMany({
    where: { empresaId, activa: true },
    select: { id: true, nombre: true, color: true },
    orderBy: { nombre: 'asc' },
  })

  return NextResponse.json({
    propia: { id: empresaId, nombre: empresa?.nombre || 'Principal', slug: 'propia' },
    vinculadas: vinculadas.map((v: any) => ({
      id: v.id, nombre: v.nombre, color: v.color,
      slug: v.nombre.toLowerCase().replace(/\s+/g, '-'),
    })),
  })
}
