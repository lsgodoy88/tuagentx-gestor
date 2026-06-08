import { NextRequest, NextResponse } from 'next/server'
import { runSyncNocturno } from '@/lib/jobs/sync-nocturno'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const modo = (searchParams.get('modo') ?? 'completo') as 'completo' | 'delta'

  const resultados = await runSyncNocturno({ modo })
  return NextResponse.json({ ok: true, resultados })
}
