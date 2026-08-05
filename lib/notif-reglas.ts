import { prisma } from './prisma'
import { redis } from './redis'

const TTL = 300 // 5 min

export async function getRegla(id: string, empresaId: string): Promise<{ activa: boolean; roles: string[] }> {
  const cacheKey = `notif:${empresaId}:${id}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch {}

  const row = await prisma.notifRegla.findUnique({ where: { id_empresaId: { id, empresaId } } })
  // Sin fila en BD → empresa no configuró reglas → no notificar
  const result = row
    ? { activa: row.activa, roles: row.roles }
    : { activa: false, roles: [] }

  try {
    await redis.setex(cacheKey, TTL, JSON.stringify(result))
  } catch {}

  return result
}

export async function invalidarReglaCache(id: string, empresaId: string) {
  try { await redis.del(`notif:${empresaId}:${id}`) } catch {}
}
