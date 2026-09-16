import { NextRequest, NextResponse } from 'next/server'
import { runSyncTransprensa } from '@/lib/jobs/sync-transprensa'
import { checkSyncGuard } from '@/lib/sync-guard'

export async function POST(req: NextRequest) {
  const deny = await checkSyncGuard(req, 'transprensa')
  if (deny) return deny

  try {
    const result = await runSyncTransprensa()
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[sync-transprensa]', e.message)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
