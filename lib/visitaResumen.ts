import { prisma } from '@/lib/prisma'
import { fechaHoyBogota } from '@/lib/fechas'

// ── Tipos ─────────────────────────────────────────────────────────────────
type TipoVisita = 'visita' | 'venta' | 'cobro' | 'entrega' | string

interface DeltaVisita {
  tipo:        TipoVisita
  monto?:      number | null
  descuento?:  number | null
}

// ── Helpers de fecha ──────────────────────────────────────────────────────

/** "2026-06-07" → "2026-06-01" (primer día del mes) */
function primerDiaMes(fechaDia: string): string {
  return fechaDia.slice(0, 7) + '-01'
}

// ── Función principal ─────────────────────────────────────────────────────

/**
 * Actualiza VisitaResumen para un empleado en una fecha dada.
 * Llama desde los endpoints que crean visitas — /api/visitas, /api/impulso, /api/cartera/pago-sync.
 * 
 * Usa upsert con increment — atómico y sin race condition.
 * Si falla, NO lanza — la visita ya se guardó, el resumen se recalculará en backfill nocturno.
 */
export async function actualizarResumenVisita(
  empleadoId: string,
  delta: DeltaVisita,
  fechaBogota?: string | null,
): Promise<void> {
  try {
    const fecha = fechaBogota ?? fechaHoyBogota()
    const mes   = primerDiaMes(fecha)

    const esVenta   = delta.tipo === 'venta'
    const esCobro   = delta.tipo === 'cobro'
    const esEntrega = delta.tipo === 'entrega'
    const esVisita  = delta.tipo === 'visita'
    const monto     = Number(delta.monto    ?? 0)
    const descuento = Number(delta.descuento ?? 0)

    const incrementDia = {
      total:            1,
      visitas:          esVisita   ? 1 : 0,
      ventas:           esVenta    ? 1 : 0,
      cobros:           esCobro    ? 1 : 0,
      entregas:         esEntrega  ? 1 : 0,
      montoVentas:      esVenta ? monto : 0,
      montoCobros:      esCobro ? monto : 0,
      monto_descuentos: esCobro ? descuento : 0,
    }

    // Día y mes en paralelo — ambos son atómicos con increment
    await Promise.all([
      (prisma as any).visitaResumen.upsert({
        where:  { empleadoId_granularidad_fecha: { empleadoId, granularidad: 'dia', fecha } },
        create: { empleadoId, granularidad: 'dia', fecha, ...incrementDia },
        update: {
          total:       { increment: 1 },
          visitas:     { increment: esVisita   ? 1 : 0 },
          ventas:      { increment: esVenta    ? 1 : 0 },
          cobros:      { increment: esCobro    ? 1 : 0 },
          entregas:    { increment: esEntrega  ? 1 : 0 },
          montoVentas:      { increment: esVenta ? monto : 0 },
          montoCobros:      { increment: esCobro ? monto : 0 },
          monto_descuentos: { increment: esCobro ? descuento : 0 },
        },
      }),
      (prisma as any).visitaResumen.upsert({
        where:  { empleadoId_granularidad_fecha: { empleadoId, granularidad: 'mes', fecha: mes } },
        create: { empleadoId, granularidad: 'mes', fecha: mes, ...incrementDia },
        update: {
          total:       { increment: 1 },
          visitas:     { increment: esVisita   ? 1 : 0 },
          ventas:      { increment: esVenta    ? 1 : 0 },
          cobros:      { increment: esCobro    ? 1 : 0 },
          entregas:    { increment: esEntrega  ? 1 : 0 },
          montoVentas:      { increment: esVenta ? monto : 0 },
          montoCobros:      { increment: esCobro ? monto : 0 },
          monto_descuentos: { increment: esCobro ? descuento : 0 },
        },
      }),
    ])
  } catch (err: any) {
    // No propagar — la visita ya se guardó, esto es best-effort
    console.warn('[visitaResumen] upsert falló (no crítico):', err?.message)
  }
}

/**
 * Recalcula el resumen desde cero para un empleado y fecha.
 * Útil para backfill y correcciones.
 */
export async function recalcularResumenDia(
  empleadoId: string,
  fecha: string,   // "2026-06-07"
): Promise<void> {
  const desde = new Date(fecha + 'T05:00:00.000Z')
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000)

  const visitas = await prisma.visita.findMany({
    where: { empleadoId, createdAt: { gte: desde, lt: hasta } },
    select: { tipo: true, monto: true },
  })

  const agg = visitas.reduce((a, v) => {
    a.total++
    if (v.tipo === 'visita')  a.visitas++
    if (v.tipo === 'venta')   { a.ventas++;   a.montoVentas += Number(v.monto ?? 0) }
    if (v.tipo === 'cobro')   { a.cobros++;   a.montoCobros += Number(v.monto ?? 0) }
    if (v.tipo === 'entrega') a.entregas++
    return a
  }, { total: 0, visitas: 0, ventas: 0, cobros: 0, entregas: 0, montoVentas: 0, montoCobros: 0 })

  await (prisma as any).visitaResumen.upsert({
    where:  { empleadoId_granularidad_fecha: { empleadoId, granularidad: 'dia', fecha } },
    create: { empleadoId, granularidad: 'dia', fecha, ...agg },
    update: agg,
  })
}

export async function recalcularResumenMes(
  empleadoId: string,
  mes: string,   // "2026-06-01"
): Promise<void> {
  const [anio, mm] = mes.slice(0, 7).split('-').map(Number)
  const desde = new Date(`${mes}T05:00:00.000Z`)
  const hasta = new Date(desde)
  hasta.setMonth(hasta.getMonth() + 1)

  const [visitas, pagos] = await Promise.all([
    prisma.visita.findMany({
      where: { empleadoId, createdAt: { gte: desde, lt: hasta } },
      select: { tipo: true, monto: true },
    }),
    (prisma as any).pagoCartera.aggregate({
      where: { empleadoId, createdAt: { gte: desde, lt: hasta } },
      _sum: { descuento: true },
    }),
  ])

  const agg = visitas.reduce((a, v) => {
    a.total++
    if (v.tipo === 'visita')  a.visitas++
    if (v.tipo === 'venta')   { a.ventas++;   a.montoVentas += Number(v.monto ?? 0) }
    if (v.tipo === 'cobro')   { a.cobros++;   a.montoCobros += Number(v.monto ?? 0) }
    if (v.tipo === 'entrega') a.entregas++
    return a
  }, { total: 0, visitas: 0, ventas: 0, cobros: 0, entregas: 0, montoVentas: 0, montoCobros: 0, monto_descuentos: 0 })

  agg.monto_descuentos = Number((pagos as any)._sum.descuento ?? 0)

  await (prisma as any).visitaResumen.upsert({
    where:  { empleadoId_granularidad_fecha: { empleadoId, granularidad: 'mes', fecha: mes } },
    create: { empleadoId, granularidad: 'mes', fecha: mes, ...agg },
    update: agg,
  })
}
