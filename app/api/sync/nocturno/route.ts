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
  const body = await req.json().catch(() => ({}))
  const { searchParams } = new URL(req.url)
  const modo = (body.modo ?? searchParams.get('modo') ?? 'completo') as 'completo' | 'delta'

  // Fire-and-forget — nocturno puede paginar sin presión de timeout
  runSyncNocturno({ modo }).catch(e =>
    console.error('[sync-nocturno] error background:', e.message)
  )
  return NextResponse.json({ ok: true, iniciado: true })
}
