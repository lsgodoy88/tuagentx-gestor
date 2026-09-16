import { NextRequest, NextResponse } from 'next/server'
import { syncProductosTodas } from '@/lib/jobs/sync-productos'
import { checkSyncGuard } from '@/lib/sync-guard'

export async function POST(req: NextRequest) {
  const deny = await checkSyncGuard(req, 'productos')
  if (deny) return deny

  try {
    const result = await syncProductosTodas()
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[sync-productos]', e.message)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
