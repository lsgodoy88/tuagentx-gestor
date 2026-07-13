// lib/ordenes-cache.ts — cache sessionStorage para ModuloOrdenes
const TTL = 3 * 60 * 1000 // 3 minutos

function key(origenId: string) {
  return 'ordenes_cache_' + (origenId || 'propia')
}

export function getOrdenesCache(origenId: string) {
  try {
    const raw = sessionStorage.getItem(key(origenId))
    if (!raw) return null
    const d = JSON.parse(raw)
    if (Date.now() - d.ts > TTL) { sessionStorage.removeItem(key(origenId)); return null }
    return d
  } catch { return null }
}

export function setOrdenesCache(origenId: string, data: any) {
  try { sessionStorage.setItem(key(origenId), JSON.stringify({ ...data, ts: Date.now() })) } catch {}
}

export function clearOrdenesCache(origenId: string) {
  try { sessionStorage.removeItem(key(origenId)) } catch {}
}
