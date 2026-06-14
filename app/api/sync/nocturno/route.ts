import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runSyncNocturno } from '@/lib/jobs/sync-nocturno'
import { ROLES_ADMIN } from '@/lib/auth-helpers'

export async function POST(req: NextRequest) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  if (!isCron) {
    const session = await getServerSession(authOptions)
    const user = session?.user as any
    if (!user || !ROLES_ADMIN.includes(user.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }
  const { searchParams } = new URL(req.url)
  const modo = (searchParams.get('modo') ?? 'completo') as 'completo' | 'delta'

  const resultados = await runSyncNocturno({ modo })
  return NextResponse.json({ ok: true, resultados })
}
