// Funciones puras UI-only del módulo Egresos

export function fmt(n: number | string) {
  const v = typeof n === 'string' ? parseFloat(n.replace(/\./g,'').replace(/[^0-9-]/g,'')) : n
  if (!v || isNaN(v)) return '$0'
  return '$' + Math.abs(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
export function formatCOP(raw: string): string {
  const n = parseInt(raw.replace(/\./g,'').replace(/[^0-9]/g,'') || '0')
  return isNaN(n) ? '' : new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}
export function parseCOP(val: string): string { return val.replace(/\./g,'').replace(/[^0-9]/g,'') }
export function fmtFecha(f: string | null | undefined) {
  if (!f) return ''
  return new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' })
}
