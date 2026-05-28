import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/sync/pulse
// Retorna timestamp del último sync de la empresa directamente de BD
// El dashboard lo polling cada 2min — si cambió, recarga stats
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ ts: 0 })

  const user = session.user as any
  const empresaId = user.empresaId
  if (!empresaId) return NextResponse.json({ ts: 0 })

  const empresa = await (prisma as any).empresa.findUnique({
    where: { id: empresaId },
    select: { ultimaSyncBodega: true }
  })

  const ts = empresa?.ultimaSyncBodega?.getTime() || 0
  return NextResponse.json({ ts }, {
    headers: { 'Cache-Control': 'no-store' }
  })
}
