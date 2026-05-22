import { redis } from './redis'

/**
 * Lee de Redis si hay hit, si no ejecuta fn(), guarda y retorna.
 * Si Redis falla en cualquier punto → degradación elegante, va a Postgres.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  try {
    const hit = await redis.get(key)
    if (hit) return JSON.parse(hit) as T
  } catch {}

  const data = await fn()

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data))
  } catch {}

  return data
}

/**
 * Borra claves específicas (invalidación explícita).
 * Seguro: no lanza si Redis no responde.
 */
export async function invalidateKeys(...keys: string[]): Promise<void> {
  if (!keys.length) return
  try { await redis.del(...keys) } catch {}
}

/**
 * Borra todas las claves que coincidan con un patrón glob.
 * Ej: invalidatePattern('g:emp123:*')
 * Usar con moderación — escanea Redis.
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern)
    if (keys.length) await redis.del(...keys)
  } catch {}
}
