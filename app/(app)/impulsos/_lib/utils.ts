import { DIAS } from '@/lib/constants'

// Convierte "HH:mm" (24h) a {hora12, minuto, meridiano} para UI
// NUNCA usar new Date(Date.now() - 5h).getDay() — .getDay() interpreta con el TZ del
// entorno, y si el dispositivo ya está en hora Bogotá nativa, esa resta sobre-corrige
// y retrocede un día entero (bug real detectado 24/06).
export function de24aPartes12(hhmm: string): { hora: string; minuto: string; meridiano: 'AM' | 'PM' } {
  if (!hhmm) return { hora: '', minuto: '', meridiano: 'AM' }
  const [h, m] = hhmm.split(':').map(Number)
  const meridiano: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM'
  let hora12 = h % 12
  if (hora12 === 0) hora12 = 12
  return { hora: String(hora12), minuto: String(m).padStart(2, '0'), meridiano }
}

// Formatea "HH:mm" (24h) a texto legible 12h con AM/PM, ej. "9:00 AM"
export function fmtHora12(hhmm: string): string {
  if (!hhmm) return ''
  const p = de24aPartes12(hhmm)
  return `${p.hora}:${p.minuto} ${p.meridiano}`
}

// Convierte hora12 (1-12) + minuto + meridiano a "HH:mm" 24h para guardar
export function partes12a24(hora12: string, minuto: string, meridiano: 'AM' | 'PM'): string {
  let h = parseInt(hora12, 10)
  if (isNaN(h) || h < 1 || h > 12) return ''
  const m = parseInt(minuto, 10) || 0
  if (meridiano === 'AM') { if (h === 12) h = 0 } else { if (h !== 12) h += 12 }
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

export function diaSemanaHoyBogota(): number {
  const nombreDia = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Bogota' })
  const idx = DIAS.findIndex(d =>
    d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
    ({ Sunday: 'domingo', Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miercoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sabado' } as any)[nombreDia]
  )
  return idx >= 0 ? idx : new Date().getDay()
}
