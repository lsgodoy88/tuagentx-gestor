import { NextResponse } from 'next/server'
import type { VendedorStats } from '@/lib/types/vendedor'
import { nowBogota, fechaHoyBogota, haceNDiasBogota, haceNMesesBogota, inicioDiaBogota, finDiaBogota, inicioMesBogota, inicioMesAnteriorBogota, mesBogota, anioBogota, mesAnteriorBogota, anioMesAnteriorBogota, esDelMesBogota, fmtFechaHora, fmtFechaMedia, fmtHora } from '@/lib/fechas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DIAS } from '@/lib/constants'
import { withCache } from '@/lib/cache'

export async function GET() {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'vendedor') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const ahora = nowBogota()
  // CRÍTICO: usar fechaHoyBogota() — misma función que sync-ventas usa para invalidar
  // Si se usa toISOString() (UTC) y sync-ventas usa Bogotá → después de las 7pm
  // las keys no coinciden y el cache nunca se invalida
  const hoyStrKey = fechaHoyBogota()
  const cacheKey = `g:v:${user.id}:${hoyStrKey}`
  const result = await withCache(cacheKey, 600, async () => {
  const hoyStr = fechaHoyBogota()

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
  // Últimos 7 días + 6 meses como claves para el resumen
  const diasKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ahora); d.setDate(d.getDate() - i)
    return d.toISOString().split('T')[0]
  })
  const mesesKeys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  })

  const [
    resumenes,
    visitasAyer,
    ordenesHoy,
    ordenesMes,
    impulsadoras,
    pagosRecaudoMes,
    metaRecaudo,
    metaVentaRow,
  ] = await Promise.all([
    // Resúmenes precalculados — 7 días + 6 meses (13 filas max)
    (prisma as any).visitaResumen.findMany({
      where: {
        empleadoId: user.id,
        fecha: { in: [...diasKeys, ...mesesKeys] },
      },
    }),
    // Visitas de ayer — del resumen (se mantiene por compatibilidad de tipo)
    Promise.resolve([]),
    // Órdenes hoy — desp por fechaOrden, fact por fechaFactura
    miApiId
      ? (prisma as any).ordenDespacho.findMany({
          where: {
            vendedorApiId: miApiId,
            empresaId: user.empresaId,  // excluir copias 'vinculada' de otra empresa (mismo vendedorApiId)
            OR: [
              { fechaOrdenBogota: { gte: inicioDia, lt: finDia } },
              { fechaFactura: { gte: inicioDia, lt: finDia } },
            ]
          },
          select: { estado: true, numeroFactura: true, totalOrden: true, isFacturada: true, fechaFactura: true, fechaOrden: true },
        })
      : Promise.resolve([]),
    // Órdenes del mes — solo facturadas (isFacturada=true, equivale a isInvoiced en UpTres)
    miApiId
      ? (prisma as any).ordenDespacho.aggregate({
          where: {
            vendedorApiId: miApiId,
            empresaId: user.empresaId,  // excluir copias 'vinculada' de otra empresa (mismo vendedorApiId)
            fechaOrdenBogota: { gte: inicioMes, lt: finMes },
            isFacturada: true,
            isActiva: true,   // excluir órdenes canceladas en UpTres
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

  // ── Visitas hoy — desde resumen precalculado ──────────────────────
  const byFecha = Object.fromEntries((resumenes as any[]).map((r: any) => [`${r.granularidad}:${r.fecha}`, r]))
  const resHoy  = byFecha[`dia:${hoyStr}`]
  const resAyer = byFecha[`dia:${diasKeys[1]}`]

  const hoy = {
    total:       resHoy?.total       ?? 0,
    visitas:     resHoy?.visitas     ?? 0,
    ventas:      resHoy?.ventas      ?? 0,
    cobros:      resHoy?.cobros      ?? 0,
    entregas:    resHoy?.entregas    ?? 0,
    montoVentas: resHoy?.montoVentas ?? 0,
    montoCobros: resHoy?.montoCobros ?? 0,
    ayer:        resAyer?.total      ?? 0,
  }

  // ── Órdenes ───────────────────────────────────────────────────────
  const despHoy = (ordenesHoy as any[]).filter((o: any) =>
    ['despachado','entregado'].includes(o.estado)
  ).length
  const factHoy = (ordenesHoy as any[]).filter((o: any) => {
    if (!o.fechaFactura) return false
    const ff = new Date(o.fechaFactura)
    return ff >= inicioDia && ff < finDia
  }).length

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

  // ── Historial últimos 6 días — desde resumen ─────────────────────
  const dias = Array.from({ length: 6 }, (_, i) => {
    const dStr = diasKeys[5 - i]   // más antiguo → más reciente
    const r = byFecha[`dia:${dStr}`]
    return {
      fecha:       dStr,
      label:       new Date(dStr + 'T12:00:00Z').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }),
      total:       r?.total       ?? 0,
      montoVentas: r?.montoVentas ?? 0,
      montoCobros: r?.montoCobros ?? 0,
    }
  })

  // ── Historial últimos 6 meses — desde resumen ────────────────────
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(ahora.getFullYear(), ahora.getMonth() - (5 - i), 1)
    const key  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
    const r    = byFecha[`mes:${key}`]
    return {
      label:       d.toLocaleDateString('es-CO', { month: 'short' }).replace('.','') + ' ' + String(d.getFullYear()).slice(-2),
      total:       r?.total       ?? 0,
      montoVentas: r?.montoVentas ?? 0,
      montoCobros: r?.montoCobros ?? 0,
    }
  })

  // ── Impulsadoras ──────────────────────────────────────────────────
  // FIX 2026-06-20: antes era N+1 — 11 queries POR impulsadora (rutaFija,
  // visitas, turno, alertasGps + 7 días de rutasFijasDias). Con varias
  // impulsadoras escalaba mal (5 imp = 55 queries en un solo request).
  // Ahora: 4 queries en batch para TODAS las impulsadoras juntas, más el
  // cálculo de "próximo día con ruta" se hace en memoria sobre datos ya
  // traídos, sin queries adicionales por día de la semana.
  const impIds = impulsadoras.map(imp => imp.id)
  const diaSemana = ahora.getDay()

  const [rutasFijasHoy, visitasTodas, turnosActivos, alertasGpsTodas, todasLasRutasFijas] = impIds.length > 0
    ? await Promise.all([
        prisma.rutaFija.findMany({
          where: { diaSemana, empleados: { some: { empleadoId: { in: impIds } } } },
          include: { clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } }, empleados: { select: { empleadoId: true } } }
        }),
        prisma.visita.findMany({
          where: { empleadoId: { in: impIds } },
          take: 500 * impIds.length,
          orderBy: { fechaBogota: 'desc' }
        }),
        prisma.turno.findMany({ where: { empleadoId: { in: impIds }, activo: true } }),
        prisma.auditLog.findMany({
          where: { empleadoId: { in: impIds }, accion: 'GPS_FUERA_RANGO', createdAt: { gte: inicioDia, lt: finDia } },
          orderBy: { createdAt: 'desc' }
        }),
        // Todas las rutas fijas de cualquier día para estas impulsadoras —
        // permite calcular "próximo día con ruta" en memoria sin loop de queries
        prisma.rutaFija.findMany({
          where: { empleados: { some: { empleadoId: { in: impIds } } } },
          select: { diaSemana: true, empleados: { select: { empleadoId: true } } }
        }),
      ])
    : [[], [], [], [], []]

  const cumplimiento = impulsadoras.map((imp) => {
    const rutaFija = rutasFijasHoy.find((rf: any) => rf.empleados.some((e: any) => e.empleadoId === imp.id)) || null

    const visitasImp = visitasTodas.filter(v => v.empleadoId === imp.id)
    const visitasHoyImp = visitasImp.filter(v => {
      const fv = v.fechaBogota
        ? new Date(v.fechaBogota).toISOString().split('T')[0]
        : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      return fv === hoyStr && (v.tipo === 'entrada' || v.tipo === 'salida')
    })

    const totalPuntos = rutaFija?.clientes?.length || 0
    const clientesVisitados = new Set(visitasHoyImp.map(v => v.clienteId)).size
    const pct = totalPuntos > 0 ? Math.round((clientesVisitados / totalPuntos) * 100) : null
    const turnoActivo = turnosActivos.find((t: any) => t.empleadoId === imp.id) || null

    let puntoActual = null
    let proximoPunto = null
    const puntosCompletados: any[] = []
    // todosLosPuntos — TODOS los clientes del dia, en orden de ruta, con su estado individual.
    // No reemplaza puntoActual/proximoPunto (se mantienen igual para no romper nada existente),
    // es un campo nuevo para mostrar la lista completa en el dashboard.
    const todosLosPuntos: any[] = []
    if (rutaFija?.clientes) {
      for (const rc of rutaFija.clientes) {
        const entradas = visitasHoyImp.filter(v => v.rutaFijaClienteId === rc.id && v.tipo === 'entrada')
        const salidas  = visitasHoyImp.filter(v => v.rutaFijaClienteId === rc.id && v.tipo === 'salida')
        const base = { nombre: rc.cliente.nombre, nombreComercial: rc.cliente.nombreComercial, orden: rc.orden }
        if (entradas.length > 0 && salidas.length > 0) {
          const entrada = entradas.sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
          const salida  = salidas.sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
          puntosCompletados.push({
            ...base,
            horaEntrada: entrada.createdAt, horaSalida: salida.createdAt,
            // GPS de la visita real — siempre capturado en el registro, no depende de Cliente.lat/lng (puede faltar)
            lat: entrada.lat, lng: entrada.lng,
          })
          todosLosPuntos.push({ ...base, estado: 'completado', horaEntrada: entrada.createdAt, horaSalida: salida.createdAt })
        } else if (entradas.length > 0 && salidas.length === 0) {
          const entrada = entradas.sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
          if (!puntoActual) {
            puntoActual = { ...base, horaEntrada: entrada.createdAt, horaSalida: null, lat: entrada.lat, lng: entrada.lng }
          }
          todosLosPuntos.push({ ...base, estado: 'dentro', horaEntrada: entrada.createdAt, horaSalida: null })
        } else {
          // alertaHora: punto con horaEntrada planeada (RutaFijaCliente.horaEntrada, formato "HH:mm")
          // y ya pasó esa hora sin registrar entrada real — bug real detectado 23/06, antes solo
          // existía alerta global por % de venta del día, no por punto individual.
          let alertaHora = false
          if (rc.horaEntrada) {
            const ahoraBogStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })
            alertaHora = ahoraBogStr >= rc.horaEntrada
          }
          if (!puntoActual && !proximoPunto) {
            // Próximo punto aún no tiene visita registrada — usa coordenada del cliente como referencia (puede faltar)
            proximoPunto = { ...base, lat: rc.cliente.lat, lng: rc.cliente.lng, horaEntradaPlan: rc.horaEntrada || null, alertaHora }
          }
          todosLosPuntos.push({ ...base, estado: 'pendiente', horaEntrada: null, horaSalida: null, horaEntradaPlan: rc.horaEntrada || null, alertaHora })
        }
      }
    }

    const alertasGps = alertasGpsTodas.filter((a: any) => a.empleadoId === imp.id)

    const diasConRuta = new Set(
      todasLasRutasFijas
        .filter((rf: any) => rf.empleados.some((e: any) => e.empleadoId === imp.id))
        .map((rf: any) => rf.diaSemana)
    )
    const daysToCheck = Array.from({ length: 7 }, (_, i) => (diaSemana + i + 1) % 7)
    const firstDiaConRuta = daysToCheck.find(d => diasConRuta.has(d))
    const proximoDia = firstDiaConRuta !== undefined ? DIAS[firstDiaConRuta] : null

    return {
      id: imp.id, nombre: imp.nombre, turnoActivo: !!turnoActivo,
      totalPuntos, visitados: clientesVisitados, pct,
      alerta: pct !== null && pct < 50 && !turnoActivo,
      puntoActual, proximoPunto, puntosCompletados, todosLosPuntos,
      alertasGps: alertasGps.map((a: any) => ({ detalle: a.detalle, hora: a.createdAt })),
      proximoDia,
    }
  })

  return { hoy, ordenes, recaudo, dias, meses, cumplimiento, generadoEn: Date.now() } satisfies VendedorStats & { dias: any[], meses: any[], generadoEn: number }
  }) // withCache
  const res = NextResponse.json(result)
  res.headers.set('Cache-Control', 'private, no-store')
  res.headers.set('Surrogate-Control', 'no-store')
  return res
  } catch (err: any) {
    console.error('[vendedor/stats] ERROR:', err?.message, err?.stack?.slice(0,300))
    return NextResponse.json({ error: 'Error interno', detail: err?.message }, { status: 500 })
  }
}
