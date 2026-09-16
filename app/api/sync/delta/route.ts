import { NextRequest, NextResponse } from 'next/server'
import { runSyncDelta } from '@/lib/jobs/sync-delta'
import { redis } from '@/lib/redis'
import { checkSyncGuard } from '@/lib/sync-guard'

// Lock global — evita ejecuciones paralelas que descuadran CarteraCache
let deltaRunning = false

export async function POST(req: NextRequest) {
  const deny = await checkSyncGuard(req, 'delta')
  if (deny) return deny
  if (deltaRunning) return NextResponse.json({ ok: false, msg: 'sync-delta ya en ejecución' }, { status: 409 })
  deltaRunning = true
  try {
    const resultados = await runSyncDelta()
    // Invalidar contextos TaXBot post-sync — datos de ordenes/cartera cambiaron
    const empresasSync = [...new Set(resultados.filter((r: any) => !r.error).map((r: any) => r.empresaId))]
    await Promise.all(empresasSync.map((id: any) => redis.del())).catch(() => {})
    return NextResponse.json({ ok: true, resultados })
  } finally {
    deltaRunning = false
  }
}
