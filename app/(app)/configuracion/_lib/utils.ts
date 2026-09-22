// utils UI-only — configuracion
import type { TemaPreset } from './tipos'

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function buildGradient(h: number, s: number, l: number): string {
  const d1 = hslToHex(h, s, l)
  const d2 = hslToHex(h, Math.max(20, s - 12), l + 7)
  const m1 = hslToHex(h, Math.max(20, s - 15), l + 17)
  const m2 = hslToHex(h, Math.max(20, s - 18), l + 21)
  const d3 = hslToHex(h, Math.max(20, s - 10), l + 8)
  return `linear-gradient(160deg, ${d1} 0%, ${d2} 12%, ${m1} 30%, ${m2} 48%, ${d3} 65%, ${d1} 82%, ${d2} 100%)`
}

export const TEMA_PRESETS: TemaPreset[] = [
  { hue: 225, sat: 72, lit: 11, label: 'Noche azul' },
  { hue: 240, sat: 60, lit: 10, label: 'Índigo' },
  { hue: 270, sat: 55, lit: 10, label: 'Violeta' },
  { hue: 210, sat: 65, lit: 12, label: 'Océano' },
  { hue: 160, sat: 60, lit: 10, label: 'Esmeralda' },
  { hue: 195, sat: 65, lit: 11, label: 'Cyan' },
  { hue: 10,  sat: 55, lit: 10, label: 'Rojo oscuro' },
  { hue: 280, sat: 50, lit: 11, label: 'Púrpura' },
]

export const inputClass = 'w-full modal-inner-card rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500'
export const inputReadonlyClass = 'w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-zinc-400 text-sm'
export const labelClass = 'text-zinc-400 text-xs font-semibold block mb-1.5'
export const anchoBtns: { v: string; l: string }[] = [{ v: '80mm', l: '🖨️ 80mm' }, { v: '58mm', l: '🖨️ 58mm' }]

export function truncarEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 0 || at <= 10) return email
  return email.slice(0, 10) + '...' + email.slice(at)
}
