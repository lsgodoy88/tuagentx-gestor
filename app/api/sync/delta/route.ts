import { NextRequest, NextResponse } from 'next/server'
import { runSyncDelta } from '@/lib/jobs/sync-delta'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const resultados = await runSyncDelta()
  return NextResponse.json({ ok: true, resultados })
}
