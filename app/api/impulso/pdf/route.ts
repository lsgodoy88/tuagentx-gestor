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

  // ── Modo rango ────────────────────────────────────────────────────
  if (hasta) {
    const meses = generarRangoMeses(fecha.slice(0, 7), hasta, 4)
    let whereImpExtra: any = {}
    if (user.role === 'vendedor') whereImpExtra = { vendedorId: user.id }
    if (user.role === 'impulsadora') whereImpExtra = { id: user.id }

    // Por cada mes: obtener lista de clientes esPrimero con meta + montoMes
    const resultadosPorMes = await Promise.all(meses.map(async (ym) => {
      const [anioStr, mesStr] = ym.split('-')
      const anio = parseInt(anioStr), mes = parseInt(mesStr)

      // Intentar snapshot congelado primero
      const snap = await (prisma as any).reporteImpulsoMes.findUnique({
        where: { empresaId_mes_anio: { empresaId, mes, anio } },
      })

      let impulsadoras: any[]
      if (snap) {
        const d = snap.resultados as any
        impulsadoras = aplicarScopeRol(d.impulsadoras || [], user)
      } else {
        const d = await calcularImpulsadorasMes(empresaId, ym + '-01', whereImpExtra)
        impulsadoras = d.impulsadoras || []
      }

      // Extraer solo puntos esPrimero por impulsadora
      const porImp: Record<string, any[]> = {}
      for (const imp of impulsadoras) {
        const puntos: any[] = []
        for (const dia of (imp.semana || [])) {
          for (const p of (dia.puntos || [])) {
            if (p.esPrimero) {
              puntos.push({
                clienteId: p.clienteId,
                nombre: p.nombre,
                nombreComercial: p.nombreComercial || null,
                meta: p.meta,
                montoMes: p.montoMes,
                pct: p.pct,
              })
            }
          }
        }
        porImp[imp.id] = puntos
      }

      return { ym, impulsadoras, porImp }
    }))

    // Construir estructura pivot por impulsadora
    // impMap: id → { id, nombre, clientesPorMes, totalesPorMes }
    const impMap: Record<string, any> = {}

    for (const { ym, impulsadoras, porImp } of resultadosPorMes) {
      for (const imp of impulsadoras) {
        if (!impMap[imp.id]) {
          impMap[imp.id] = {
            id: imp.id,
            nombre: imp.nombre,
            vendedorId: imp.vendedorId || null,
            clientesPorMes: {},
            totalesPorMes: {},
            // Unión acumulada de clienteIds únicos (esPrimero) en orden de aparición
            clientesUnion: [], // [{ clienteId, nombre, nombreComercial }]
            _clientesVistos: new Set<string>(),
          }
        }
        const entry = impMap[imp.id]

        // Registrar clientes de este mes en la unión (en orden de aparición)
        for (const p of (porImp[imp.id] || [])) {
          if (!entry._clientesVistos.has(p.clienteId)) {
            entry._clientesVistos.add(p.clienteId)
            entry.clientesUnion.push({
              clienteId: p.clienteId,
              nombre: p.nombre,
              nombreComercial: p.nombreComercial,
            })
          }
        }

        // Mapa clienteId → { meta, montoMes, pct } para este mes
        const mapaMes: Record<string, { meta: number; montoMes: number; pct: number | null }> = {}
        for (const p of (porImp[imp.id] || [])) {
          mapaMes[p.clienteId] = { meta: p.meta, montoMes: p.montoMes, pct: p.pct }
        }
        entry.clientesPorMes[ym] = mapaMes

        // Totales del mes
        entry.totalesPorMes[ym] = {
          totalMeta: imp.totalMeta ?? 0,
          totalMes: imp.totalMes ?? 0,
          pctTotal: imp.pctTotal ?? null,
        }
      }
    }

    // Limpiar Set interno (no serializable en JSON)
    const impulsadorasPivot = Object.values(impMap).map((e: any) => {
      const { _clientesVistos, ...rest } = e
      return rest
    })

    return NextResponse.json({ rango: true, meses, impulsadoras: impulsadorasPivot })
  }

  // ── Modo mes único (comportamiento original) ──────────────────────
  const [anioStr, mesStr] = fecha.slice(0, 7).split('-')
  const anio = parseInt(anioStr)
  const mes = parseInt(mesStr)

  const snapshot = await (prisma as any).reporteImpulsoMes.findUnique({
    where: { empresaId_mes_anio: { empresaId, mes, anio } },
  })

  if (snapshot) {
    const data = snapshot.resultados as any
    const impulsadoras = aplicarScopeRol(data.impulsadoras || [], user)
    return NextResponse.json({ ...data, impulsadoras, snapshot: true, actualizadoEn: snapshot.createdAt })
  }

  let whereImpExtra: any = {}
  if (user.role === 'vendedor') whereImpExtra = { vendedorId: user.id }
  if (user.role === 'impulsadora') whereImpExtra = { id: user.id }

  const empleadoId = searchParams.get('empleadoId')
  if (empleadoId && ['empresa', 'supervisor', 'vendedor'].includes(user.role)) {
    whereImpExtra = { ...whereImpExtra, id: empleadoId }
  }

  const [data, ultimaVenta] = await Promise.all([
    calcularImpulsadorasMes(empresaId, fecha, whereImpExtra),
    (prisma as any).ventaMesCliente.findFirst({
      where: { empresaId, mes: fecha.slice(0, 7) },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ])
  const actualizadoEn = ultimaVenta?.updatedAt ?? new Date()
  return NextResponse.json({ ...data, snapshot: false, actualizadoEn })
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

function aplicarScopeRol(impulsadoras: any[], user: any) {
  if (user.role === 'vendedor') {
    return impulsadoras.filter((i: any) => i.vendedorId === user.id)
  }
  if (user.role === 'impulsadora') {
    return impulsadoras.filter((i: any) => i.id === user.id)
  }
  return impulsadoras
}
