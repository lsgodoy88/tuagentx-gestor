import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runRutasDia } from '@/lib/jobs/rutas-dia'

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

  const body = await req.json().catch(() => ({}))
  const forzar = body.forzar === true || body.accion === 'criar' || esCron
  const result = await runRutasDia(empresaIdFiltro, forzar)
  return NextResponse.json({ ok: true, ...result })
}
