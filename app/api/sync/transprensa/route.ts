import { NextRequest, NextResponse } from 'next/server'
import { runSyncTransprensa } from '@/lib/jobs/sync-transprensa'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const result = await runSyncTransprensa()
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[sync-transprensa]', e.message)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
