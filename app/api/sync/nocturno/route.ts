import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runSyncNocturno } from '@/lib/jobs/sync-nocturno'
import { ROLES_ADMIN } from '@/lib/auth-helpers'
import { redis } from '@/lib/redis'

const LOCK_KEY = 'sync-nocturno:lock'
const LOCK_TTL_COMPLETO = 60 * 60  // 1 hora — completo puede paginar muchas páginas
const LOCK_TTL_DELTA    = 10 * 60  // 10 min — delta es rápido

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

  // Mutex Redis — evita dos syncs concurrentes (doble dispatch del Guardian)
  const lockKey = modo === 'completo' ? LOCK_KEY : `${LOCK_KEY}:delta`
  const lockTtl = modo === 'completo' ? LOCK_TTL_COMPLETO : LOCK_TTL_DELTA
  const lock = await redis.set(lockKey, modo, 'EX', lockTtl, 'NX')
  if (!lock) {
    console.error('[sync-nocturno] ya hay un sync en curso — omitido')
    return NextResponse.json({ ok: true, omitido: true, razon: 'sync_en_curso' })
  }

  // Fire-and-forget — liberar lock al terminar
  runSyncNocturno({ modo })
    .catch(e => console.error('[sync-nocturno] error background:', e.message))
    .finally(() => redis.del(lockKey).catch(() => {}))

  return NextResponse.json({ ok: true, iniciado: true })
}
