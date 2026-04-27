import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['empresa', 'supervisor', 'bodega']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nombre: true },
  })

  const vinculadas = await prisma.empresaVinculada.findMany({
    where: { empresaId, activa: true },
    select: { id: true, nombre: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json([
    { id: 'propia', nombre: empresa?.nombre ?? 'Mi empresa', tipo: 'propia' },
    ...vinculadas.map(v => ({ id: v.id, nombre: v.nombre, tipo: 'vinculada' })),
  ])
}
