import { NextRequest, NextResponse } from 'next/server'
import { runTurnosDia } from '@/lib/jobs/rutas-dia'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const forzar = body.forzar === true
  const result = await runTurnosDia(forzar)
  return NextResponse.json({ ok: true, ...result })
}
