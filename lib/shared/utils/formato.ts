/**
 * TuAgentX — Helpers de formato monetario COP
 * Reutilizables cross-dominio (UI + server)
 */

/** Formatea número como $X.XXX (valor absoluto) */
export function fmt(n: number): string {
  return '$' + Math.abs(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/** Formatea string numérico a formato COP con puntos: "1500000" → "1.500.000" */
export function formatCOP(raw: string): string {
  const n = parseFloat(raw.replace(/\./g, '').replace(/[^0-9]/g, ''))
  if (!raw || isNaN(n) || n === 0) return ''
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

/** Limpia string COP a dígitos puros: "1.500.000" → "1500000" */
export function parseCOP(val: string): string {
  return val.replace(/\./g, '').replace(/[^0-9]/g, '')
}

/** Parsea string numérico a number (soporta puntos de miles y coma decimal) */
export function parseNum(v: string): number {
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
