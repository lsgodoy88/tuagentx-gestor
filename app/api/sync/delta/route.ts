import { NextRequest, NextResponse } from 'next/server'
import { runSyncDelta } from '@/lib/jobs/sync-delta'
import { redis } from '@/lib/redis'

// Lock global — evita ejecuciones paralelas que descuadran CarteraCache
let deltaRunning = false

export async function POST(req: NextRequest) {
  if (deltaRunning) return NextResponse.json({ ok: false, msg: 'sync-delta ya en ejecución' }, { status: 409 })
  deltaRunning = true
  try {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
    const resultados = await runSyncDelta()
    // Invalidar contextos TaXBot post-sync — datos de ordenes/cartera cambiaron
    const empresasSync = [...new Set(resultados.filter((r: any) => !r.error).map((r: any) => r.empresaId))]
    await Promise.all(empresasSync.map((id: any) => redis.del())).catch(() => {})
    return NextResponse.json({ ok: true, resultados })
  } finally {
    deltaRunning = false
  }
}
