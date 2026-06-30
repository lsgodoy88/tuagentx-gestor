import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ROLES_ADMIN } from '@/lib/auth-helpers'
import { calcularImpulsadorasMes } from '@/lib/impulsoMetricas'

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
  // fecha opcional para regenerar un mes específico (debug/recuperación
  // manual) — sin parámetro, congela el mes ACTUAL (el que está terminando).
  const fecha = searchParams.get('fecha') || new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
  const [anioStr, mesStr] = fecha.slice(0, 7).split('-')
  const anio = parseInt(anioStr)
  const mes = parseInt(mesStr)

  const empresas = await prisma.empresa.findMany({ select: { id: true } })

  const resultados = await Promise.all(empresas.map(async (e: any) => {
    try {
      // Sin filtro de rol — el snapshot guarda TODAS las impulsadoras de la
      // empresa, incluyendo vendedorId, para que el scope se aplique al leer.
      const data = await calcularImpulsadorasMes(e.id, fecha, {})
      if (data.impulsadoras.length === 0) return { empresaId: e.id, ok: true, omitido: true }

      await (prisma as any).reporteImpulsoMes.upsert({
        where: { empresaId_mes_anio: { empresaId: e.id, mes, anio } },
        create: { empresaId: e.id, mes, anio, resultados: data },
        update: { resultados: data },
      })
      return { empresaId: e.id, ok: true, impulsadoras: data.impulsadoras.length }
    } catch (err: any) {
      console.error('[snapshot-impulso]', e.id, err.message)
      return { empresaId: e.id, ok: false, error: err.message }
    }
  }))

  return NextResponse.json({ ok: true, mes, anio, resultados })
}
