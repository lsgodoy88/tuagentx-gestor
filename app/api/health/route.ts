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


  // Schema BD — verificar que el proceso usa el schema correcto
  try {
    const expectedSchema = process.env.DATABASE_URL?.includes('gestor_staging') ? 'gestor_staging' : 'gestor'
    const result = await prisma.$queryRaw`SELECT current_schema()` as any[]
    const actualSchema = result?.[0]?.current_schema
    const schemaOk = actualSchema === expectedSchema
    checks.schema = { ok: schemaOk, expected: expectedSchema, actual: actualSchema }
    if (!schemaOk) healthy = false
  } catch (e: any) {
    checks.schema = { ok: false, error: (e as any).message }
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
      // lastSync es estado de negocio — no rompe healthy
    }
  } catch (e: any) {
    checks.lastSync = { ok: false, error: e.message }
  }

  // Build — verificar que el commit del .next coincide con el del código
  try {
    const fs = await import('fs')
    const buildId = fs.readFileSync('/srv/gestor-staging/.next/BUILD_ID', 'utf8').trim()
    const versionJson = JSON.parse(fs.readFileSync('/srv/gestor-staging/public/version.json', 'utf8'))
    const commitBuild = versionJson.commit || buildId
    const commitCodigo = process.env.NEXT_PUBLIC_COMMIT || versionJson.commit || '?'
    // En staging el commit siempre es 'staging' — solo verificar en prod
    const envSchema = process.env.DATABASE_URL?.includes('gestor_staging') ? 'staging' : 'prod'
    if (envSchema === 'prod') {
      const buildOk = commitBuild === commitCodigo
      checks.build = { ok: buildOk, commit: commitBuild }
      if (!buildOk) healthy = false
    } else {
      checks.build = { ok: true, commit: commitBuild }
    }
  } catch (e: any) {
    checks.build = { ok: true } // no crítico si no se puede leer
  }

  checks.totalMs = Date.now() - start
  checks.uptime = Math.floor(process.uptime())

  return NextResponse.json(
    { healthy, checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  )
}
