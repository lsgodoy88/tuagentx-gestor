import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

// GET /api/sync/pulse
// Retorna el timestamp del último sync con datos nuevos de la empresa
// El dashboard lo polling cada 2min — si cambió, recarga stats
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const user = session.user as any
  const empresaId = user.empresaId
  if (!empresaId) return NextResponse.json({ ts: 0 })

  // Leer del Redis — clave seteada por delta/route.ts al haber cambios
  const key = `g:sync:pulse:${empresaId}`
  try {
    const val = await redis.get(key)
    return NextResponse.json({ ts: val ? parseInt(val) : 0 })
  } catch {
    // Si Redis falla, leer de BD como fallback
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { ultimaSyncBodega: true }
    })
    return NextResponse.json({ ts: empresa?.ultimaSyncBodega?.getTime() || 0 })
  }
}
