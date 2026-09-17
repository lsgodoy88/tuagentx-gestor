import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runSyncNocturno } from '@/lib/jobs/sync-nocturno'
import { ROLES_ADMIN } from '@/lib/auth-helpers'
import { redis } from '@/lib/redis'
import { checkSyncGuard } from '@/lib/sync-guard'

// Nocturno slim (2026-09-17): un solo modo, lock unificado 15 min
const LOCK_KEY = 'sync-nocturno:lock'
const LOCK_TTL = 15 * 60       // 15 min — suficiente para fetchDeudasDesde + reconstruir
const MAX_RUNTIME = 9 * 60 * 1000 // killswitch 9 min

export async function POST(req: NextRequest) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  if (isCron) {
    const deny = await checkSyncGuard(req, 'nocturno')
    if (deny) return deny
  }
  if (!isCron) {
    const session = await getServerSession(authOptions)
    const user = session?.user as any
    if (!user || !ROLES_ADMIN.includes(user.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  // Mutex Redis — evita dos syncs concurrentes
  const lock = process.env.SKIP_SYNC_LOCK === 'true' ? 'ok' : await redis.set(LOCK_KEY, 'nocturno', 'EX', LOCK_TTL, 'NX')
  if (!lock) {
    console.error('[sync-nocturno] ya hay un sync en curso — omitido')
    return NextResponse.json({ ok: true, omitido: true, razon: 'sync_en_curso' })
  }

  // Heartbeat — renueva lock cada 30s mientras corre
  const heartbeat = setInterval(() => {
    redis.expire(LOCK_KEY, 60).catch(() => {})
  }, 30 * 1000)

  // Killswitch — libera lock si el proceso se cuelga
  const killswitch = setTimeout(() => {
    clearInterval(heartbeat)
    redis.del(LOCK_KEY).catch(() => {})
    console.warn('[sync-nocturno] killswitch activado — proceso tardó demasiado')
  }, MAX_RUNTIME)

  // Fire-and-forget
  runSyncNocturno()
    .catch(e => console.error('[sync-nocturno] error background:', e.message))
    .finally(() => {
      clearInterval(heartbeat)
      clearTimeout(killswitch)
      redis.del(LOCK_KEY).catch(() => {})
    })

  return NextResponse.json({ ok: true, iniciado: true })
}
