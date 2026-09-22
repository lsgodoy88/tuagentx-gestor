import { nowBogota } from '@/lib/fechas'

export function iconoTransprensa(estado: string): string {
  const e = (estado || '').toUpperCase()
  if (e.includes('ENTREGADO'))       return '🟢'
  if (e.includes('DISTRIBUCION'))    return '🔵'
  if (e.includes('EN BODEGA DESTINO')) return '🟡'
  if (e.includes('NOVEDAD'))         return '🔴'
  return '🚛'
}

export function formatHora(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${m}${ampm}`
}

export function nombreCorto(n: string) {
  const parts = n.trim().split(' ')
  const result = parts.slice(0, 3).join(' ')
  return result.length > 22 ? result.slice(0, 22) + '…' : result
}

export function formatFechaCorta(iso: string | null | undefined | Date) {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yy = String(d.getUTCFullYear()).slice(2)
  const h = d.getUTCHours() % 12 || 12
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  const ampm = d.getUTCHours() >= 12 ? 'pm' : 'am'
  return `${dd}/${mm}/${yy} ${h}:${min}${ampm}`
}

export function isHoy(iso: string | null | undefined) {
  if (!iso) return false
  const d = new Date(iso)
  const hoy = nowBogota()
  return (
    d.getFullYear() === hoy.getFullYear() &&
    d.getMonth() === hoy.getMonth() &&
    d.getDate() === hoy.getDate()
  )
}

export function tiempoDesdeSync(iso: string | null | undefined): { texto: string; alerta: boolean } {
  if (!iso) return { texto: 'Nunca', alerta: true }
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return { texto: 'Ahora', alerta: false }
  if (mins < 60) return { texto: `${mins}min`, alerta: mins > 30 }
  const h = Math.floor(mins / 60)
  return { texto: `${h}h`, alerta: h >= 2 }
}
