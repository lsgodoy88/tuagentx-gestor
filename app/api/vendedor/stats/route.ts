import { NextResponse } from 'next/server'
import { nowBogota, fechaHoyBogota, haceNDiasBogota, haceNMesesBogota, inicioDiaBogota, finDiaBogota, inicioMesBogota, inicioMesAnteriorBogota, mesBogota, anioBogota, mesAnteriorBogota, anioMesAnteriorBogota, esDelMesBogota, fmtFechaHora, fmtFechaMedia, fmtHora } from '@/lib/fechas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DIAS } from '@/lib/constants'
import { withCache } from '@/lib/cache'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'vendedor') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const ahora = nowBogota()
  const hoyStrKey = ahora.toISOString().split('T')[0]
  const cacheKey = `g:v:${user.id}:${hoyStrKey}`
  const result = await withCache(cacheKey, 600, async () => {
  const hoyStr = ahora.toISOString().split('T')[0]

  // Rangos de tiempo en UTC (Colombia = UTC-5)
  const inicioDia    = new Date(hoyStr + 'T05:00:00.000Z')
  const finDia       = new Date(hoyStr + 'T05:00:00.000Z')
  finDia.setDate(finDia.getDate() + 1)

  const ayerStr      = haceNDiasBogota(1).toISOString().split('T')[0]
  const inicioAyer   = new Date(ayerStr + 'T05:00:00.000Z')
  const finAyer      = new Date(ayerStr + 'T05:00:00.000Z')
  finAyer.setDate(finAyer.getDate() + 1)

  const anioMes      = ahora.getFullYear()
  const mesMes       = ahora.getMonth() + 1
  const inicioMes    = new Date(`${anioMes}-${String(mesMes).padStart(2,'0')}-01T05:00:00.000Z`)
  const finMes       = new Date(inicioMes); finMes.setMonth(finMes.getMonth() + 1)

  // ── Fase 1: obtener apiId del empleado ────────────────────────────
  const empleadoData = await (prisma as any).empleado.findUnique({
    where: { id: user.id },
    select: { apiId: true },
  })
  const miApiId: string | null = empleadoData?.apiId || null

  // ── Fase 2: queries paralelas ─────────────────────────────────────
  const hace90dias = new Date(ahora)
  hace90dias.setDate(hace90dias.getDate() - 90)

  const [
    todasVisitas,
    visitasAyer,
    ordenesHoy,
    ordenesMes,
    impulsadoras,
    pagosRecaudoMes,
    metaRecaudo,
    metaVentaRow,
  ] = await Promise.all([
    // Visitas últimos 90 días
    prisma.visita.findMany({
      where: { empleadoId: user.id, createdAt: { gte: hace90dias } },
      orderBy: { fechaBogota: 'asc' },
    }),
    // Visitas de ayer
    prisma.visita.findMany({
      where: { empleadoId: user.id, fechaBogota: { gte: inicioAyer, lt: finAyer } },
    }),
    // Órdenes hoy (todas — desp+fact)
    miApiId
      ? (prisma as any).ordenDespacho.findMany({
          where: { vendedorApiId: miApiId, fechaOrden: { gte: inicioDia, lt: finDia } },
          select: { estado: true, numeroFactura: true, totalOrden: true },
        })
      : Promise.resolve([]),
    // Órdenes del mes — solo facturadas (isFacturada=true, equivale a isInvoiced en UpTres)
    miApiId
      ? (prisma as any).ordenDespacho.aggregate({
          where: {
            vendedorApiId: miApiId,
            fechaOrden: { gte: inicioMes, lt: finMes },
            isFacturada: true,
          },
          _count: { id: true },
          _sum: { totalOrden: true },
        })
      : Promise.resolve({ _count: { id: 0 }, _sum: { totalOrden: null } }),
    // Impulsadoras a cargo
    prisma.empleado.findMany({
      where: { vendedorId: user.id, rol: 'impulsadora', activo: true },
    }),
    // Recaudo + descuentos del mes
    (prisma as any).pagoCartera.aggregate({
      where: { empleadoId: user.id, createdAt: { gte: inicioMes } },
      _sum: { monto: true, descuento: true },
      _count: { id: true },
    }),
    // Meta de recaudo del mes
    (prisma as any).metaRecaudo.findFirst({
      where: { empleadoId: user.id, mes: mesMes, anio: anioMes },
    }),
    // Meta de venta del mes
    (prisma as any).metaVenta.findFirst({
      where: { empleadoId: user.id, mes: mesMes, anio: anioMes },
    }),
  ])

  // ── Visitas hoy ───────────────────────────────────────────────────
  const visitasHoy = todasVisitas.filter(v => {
    const fv = v.fechaBogota
      ? new Date(v.fechaBogota).toISOString().split('T')[0]
      : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
    return fv === hoyStr
  })

  const hoy = {
    total:       visitasHoy.length,
    visitas:     visitasHoy.filter(v => v.tipo === 'visita').length,
    ventas:      visitasHoy.filter(v => v.tipo === 'venta').length,
    cobros:      visitasHoy.filter(v => v.tipo === 'cobro').length,
    entregas:    visitasHoy.filter(v => v.tipo === 'entrega').length,
    montoVentas: visitasHoy.filter(v => v.tipo === 'venta').reduce((a, v) => a + Number(v.monto || 0), 0),
    montoCobros: visitasHoy.filter(v => v.tipo === 'cobro').reduce((a, v) => a + Number(v.monto || 0), 0),
    ayer:        visitasAyer.length,
  }

  // ── Órdenes ───────────────────────────────────────────────────────
  const despHoy = (ordenesHoy as any[]).filter((o: any) =>
    ['despachado','entregado'].includes(o.estado)
  ).length
  const factHoy = (ordenesHoy as any[]).length

  const ordenes = {
    despHoy,
    factHoy,
    ventasMes:    Number((ordenesMes as any)._count.id       || 0),
    montoMes:     Number((ordenesMes as any)._sum.totalOrden  || 0),
    metaVentaMes: Number((metaVentaRow as any)?.metaPesos     || 0),
  }

  // ── Recaudo ───────────────────────────────────────────────────────
  const recaudo = {
    mes:          Number((pagosRecaudoMes as any)._sum.monto      || 0),
    descuentosMes:Number((pagosRecaudoMes as any)._sum.descuento  || 0),
    pagosCount:   Number((pagosRecaudoMes as any)._count.id       || 0),
    meta:         Number((metaRecaudo as any)?.metaPesos           || 0),
  }

  // ── Historial últimos 6 días ──────────────────────────────────────
  const dias = []
  for (let i = 5; i >= 0; i--) {
    const d = haceNDiasBogota(i)
    const dStr = d.toISOString().split('T')[0]
    const vDia = todasVisitas.filter(v => {
      const fv = v.fechaBogota
        ? new Date(v.fechaBogota).toISOString().split('T')[0]
        : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      return fv === dStr
    })
    dias.push({
      fecha:       dStr,
      label:       new Date(dStr + 'T12:00:00Z').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }),
      total:       vDia.length,
      montoVentas: vDia.filter(v => v.tipo === 'venta').reduce((a, v) => a + Number(v.monto || 0), 0),
      montoCobros: vDia.filter(v => v.tipo === 'cobro').reduce((a, v) => a + Number(v.monto || 0), 0),
    })
  }

  // ── Historial últimos 6 meses ─────────────────────────────────────
  const meses = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    const anio = d.getFullYear()
    const mes = d.getMonth()
    const vMes = todasVisitas.filter(v => {
      const fv = v.fechaBogota
        ? new Date(v.fechaBogota)
        : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000)
      return fv.getFullYear() === anio && fv.getMonth() === mes
    })
    meses.push({
      label:       d.toLocaleDateString('es-CO', { month: 'short' }).replace('.','') + ' ' + String(d.getFullYear()).slice(-2),
      total:       vMes.length,
      montoVentas: vMes.filter(v => v.tipo === 'venta').reduce((a, v) => a + Number(v.monto || 0), 0),
      montoCobros: vMes.filter(v => v.tipo === 'cobro').reduce((a, v) => a + Number(v.monto || 0), 0),
    })
  }

  // ── Impulsadoras ──────────────────────────────────────────────────
  const cumplimiento = await Promise.all(impulsadoras.map(async (imp) => {
    const diaSemana = ahora.getDay()
    const rutaFija = await prisma.rutaFija.findFirst({
      where: { diaSemana, empleados: { some: { empleadoId: imp.id } } },
      include: { clientes: { include: { cliente: true } } }
    })

    const visitasImp = await prisma.visita.findMany({
      where: { empleadoId: imp.id },
      take: 500,
      orderBy: { fechaBogota: 'desc' }
    })

    const visitasHoyImp = visitasImp.filter(v => {
      const fv = v.fechaBogota
        ? new Date(v.fechaBogota).toISOString().split('T')[0]
        : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      return fv === hoyStr && (v.tipo === 'entrada' || v.tipo === 'salida')
    })

    const totalPuntos = rutaFija?.clientes?.length || 0
    const clientesVisitados = new Set(visitasHoyImp.map(v => v.clienteId)).size
    const pct = totalPuntos > 0 ? Math.round((clientesVisitados / totalPuntos) * 100) : null
    const turnoActivo = await prisma.turno.findFirst({ where: { empleadoId: imp.id, activo: true } })

    let puntoActual = null
    let proximoPunto = null
    if (rutaFija?.clientes) {
      for (const rc of rutaFija.clientes) {
        const entradas = visitasHoyImp.filter(v => v.rutaFijaClienteId === rc.id && v.tipo === 'entrada')
        const salidas  = visitasHoyImp.filter(v => v.rutaFijaClienteId === rc.id && v.tipo === 'salida')
        if (entradas.length > 0 && salidas.length === 0) {
          puntoActual = { nombre: rc.cliente.nombre, nombreComercial: rc.cliente.nombreComercial, orden: rc.orden }
        } else if (entradas.length === 0 && !puntoActual) {
          proximoPunto = { nombre: rc.cliente.nombre, nombreComercial: rc.cliente.nombreComercial, orden: rc.orden }
        }
      }
    }

    const alertasGps = await prisma.auditLog.findMany({
      where: { empleadoId: imp.id, accion: 'GPS_FUERA_RANGO', createdAt: { gte: inicioDia, lt: finDia } },
      orderBy: { createdAt: 'desc' }
    })

    const daysToCheck = Array.from({ length: 7 }, (_, i) => (ahora.getDay() + i + 1) % 7)
    const rutasFijasDias = await Promise.all(
      daysToCheck.map((diaCheck: number) =>
        prisma.rutaFija.findFirst({
          where: { diaSemana: diaCheck, empleados: { some: { empleadoId: imp.id } } }
        })
      )
    )
    const firstIdx = rutasFijasDias.findIndex((r: any) => r !== null)
    const proximoDia = firstIdx >= 0 ? DIAS[daysToCheck[firstIdx]] : null

    return {
      id: imp.id, nombre: imp.nombre, turnoActivo: !!turnoActivo,
      totalPuntos, visitados: clientesVisitados, pct,
      alerta: pct !== null && pct < 50 && !turnoActivo,
      puntoActual, proximoPunto,
      alertasGps: alertasGps.map(a => ({ detalle: a.detalle, hora: a.createdAt })),
      proximoDia,
    }
  }))

  return { hoy, ordenes, recaudo, dias, meses, cumplimiento }
  }) // withCache
  const res = NextResponse.json(result)
  res.headers.set('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=60')
  return res
}
