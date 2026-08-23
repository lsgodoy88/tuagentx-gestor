import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { fechaHoyBogota } from '@/lib/fechas'
import { calcularImpulsadorasMes } from '@/lib/impulsadora/metricas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || fechaHoyBogota()
  const hasta = searchParams.get('hasta') // YYYY-MM, opcional

  // Modo rango: desde=fecha hasta=hasta (máx 4 meses)
  if (hasta) {
    const meses = generarRangoMeses(fecha.slice(0, 7), hasta, 4)
    let whereImpExtra: any = {}
    if (user.role === 'vendedor') whereImpExtra = { vendedorId: user.id }
    if (user.role === 'impulsadora') whereImpExtra = { id: user.id }

    const resultados = await Promise.all(meses.map(async (ym) => {
      const [anioStr, mesStr] = ym.split('-')
      const anio = parseInt(anioStr), mes = parseInt(mesStr)
      const snap = await (prisma as any).reporteImpulsoMes.findUnique({
        where: { empresaId_mes_anio: { empresaId, mes, anio } },
      })
      if (snap) {
        const d = snap.resultados as any
        return { ym, impulsadoras: aplicarScopeRol(d.impulsadoras || [], user) }
      }
      const d = await calcularImpulsadorasMes(empresaId, ym + '-01', whereImpExtra)
      return { ym, impulsadoras: d.impulsadoras || [] }
    }))

    // Merge: por impulsadora, semana fija del primer mes, ventas por mes
    const impMap: Record<string, any> = {}
    for (const { ym, impulsadoras } of resultados) {
      for (const imp of impulsadoras) {
        if (!impMap[imp.id]) {
          impMap[imp.id] = { id: imp.id, nombre: imp.nombre, semana: imp.semana, meses: {} }
        }
        // Mapa clienteId -> montoMes por mes
        const ventasPorCliente: Record<string, number> = {}
        for (const dia of (imp.semana || [])) {
          for (const p of (dia.puntos || [])) {
            ventasPorCliente[p.clienteId ?? p.nombre] = p.montoMes ?? 0
          }
        }
        impMap[imp.id].meses[ym] = {
          totalMes: imp.totalMes,
          totalMeta: imp.totalMeta,
          pctTotal: imp.pctTotal,
          ventasPorCliente,
        }
      }
    }

    return NextResponse.json({ rango: true, meses, impulsadoras: Object.values(impMap) })
  }

  // Modo mes único (comportamiento original)
  const [anioStr, mesStr] = fecha.slice(0, 7).split('-')
  const anio = parseInt(anioStr)
  const mes = parseInt(mesStr)

  const snapshot = await (prisma as any).reporteImpulsoMes.findUnique({
    where: { empresaId_mes_anio: { empresaId, mes, anio } },
  })

  if (snapshot) {
    const data = snapshot.resultados as any
    const impulsadoras = aplicarScopeRol(data.impulsadoras || [], user)
    return NextResponse.json({ ...data, impulsadoras, snapshot: true })
  }

  let whereImpExtra: any = {}
  if (user.role === 'vendedor') whereImpExtra = { vendedorId: user.id }
  if (user.role === 'impulsadora') whereImpExtra = { id: user.id }

  const data = await calcularImpulsadorasMes(empresaId, fecha, whereImpExtra)
  return NextResponse.json({ ...data, snapshot: false })
}

function generarRangoMeses(desde: string, hasta: string, max: number): string[] {
  const [da, dm] = desde.split('-').map(Number)
  const [ha, hm] = hasta.split('-').map(Number)
  const meses: string[] = []
  let a = da, m = dm
  while ((a < ha || (a === ha && m <= hm)) && meses.length < max) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; a++ }
  }
  return meses
}

// Aplica el mismo filtro de rol que antes vivia en el where de Prisma, pero
// sobre el JSON ya congelado del snapshot (que siempre incluye TODAS las
// impulsadoras de la empresa). Cada entrada del snapshot guarda vendedorId
// para poder reproducir el mismo scope exacto que el calculo en vivo.
function aplicarScopeRol(impulsadoras: any[], user: any) {
  if (user.role === 'vendedor') {
    return impulsadoras.filter((i: any) => i.vendedorId === user.id)
  }
  if (user.role === 'impulsadora') {
    return impulsadoras.filter((i: any) => i.id === user.id)
  }
  return impulsadoras
}
