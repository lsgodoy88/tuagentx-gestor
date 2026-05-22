import { NextResponse } from 'next/server'
import { nowBogota, fechaHoyBogota, haceNDiasBogota, haceNMesesBogota, inicioDiaBogota, finDiaBogota, inicioMesBogota, inicioMesAnteriorBogota, mesBogota, anioBogota, mesAnteriorBogota, anioMesAnteriorBogota, esDelMesBogota, fmtFechaHora, fmtFechaMedia, fmtHora } from '@/lib/fechas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, vendedorScope } from '@/lib/auth-helpers'

/**
 * GET /api/cartera/resumen
 * Resumen liviano para el dashboard — una sola query agregada.
 * Devuelve: totalCartera, totalPendiente, recaudadoMes, descuentosMes, clientes, pagosCount, variacion
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const { permitido, empleadoIdForzado } = vendedorScope(user)
  if (!permitido) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)

  // ── Totales cartera ──────────────────────────────────────────────
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })

  let totalCartera = 0
  let totalPendiente = 0
  let clientes = 0

  if (integracion) {
    const where: any = { integracionId: integracion.id, saldoPendiente: { gt: 0 } }

    if (empleadoIdForzado) {
      // vendedor: filtrar por su apiId
      const emp = await (prisma as any).empleado.findUnique({
        where: { id: empleadoIdForzado },
        select: { apiId: true }
      })
      const miApiId = emp?.apiId || null
      if (miApiId) {
        const deudasEmpleado = await (prisma as any).syncDeuda.findMany({
          where: { integracionId: integracion.id, empleadoExternalId: miApiId, condition: true },
          select: { clienteApiId: true }
        })
        const clienteApiIds = [...new Set(deudasEmpleado.map((d: any) => d.clienteApiId))]
        where.clienteApiId = { in: clienteApiIds }
      } else {
        where.clienteId = { in: [] }
      }
    }

    const agg = await (prisma as any).carteraCache.aggregate({
      where,
      _sum: { saldoPendiente: true, saldoTotal: true },
      _count: { clienteId: true }
    })
    totalCartera  = Number(agg._sum.saldoTotal    || 0)
    totalPendiente = Number(agg._sum.saldoPendiente || 0)
    clientes       = Number(agg._count.clienteId    || 0)
  } else {
    // Modo manual
    const whereC: any = { empresaId }
    if (empleadoIdForzado) whereC.empleadoId = empleadoIdForzado

    const agg = await (prisma as any).cartera.aggregate({
      where: whereC,
      _sum: { saldoPendiente: true, saldoTotal: true },
      _count: { id: true }
    })
    totalCartera   = Number(agg._sum.saldoTotal    || 0)
    totalPendiente = Number(agg._sum.saldoPendiente || 0)
    clientes       = Number(agg._count.id           || 0)
  }

  // ── Pagos del mes actual y anterior ────────────────────────────
  const ahora = nowBogota()
  const anio  = ahora.getFullYear()
  const mes   = ahora.getMonth() + 1

  // UTC offsets Colombia (UTC-5): inicio del mes a las 05:00 UTC
  const inicioMes    = new Date(`${anio}-${String(mes).padStart(2,'0')}-01T05:00:00.000Z`)
  const mesAnt       = mes === 1 ? 12 : mes - 1
  const anioAnt      = mes === 1 ? anio - 1 : anio
  const inicioMesAnt = new Date(`${anioAnt}-${String(mesAnt).padStart(2,'0')}-01T05:00:00.000Z`)

  const wherePagos: any = {
    OR: [
      { Cartera: { empresaId } },
      { AND: [{ carteraId: null }, { Empleado: { empresaId } }] },
    ],
    createdAt: { gte: inicioMes }
  }
  if (empleadoIdForzado) wherePagos.empleadoId = empleadoIdForzado

  const wherePagosAnt: any = {
    OR: [
      { Cartera: { empresaId } },
      { AND: [{ carteraId: null }, { Empleado: { empresaId } }] },
    ],
    createdAt: { gte: inicioMesAnt, lt: inicioMes }
  }
  if (empleadoIdForzado) wherePagosAnt.empleadoId = empleadoIdForzado

  const [aggMes, aggAnt] = await Promise.all([
    (prisma as any).pagoCartera.aggregate({
      where: wherePagos,
      _sum: { monto: true, descuento: true },
      _count: { id: true }
    }),
    (prisma as any).pagoCartera.aggregate({
      where: wherePagosAnt,
      _sum: { monto: true, descuento: true }
    })
  ])

  const recaudadoMes   = Number(aggMes._sum.monto      || 0)
  const descuentosMes  = Number(aggMes._sum.descuento  || 0)
  const pagosCount     = Number(aggMes._count.id       || 0)
  const totalMes       = recaudadoMes + descuentosMes
  const totalAnt       = Number(aggAnt._sum.monto || 0) + Number(aggAnt._sum.descuento || 0)
  const variacion      = totalAnt > 0 ? Math.round(((totalMes - totalAnt) / totalAnt) * 100) : 0

  const _res = NextResponse.json({
    totalCartera,
    totalPendiente,
    recaudadoMes,
    descuentosMes,
    clientes,
    pagosCount,
    variacion,
  })
  _res.headers.set('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=60')
  return _res
}