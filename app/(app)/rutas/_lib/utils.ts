import { DIAS } from '@/lib/constants'

// Fecha de hoy en Bogotá vía timeZone explícito — correcto sin importar el TZ
// del navegador/dispositivo (bug real: restar 5h manualmente sobre-corrige si el
// dispositivo ya interpreta Date en hora Bogotá nativa, detectado 24/06).
export function hoySufijo() {
  const partes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) // "YYYY-MM-DD"
  const [yyyy, mm, dd] = partes.split('-')
  return `${dd}-${mm}-${yyyy}`
}

export function esDeHoy(ruta: any) {
  if (!ruta.fecha) return false
  const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
  return ruta.fecha.split('T')[0] === hoy
}


export function fmtHoraBogota(ts: string | null) {
  if (!ts) return null
  try { return new Date(ts).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'America/Bogota' }) } catch { return null }
}
export function fmtFechaBogota(ts: string | null) {
  if (!ts) return null
  try { return new Date(ts).toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric', timeZone:'America/Bogota' }) } catch { return null }
}
export function nombreFechaLargo(f: string) {
  const d = new Date(f.split('T')[0] + 'T12:00:00')
  return d.toLocaleDateString('es-CO', { day:'numeric', month:'long', year:'numeric' })
}

export function nombreFecha(f: string) {
  if (!f) return ''
  const fStr = typeof f === 'string' ? f.split('T')[0] : new Date(f).toISOString().split('T')[0]
  const d = new Date(fStr + 'T12:00:00')
  const dia = DIAS[d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return dia + ' ' + dd + '-' + mm + '-' + yy
}

export function nombreAuto(emp: any, f: string) {
  if (!emp || !f) return ''
  const d = new Date(f + 'T12:00:00')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return emp.nombre + '-' + dd + '-' + mm + '-' + yyyy
}
