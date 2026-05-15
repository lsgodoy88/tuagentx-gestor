import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const [pendientes, alistados, entregados] = await Promise.all([
    prisma.ordenDespacho.count({ where: { empresaId: user.empresaId, estado: 'pendiente' } }),
    prisma.ordenDespacho.count({ where: { empresaId: user.empresaId, estado: 'alistado' } }),
    prisma.ordenDespacho.count({ where: { empresaId: user.empresaId, estado: { in: ['en_entrega', 'entregado'] }, entregadoEl: { gte: hoy } } }),
  ])

  return NextResponse.json({ pendientes, alistados, entregados })
}
