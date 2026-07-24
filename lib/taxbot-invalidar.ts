import { redis } from '@/lib/redis'

/**
 * Invalida el contexto TaXBot de un vendedor/empleado.
 * Llamar después de cualquier mutación que afecte sus datos operativos.
 */
export async function invalidarContextoVendedor(empleadoId: string): Promise<void> {
  try {
    await redis.del(`taxbot:vendedor:${empleadoId}`)
  } catch {}
}

/**
 * Invalida el contexto TaXBot de una empresa completa.
 * Llamar después de mutaciones que afecten stats globales.
 */
export async function invalidarContextoEmpresa(empresaId: string): Promise<void> {
  try {
    await redis.del(`taxbot:${empresaId}:ctx`)
  } catch {}
}
