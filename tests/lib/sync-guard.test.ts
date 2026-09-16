import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Redis antes de importar el guard
const mockIncr = vi.fn()
const mockExpire = vi.fn()
vi.mock('@/lib/redis', () => ({
  redis: { incr: mockIncr, expire: mockExpire }
}))

// Mock process.env
const CRON_SECRET = 'test-secret-123'
vi.stubEnv('CRON_SECRET', CRON_SECRET)

const { checkSyncGuard } = await import('@/lib/sync-guard')

function makeRequest(secret?: string): NextRequest {
  return new NextRequest('http://localhost/api/sync/delta', {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  })
}

describe('checkSyncGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)
  })

  // ─── Autenticación ─────────────────────────────────────────────────────────

  it('sin header x-cron-secret → 401', async () => {
    const res = await checkSyncGuard(makeRequest(), 'delta')
    expect(res?.status).toBe(401)
    const body = await res?.json()
    expect(body.error).toMatch(/no autorizado/i)
  })

  it('secret incorrecto → 401', async () => {
    const res = await checkSyncGuard(makeRequest('wrong-secret'), 'delta')
    expect(res?.status).toBe(401)
  })

  it('secret correcto → pasa autenticación (null)', async () => {
    const res = await checkSyncGuard(makeRequest(CRON_SECRET), 'delta')
    expect(res).toBeNull()
  })

  // ─── Rate limiting ──────────────────────────────────────────────────────────

  it('primera llamada → incr + expire, pasa', async () => {
    mockIncr.mockResolvedValue(1)
    const res = await checkSyncGuard(makeRequest(CRON_SECRET), 'delta')
    expect(res).toBeNull()
    expect(mockIncr).toHaveBeenCalledWith('sync-guard:delta:rate')
    expect(mockExpire).toHaveBeenCalledWith('sync-guard:delta:rate', 60)
  })

  it('segunda llamada dentro del límite → pasa', async () => {
    mockIncr.mockResolvedValue(2)
    const res = await checkSyncGuard(makeRequest(CRON_SECRET), 'delta')
    expect(res).toBeNull()
  })

  it('tercera llamada (límite delta=3) → pasa', async () => {
    mockIncr.mockResolvedValue(3)
    const res = await checkSyncGuard(makeRequest(CRON_SECRET), 'delta')
    expect(res).toBeNull()
  })

  it('cuarta llamada (count=4 > max=3) → 429', async () => {
    mockIncr.mockResolvedValue(4)
    const res = await checkSyncGuard(makeRequest(CRON_SECRET), 'delta')
    expect(res?.status).toBe(429)
    const body = await res?.json()
    expect(body.error).toMatch(/rate limit/i)
    expect(body.count).toBe(4)
    expect(body.max).toBe(3)
  })

  it('llamada N >> límite → 429', async () => {
    mockIncr.mockResolvedValue(100)
    const res = await checkSyncGuard(makeRequest(CRON_SECRET), 'delta')
    expect(res?.status).toBe(429)
  })

  it('no llama expire cuando count > 1 (TTL ya establecido)', async () => {
    mockIncr.mockResolvedValue(2)
    await checkSyncGuard(makeRequest(CRON_SECRET), 'delta')
    expect(mockExpire).not.toHaveBeenCalled()
  })

  it('nocturno tiene límite=2 independiente de delta', async () => {
    mockIncr.mockResolvedValue(3) // sobre el límite de nocturno (2) pero bajo el de delta (3)
    const res = await checkSyncGuard(makeRequest(CRON_SECRET), 'nocturno')
    expect(res?.status).toBe(429)
  })

  it('key Redis incluye el tipo de sync', async () => {
    await checkSyncGuard(makeRequest(CRON_SECRET), 'productos')
    expect(mockIncr).toHaveBeenCalledWith('sync-guard:productos:rate')
  })

  it('tipo desconocido usa rate limit default=5', async () => {
    mockIncr.mockResolvedValue(5)
    const res = await checkSyncGuard(makeRequest(CRON_SECRET), 'tipo-nuevo')
    expect(res).toBeNull() // 5 <= 5, pasa

    mockIncr.mockResolvedValue(6)
    const res2 = await checkSyncGuard(makeRequest(CRON_SECRET), 'tipo-nuevo')
    expect(res2?.status).toBe(429) // 6 > 5, bloquea
  })

  // ─── Resiliencia Redis ──────────────────────────────────────────────────────

  it('Redis falla → deja pasar (disponibilidad > protección)', async () => {
    mockIncr.mockRejectedValue(new Error('NOAUTH Authentication required'))
    const res = await checkSyncGuard(makeRequest(CRON_SECRET), 'delta')
    expect(res).toBeNull() // pasa igual
  })

  it('Redis falla → no lanza excepción al caller', async () => {
    mockIncr.mockRejectedValue(new Error('Connection refused'))
    await expect(checkSyncGuard(makeRequest(CRON_SECRET), 'delta')).resolves.toBeNull()
  })

  // ─── Orden de validación ────────────────────────────────────────────────────

  it('sin secret → no llama Redis (auth falla primero)', async () => {
    await checkSyncGuard(makeRequest(), 'delta')
    expect(mockIncr).not.toHaveBeenCalled()
  })

  it('secret incorrecto → no llama Redis', async () => {
    await checkSyncGuard(makeRequest('wrong'), 'delta')
    expect(mockIncr).not.toHaveBeenCalled()
  })
})
