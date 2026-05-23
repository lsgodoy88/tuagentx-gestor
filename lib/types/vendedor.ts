/**
 * Tipos compartidos del módulo Vendedor
 * 
 * Guardián: si renombras cualquier propiedad aquí, TypeScript
 * fallará en stats/route.ts Y en inicio/page.tsx al mismo tiempo.
 * El build bloquea el deploy automáticamente.
 */

// ── Respuesta de /api/vendedor/stats ─────────────────────────────

export interface VendedorStatsOrdenes {
  /** Órdenes despachadas o entregadas HOY (por fechaOrden) */
  despHoy: number
  /** Órdenes facturadas HOY según invoicedAt de UpTres (por fechaFactura) */
  factHoy: number
  /** Cantidad de órdenes facturadas en el mes */
  ventasMes: number
  /** Monto total de órdenes con isFacturada=true en el mes */
  montoMes: number
  /** Meta de ventas del mes en pesos */
  metaVentaMes: number
}

export interface VendedorStatsVisitas {
  /** Total visitas registradas hoy */
  total: number
  /** Total visitas de ayer */
  ayer: number
  ventas: number
  cobros: number
  entregas: number
  montoVentas: number
  montoCobros: number
}

export interface VendedorStatsCumplimientoAlerta {
  detalle: string | null
  hora: string | Date
}

export interface VendedorStatsCumplimiento {
  id: string
  nombre: string
  turnoActivo: boolean
  totalPuntos: number
  visitados: number
  pct: number | null
  alerta: boolean
  puntoActual: { nombre: string; nombreComercial: string | null; orden: number } | null
  proximoPunto: { nombre: string; nombreComercial: string | null; orden: number } | null
  alertasGps: VendedorStatsCumplimientoAlerta[]
  proximoDia: string | null
}

export interface VendedorStatsRecaudo {
  /** Recaudo del mes actual */
  mes: number
  /** Descuentos aplicados en el mes */
  descuentosMes: number
  /** Cantidad de pagos en el mes */
  pagosCount: number
  /** Meta de recaudo del mes */
  meta: number
}

export interface VendedorStatsDia {
  fecha: string
  label: string
  total: number
  montoVentas: number
  montoCobros: number
}

export interface VendedorStatsMes {
  /** Ej: "may 26" */
  label: string
  total: number
  montoVentas: number
  montoCobros: number
}

export interface VendedorStats {
  hoy: VendedorStatsVisitas
  ordenes: VendedorStatsOrdenes
  recaudo: VendedorStatsRecaudo
  cumplimiento: VendedorStatsCumplimiento[]
  dias: VendedorStatsDia[]
  meses: VendedorStatsMes[]
}

// ── Respuesta de /api/vendedor/ventas-live ────────────────────────

export interface VentasLiveResult {
  ok: boolean
  /** Monto total de órdenes facturadas en el mes, directo de UpTres */
  montoMes: number
  /** Cantidad de órdenes facturadas en el mes */
  ordenes: number
  mes: number
  anio: number
  fuente: 'uptres-live'
}

// ── Turno activo ──────────────────────────────────────────────────

export interface TurnoActivo {
  id: string
  inicio: string
  pausado: boolean
  pausaInicio: string | null
  pausaMotivo: string | null
  pausaDuracionMin: number | null
  latInicio: number | null
  lngInicio: number | null
  activo: boolean
}
