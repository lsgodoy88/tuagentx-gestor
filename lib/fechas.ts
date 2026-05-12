/**
 * Helpers de fechas — todo en zona horaria Bogotá (UTC-5).
 * Centralizado para evitar el cálculo manual `Date.now() - 5*60*60*1000`.
 */

const UTC_OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000

/** Date actual en zona Bogotá (resta 5h del UTC) */
export function nowBogota(): Date {
  return new Date(Date.now() - UTC_OFFSET_BOGOTA_MS)
}

/** Fecha actual como string YYYY-MM-DD en zona Bogotá */
export function fechaHoyBogota(): string {
  return nowBogota().toISOString().split('T')[0]
}

/** Convertir un Date a string YYYY-MM-DD en zona Bogotá */
export function fechaBogotaStr(d: Date): string {
  return new Date(d.getTime() - UTC_OFFSET_BOGOTA_MS).toISOString().split('T')[0]
}

/** Formato dd/MM/yy en zona Bogotá */
export function fmtFechaCorta(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const bog = new Date(date.getTime() - UTC_OFFSET_BOGOTA_MS)
  const dd = String(bog.getUTCDate()).padStart(2, '0')
  const mm = String(bog.getUTCMonth() + 1).padStart(2, '0')
  const yy = String(bog.getUTCFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

/** Rango de un mes (YYYY-MM) en UTC, ajustado a Bogotá */
export function rangoMesBogota(mes: string): { desde: Date, hasta: Date } {
  const [y, m] = mes.split('-').map(Number)
  // Día 1 mes a 00:00 Bogotá = 05:00 UTC
  const desde = new Date(Date.UTC(y, m - 1, 1, 5, 0, 0))
  const hasta = new Date(Date.UTC(y, m, 1, 5, 0, 0))
  return { desde, hasta }
}
