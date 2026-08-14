import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getContadoresBodega } from '@/lib/bodega/contadores'

const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 2 * 60 * 1000

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const cached = cache.get(user.empresaId)
    if (cached && Date.now() - cached.ts < CACHE_TTL) return NextResponse.json(cached.data)

    const data = await getContadoresBodega(user.empresaId)
    cache.set(user.empresaId, { data, ts: Date.now() })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
