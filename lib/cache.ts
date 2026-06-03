import { redis } from './redis'

const LOCK_TTL_S  = 10    // lock máximo 10s — cubre queries lentas de Postgres
const LOCK_WAIT   = 150   // ms entre reintentos mientras hay lock
const LOCK_RETRIES = 6    // máximo 6 reintentos = 900ms espera total antes de ir a Postgres

/**
 * Lee de Redis si hay hit, si no ejecuta fn(), guarda y retorna.
 * Stampede protection: solo 1 request construye el valor, los demás esperan.
 * Si Redis falla en cualquier punto → degradación elegante, va a Postgres.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  // 1. Hit rápido — camino feliz
  try {
    const hit = await redis.get(key)
    if (hit) return JSON.parse(hit) as T
  } catch { return fn() } // Redis caído → Postgres directo

  const lockKey = `${key}:lock`

  // 2. Revisar si alguien ya está construyendo el valor
  try {
    for (let i = 0; i < LOCK_RETRIES; i++) {
      const locked = await redis.get(lockKey)
      if (!locked) break // nadie tiene el lock — seguimos

      // Hay lock activo — esperar y reintentar
      await new Promise(r => setTimeout(r, LOCK_WAIT))

      // Después de esperar, puede que ya esté listo
      const hit = await redis.get(key)
      if (hit) return JSON.parse(hit) as T
    }
  } catch {} // si Redis falla aquí, ignorar y construir igual

  // 3. Tomar el lock — SET NX para que solo 1 proceso lo tome
  let lockAcquired = false
  try {
    // SET key value NX EX ttl — atómico, solo 1 proceso gana
    const result = await redis.set(lockKey, '1', 'EX', LOCK_TTL_S, 'NX')
    lockAcquired = result === 'OK'
  } catch {}

  // 4. Construir el valor (con o sin lock — si Redis falló seguimos igual)
  const data = await fn()

  // 5. Guardar en caché y liberar lock
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data))
    if (lockAcquired) await redis.del(lockKey)
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
