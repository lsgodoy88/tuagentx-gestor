/**
 * sync-guard — protección centralizada para endpoints /api/sync/*
 *
 * Capas:
 * 1. Autenticación — x-cron-secret obligatorio
 * 2. Rate limiting — máx N llamadas por ventana de tiempo (Redis sliding window)
 *
 * Uso:
 *   const deny = await checkSyncGuard(req, 'delta')
 *   if (deny) return deny
 */
import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

// Rate limits por tipo de sync
// Ventana: 60 segundos
const RATE_LIMITS: Record<string, number> = {
  delta:        3,  // máx 3 disparos/min (guardian corre cada 5min — margen para reintentos)
  nocturno:     2,  // máx 2/min
  productos:    2,
  transprensa:  2,
  clientes:     2,
  default:      5,
}

const WINDOW_SECS = 60

export async function checkSyncGuard(
  req: NextRequest,
  tipo: string
): Promise<NextResponse | null> {
  // 1. Autenticación
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Rate limiting — sliding window con Redis INCR + EXPIRE
  const maxCalls = RATE_LIMITS[tipo] ?? RATE_LIMITS.default
  const key = `sync-guard:${tipo}:rate`
  try {
    const count = await redis.incr(key)
    if (count === 1) {
      // Primera llamada en la ventana — establecer TTL
      await redis.expire(key, WINDOW_SECS)
    }
    if (count > maxCalls) {
      console.warn(`[sync-guard] rate limit alcanzado — tipo=${tipo} count=${count} max=${maxCalls}`)
      return NextResponse.json(
        { error: 'Rate limit — demasiadas llamadas', tipo, count, max: maxCalls },
        { status: 429 }
      )
    }
  } catch (e: any) {
    // Redis no disponible — dejar pasar (mejor disponibilidad que seguridad aquí)
    console.warn('[sync-guard] Redis no disponible para rate limit:', e.message)
  }

  return null // OK — continuar
}
