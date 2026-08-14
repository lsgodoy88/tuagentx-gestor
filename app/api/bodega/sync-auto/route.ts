import { NextRequest, NextResponse } from 'next/server'
import { syncAutoTodas } from '@/lib/bodega/sync-auto'

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const result = await syncAutoTodas()
  return NextResponse.json(result)
}
