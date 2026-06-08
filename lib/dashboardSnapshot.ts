/**
 * dashboardSnapshot — persiste el último estado del dashboard en localStorage
 * Se muestra inmediatamente en el primer render, antes de que llegue la sesión
 */

const KEY = 'txa_v2_dash_snap'
const MAX_AGE = 12 * 60 * 60 * 1000 // 12 horas

export interface DashboardSnapshot {
  statsVendedor: any
  resumenCartera: any
  turno: any
  ts: number
}

export function saveSnapshot(data: Partial<DashboardSnapshot>) {
  try {
    const prev = loadSnapshot() || {}
    localStorage.setItem(KEY, JSON.stringify({ ...prev, ...data, ts: Date.now() }))
  } catch {}
}

export function loadSnapshot(): DashboardSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (Date.now() - (d.ts || 0) > MAX_AGE) { localStorage.removeItem(KEY); return null }
    return d
  } catch { return null }
}
