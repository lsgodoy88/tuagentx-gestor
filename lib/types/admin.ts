/**
 * Tipos compartidos del dashboard Admin/Supervisor
 *
 * Guardián: si renombras vendedoresActivos, totalVendedores, etc.
 * TypeScript falla en stats/route.ts y en inicio/page.tsx.
 */

// ── Cards KPI ─────────────────────────────────────────────────────

export interface AdminStatsKpi {
  /** Vendedores con turno activo ahora */
  vendedoresActivos: number
  /** Total vendedores activos en la empresa */
  totalVendedores: number
  /** Impulsadoras con ruta activa hoy */
  impulsosActivos: number
  /** Total impulsadoras activas */
  totalImpulsos: number
  /** Órdenes en entrega o entregadas hoy */
  ordenesDespachadasHoy: number
  /** Órdenes creadas hoy (con o sin factura) */
  ordenesFact: number
  /** Recaudo cobrado hoy */
  recaudoHoy: number
  /** Recaudo cobrado en el mes */
  recaudoMes: number
}

// ── Empleados y actividad ─────────────────────────────────────────

export interface AdminStatsEmpleado {
  nombre: string
  ventas: number
  monto: number
}

export interface AdminStatsVisitaDia {
  dia: string
  cantidad: number
}

// ── Tablas de actividad ───────────────────────────────────────────

/** Fila de la tabla 7 días por vendedor — estructura dinámica */
export type AdminStatsTabla7Dias = Record<string, number | string>
/** Fila de la tabla 7 meses por vendedor — estructura dinámica */
export type AdminStatsTabla7Meses = Record<string, number | string>

// ── Respuesta completa de /api/stats ─────────────────────────────

export interface AdminStats extends AdminStatsKpi {
  /** Total empleados activos */
  empleados: number
  /** Total clientes */
  clientes: number
  /** Empleados con turno activo */
  enTurno: number
  /** Visitas registradas hoy */
  visitasHoy: number
  visitasHoyTotal: number
  /** Monto ventas hoy */
  ventasHoy: number
  /** Monto ventas últimos 30 días */
  ventasMes: number
  /** Monto cobros últimos 30 días */
  cobrosMes: number
  /** Rutas abiertas ahora */
  rutasActivas: number
  /** Visitas por tipo: visita, venta, cobro, entrega */
  porTipo: Record<string, number>
  /** Top 5 vendedores por monto */
  topEmpleados: AdminStatsEmpleado[]
  /** Visitas últimos 7 días */
  visitasPorDia: AdminStatsVisitaDia[]
  /** Tabla 7 días × vendedor */
  tabla7dias: AdminStatsTabla7Dias[]
  /** Nombres de vendedores en tabla7dias */
  vendedores7: string[]
  /** Tabla 7 meses × vendedor */
  tabla7meses: AdminStatsTabla7Meses[]
  /** Nombres de vendedores en tabla7meses */
  vendedores7m: string[]
}
