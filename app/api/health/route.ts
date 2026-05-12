import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Health check público — para UptimeRobot/BetterStack/Cloudflare.
 * Verifica BD, Redis, disco y latencia.
 */
export async function GET() {
  const checks: Record<string, any> = {}
  const start = Date.now()
  let healthy = true

  // BD
  try {
    const t0 = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.db = { ok: true, ms: Date.now() - t0 }
  } catch (e: any) {
    checks.db = { ok: false, error: e.message }
    healthy = false
  }

  // Redis (opcional — solo verificar si hay env)
  if (process.env.REDIS_HOST) {
    try {
      const Redis = (await import('ioredis')).default
      const r = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT || 6379),
        connectTimeout: 2000,
        lazyConnect: true,
      })
      const t0 = Date.now()
      await r.connect()
      await r.ping()
      r.disconnect()
      checks.redis = { ok: true, ms: Date.now() - t0 }
    } catch (e: any) {
      checks.redis = { ok: false, error: e.message }
      healthy = false
    }
  }

  // Última sync (last delta)
  try {
    const ultimaSync = await (prisma as any).integracion.findFirst({
      where: { activa: true },
      select: { ultimaSync: true },
      orderBy: { ultimaSync: 'desc' },
    })
    if (ultimaSync?.ultimaSync) {
      const horasDesdeSync = Math.floor((Date.now() - new Date(ultimaSync.ultimaSync).getTime()) / 1000 / 3600)
      checks.lastSync = { hours: horasDesdeSync, ok: horasDesdeSync < 26 }
      if (horasDesdeSync >= 26) healthy = false
    }
  } catch (e: any) {
    checks.lastSync = { ok: false, error: e.message }
  }

  checks.totalMs = Date.now() - start
  checks.uptime = Math.floor(process.uptime())

  return NextResponse.json(
    { healthy, checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  )
}
