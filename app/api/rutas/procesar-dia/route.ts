import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runRutasDia } from '@/lib/jobs/rutas-dia'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  const esCron = cronSecret === process.env.CRON_SECRET

  let empresaIdFiltro: string | null = null

  if (!esCron) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role !== 'empresa' && user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Solo empresa puede ejecutar esto' }, { status: 403 })
    }
    if (user.role === 'empresa') empresaIdFiltro = user.id
  }

  const result = await runRutasDia(empresaIdFiltro)
  if (esCron) {
    await (prisma as any).syncLog.create({ data: { tipo: 'rutas-dia', estado: 'ok', inicio: new Date(), fin: new Date() } }).catch(() => {})
  }
  return NextResponse.json({ ok: true, ...result })
}
