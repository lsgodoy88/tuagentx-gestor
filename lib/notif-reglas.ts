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
  const result = row
    ? { activa: row.activa, roles: row.roles }
    : { activa: true, roles: defaultRoles(id) }

  try {
    await redis.setex(cacheKey, TTL, JSON.stringify(result))
  } catch {}

  return result
}

function defaultRoles(id: string): string[] {
  switch (id) {
    case 'despacho_guia':   return ['empresa', 'supervisor', 'bodega']
    case 'despacho_local':  return ['entregas']
    case 'impulso_entrada': return ['vendedor']
    default: return []
  }
}

export async function invalidarReglaCache(id: string, empresaId: string) {
  try { await redis.del(`notif:${empresaId}:${id}`) } catch {}
}
