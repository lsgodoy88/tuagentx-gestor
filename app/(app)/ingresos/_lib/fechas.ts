/**
 * TuAgentX — Helpers de fecha UI para módulo Ingresos
 * Scope: navegador día/semana/mes de la página de saldos
 */

export const VISTAS = ['Día', 'Semana', 'Mes'] as const
export type Vista = typeof VISTAS[number]

export function fechaHoy(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

export function fmtFecha(f: string): string {
  return f
    ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '--/--/--'
}

export function fmtFechaCorta(f: string): string {
  if (!f) return ''
  const d = new Date(f + 'T12:00:00')
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
}

export function fmtFechaLarga(f: string): string {
  return f
    ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      })
    : ''
}

export function inicioSemana(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() - d.getDay())
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

export function finSemana(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() + (6 - d.getDay()))
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

export function inicioMes(fecha: string): string {
  return fecha.slice(0, 7) + '-01'
}

export function finMes(fecha: string): string {
  const [y, m] = fecha.split('-').map(Number)
  return new Date(y, m, 0).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

export function labelNavegador(vista: Vista, fecha: string): string {
  if (vista === 'Día') return fmtFecha(fecha)
  if (vista === 'Semana') {
    const ini = inicioSemana(fecha)
    const fin = finSemana(fecha)
    return `${fmtFecha(ini)} – ${fmtFecha(fin)}`
  }
  const [y, m] = fecha.split('-').map(Number)
  const nombre = new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

export function moverFecha(fecha: string, vista: Vista, delta: number): string {
  const d = new Date(fecha + 'T12:00:00')
  if (vista === 'Día')    d.setDate(d.getDate() + delta)
  if (vista === 'Semana') d.setDate(d.getDate() + delta * 7)
  if (vista === 'Mes')    d.setMonth(d.getMonth() + delta)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
