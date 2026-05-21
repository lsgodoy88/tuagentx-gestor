/**
 * TuAgentX — Helpers de fechas Bogotá (UTC-5)
 * ─────────────────────────────────────────────
 * REGLA: TODA fecha/hora del sistema pasa por aquí.
 * Nunca usar `new Date()` directo para filtros o display.
 * Usar `nowBogota()` como punto de entrada universal.
 *
 * UTC offset Colombia: UTC-5 (sin cambio de horario).
 */

export const UTC_OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000
const TZ = 'America/Bogota'

// ── Constructores ────────────────────────────────────────────────

/** Ahora en Bogotá */
export function nowBogota(): Date {
  return new Date(Date.now() - UTC_OFFSET_BOGOTA_MS)
}

/** Hace N días desde ahora en Bogotá */
export function haceNDiasBogota(n: number): Date {
  return new Date(Date.now() - UTC_OFFSET_BOGOTA_MS - n * 24 * 60 * 60 * 1000)
}

/** Hace N meses desde ahora en Bogotá */
export function haceNMesesBogota(n: number): Date {
  const d = nowBogota()
  d.setMonth(d.getMonth() - n)
  return d
}

/** Inicio del día actual en Bogotá (00:00:00 Bogotá = 05:00:00 UTC) */
export function inicioDiaBogota(d?: Date): Date {
  const base = d ?? nowBogota()
  // Tomar la parte de fecha en Bogotá y construir 00:00 Bogotá = 05:00 UTC
  const ymd = base.toISOString().split('T')[0]
  return new Date(ymd + 'T05:00:00.000Z')
}

/** Fin del día actual en Bogotá (23:59:59 Bogotá = 04:59:59 UTC día siguiente) */
export function finDiaBogota(d?: Date): Date {
  const base = d ?? nowBogota()
  const ymd = base.toISOString().split('T')[0]
  const ini = new Date(ymd + 'T05:00:00.000Z')
  return new Date(ini.getTime() + 24 * 60 * 60 * 1000)
}

/** Inicio del mes actual en Bogotá */
export function inicioMesBogota(d?: Date): Date {
  const base = d ?? nowBogota()
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth()
  return new Date(Date.UTC(y, m, 1, 5, 0, 0))
}

/** Inicio del mes anterior en Bogotá */
export function inicioMesAnteriorBogota(): Date {
  const d = nowBogota()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() // getUTCMonth ya es el mes actual (0-based)
  // mes anterior
  return m === 0
    ? new Date(Date.UTC(y - 1, 11, 1, 5, 0, 0))
    : new Date(Date.UTC(y, m - 1, 1, 5, 0, 0))
}

// ── Getters de componentes ───────────────────────────────────────

/** Mes actual en Bogotá (1-12) */
export function mesBogota(): number {
  return nowBogota().getUTCMonth() + 1
}

/** Año actual en Bogotá */
export function anioBogota(): number {
  return nowBogota().getUTCFullYear()
}

/** Mes anterior en Bogotá (1-12) */
export function mesAnteriorBogota(): number {
  const m = mesBogota()
  return m === 1 ? 12 : m - 1
}

/** Año del mes anterior en Bogotá */
export function anioMesAnteriorBogota(): number {
  const m = mesBogota()
  return m === 1 ? anioBogota() - 1 : anioBogota()
}

// ── Formateo ─────────────────────────────────────────────────────

/** Fecha como string YYYY-MM-DD en Bogotá */
export function fechaHoyBogota(): string {
  return nowBogota().toISOString().split('T')[0]
}

/** Convierte cualquier Date a YYYY-MM-DD en Bogotá */
export function fechaBogotaStr(d: Date): string {
  return new Date(d.getTime() - UTC_OFFSET_BOGOTA_MS).toISOString().split('T')[0]
}

/** dd/MM/yy en Bogotá */
export function fmtFechaCorta(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const bog = new Date(date.getTime() - UTC_OFFSET_BOGOTA_MS)
  return [
    String(bog.getUTCDate()).padStart(2, '0'),
    String(bog.getUTCMonth() + 1).padStart(2, '0'),
    String(bog.getUTCFullYear()).slice(-2),
  ].join('/')
}

/** dd/MM/yyyy HH:mm en Bogotá */
export function fmtFechaHora(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: TZ,
  })
}

/** "12 may" o "12 may 2025" en Bogotá */
export function fmtFechaMedia(d: Date | string, conAnio = false): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric', month: 'short', timeZone: TZ,
    ...(conAnio ? { year: 'numeric' } : {}),
  }
  return date.toLocaleDateString('es-CO', opts)
}

/** HH:mm en Bogotá */
export function fmtHora(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  })
}

// ── Rango de mes ────────────────────────────────────────────────

/** Rango de un mes YYYY-MM ajustado a Bogotá */
export function rangoMesBogota(mes: string): { desde: Date; hasta: Date } {
  const [y, m] = mes.split('-').map(Number)
  return {
    desde: new Date(Date.UTC(y, m - 1, 1, 5, 0, 0)),
    hasta: new Date(Date.UTC(y, m,     1, 5, 0, 0)),
  }
}

// ── Comparación ─────────────────────────────────────────────────

/** ¿Un Date pertenece al mes/año dado, en hora Bogotá? */
export function esDelMesBogota(d: Date | string, mes: number, anio: number): boolean {
  const date = typeof d === 'string' ? new Date(d) : d
  const bog = new Date(date.getTime() - UTC_OFFSET_BOGOTA_MS)
  return bog.getUTCMonth() + 1 === mes && bog.getUTCFullYear() === anio
}
