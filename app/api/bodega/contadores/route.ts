import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 2 * 60 * 1000  // 2 min

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const cached = cache.get(user.empresaId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return NextResponse.json(cached.data)

  const hoy = new Date(Date.now() - 5*60*60*1000)
  hoy.setHours(0, 0, 0, 0)

  const [pendientes, alistados, entregados] = await Promise.all([
    prisma.ordenDespacho.count({ where: { empresaId: user.empresaId, estado: 'pendiente' } }),
    prisma.ordenDespacho.count({ where: { empresaId: user.empresaId, estado: 'alistado' } }),
    prisma.ordenDespacho.count({ where: { empresaId: user.empresaId, estado: { in: ['en_entrega', 'entregado'] }, entregadoEl: { gte: hoy } } }),
  ])

  const data = { pendientes, alistados, entregados }
  cache.set(user.empresaId, { data, ts: Date.now() })
  return NextResponse.json(data)
}
