/**
 * offlineCache — caché localStorage para datos críticos
 *
 * Uso:
 *   saveCache('mi-ruta', data)          // guardar
 *   loadCache<T>('mi-ruta')             // leer → { data, savedAt } | null
 *   cacheAge('mi-ruta')                 // minutos desde el guardado
 */

const PREFIX = 'txa_v2_'
const MAX_AGE_MS = 24 * 60 * 60 * 1000  // 24h — después se ignora

export interface CacheEntry<T> {
  data: T
  savedAt: number   // Date.now()
}

export function saveCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, savedAt: Date.now() }
    localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // localStorage lleno o no disponible — ignorar silencioso
  }
}

export function loadCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.savedAt > MAX_AGE_MS) return null
    return entry
  } catch {
    return null
  }
}

export function cacheAge(key: string): number | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    return Math.floor((Date.now() - entry.savedAt) / 60_000)
  } catch {
    return null
  }
}

export function clearCache(key: string): void {
  try { localStorage.removeItem(PREFIX + key) } catch {}
}

/**
 * Limpia TODAS las entradas de offlineCache (cualquier módulo, cualquier
 * clave). Usado cuando se detecta cambio de usuario en el mismo navegador
 * — evita que el usuario nuevo vea instantáneamente datos cacheados del
 * usuario anterior (stale-while-revalidate antes del primer refresh real).
 * No borra otras claves de localStorage no relacionadas con offlineCache
 * (ej. colorFondo_*), solo las que llevan el PREFIX de este módulo.
 */
export function clearAllCache(): void {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX))
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    // localStorage no disponible — ignorar silencioso
  }
}
