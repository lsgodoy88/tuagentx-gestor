import { NextRequest, NextResponse } from 'next/server'
import { runTurnosDia } from '@/lib/jobs/rutas-dia'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const forzar = body.forzar === true
  const result = await runTurnosDia(forzar)
  await (prisma as any).syncLog.create({ data: { tipo: 'turnos-dia', estado: 'ok', inicio: new Date(), fin: new Date() } }).catch(() => {})
  return NextResponse.json({ ok: true, ...result })
}
