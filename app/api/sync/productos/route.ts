import { NextRequest, NextResponse } from 'next/server'
import { syncProductosTodas } from '@/lib/jobs/sync-productos'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const result = await syncProductosTodas()
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[sync-productos]', e.message)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
