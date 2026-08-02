import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runSnapshotMes } from '@/lib/jobs/snapshot-mes'
import { ROLES_ADMIN } from '@/lib/auth-helpers'

export async function POST(req: NextRequest) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  if (!isCron) {
    const session = await getServerSession(authOptions)
    const user = session?.user as any
    if (!user || !ROLES_ADMIN.includes(user.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') ?? undefined // ej: '2026-07' para backfill

  try {
    const resultado = await runSnapshotMes(mes)
    return NextResponse.json({ ok: true, ...resultado })
  } catch (err: any) {
    console.error('[snapshot-mes]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
