import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/jobs/sync-nocturno', () => ({
  runSyncNocturno: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
}))

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/sync-guard', () => ({
  checkSyncGuard: vi.fn().mockResolvedValue(null), // deja pasar por defecto
}))

import { getServerSession } from 'next-auth'
import { runSyncNocturno } from '@/lib/jobs/sync-nocturno'
import { redis } from '@/lib/redis'
import { POST } from '@/app/api/sync/nocturno/route'

const sessionMock = getServerSession as any
const syncMock = runSyncNocturno as any
const redisMock = redis as any

function makeReq(body: any = {}, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/sync/nocturno', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  process.env.SKIP_SYNC_LOCK = undefined as any
  redisMock.set.mockResolvedValue('OK')
})

// ── Autenticación ─────────────────────────────────────────────────────────────
describe('POST /api/sync/nocturno — autenticación', () => {
  it('x-cron-secret válido → 200 sin session', async () => {
    const res = await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    expect(res.status).toBe(200)
    expect(sessionMock).not.toHaveBeenCalled()
  })

  it('sin auth → 401', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('rol vendedor → 401', async () => {
    sessionMock.mockResolvedValue({ user: { role: 'vendedor' } })
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('rol empresa → 200', async () => {
    sessionMock.mockResolvedValue({ user: { role: 'empresa' } })
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
  })
})

// ── Fire-and-forget ───────────────────────────────────────────────────────────
describe('POST /api/sync/nocturno — fire-and-forget', () => {
  it('responde {ok:true, iniciado:true} inmediatamente', async () => {
    const res = await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    const json = await res.json()
    expect(json).toEqual({ ok: true, iniciado: true })
  })

  it('runSyncNocturno se llama sin modo (slim)', async () => {
    await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    expect(syncMock).toHaveBeenCalledTimes(1)
    expect(syncMock).toHaveBeenCalledWith()
  })

  it('body inválido (no JSON) → no lanza, inicia igual', async () => {
    const req = new NextRequest('http://localhost/api/sync/nocturno', {
      method: 'POST',
      headers: { 'x-cron-secret': 'test-secret' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(syncMock).toHaveBeenCalledTimes(1)
  })

  it('modo en body es ignorado — slim no usa modo', async () => {
    await POST(makeReq({ modo: 'completo' }, { 'x-cron-secret': 'test-secret' }))
    // runSyncNocturno se llama sin argumentos
    expect(syncMock).toHaveBeenCalledWith()
  })
})

// ── Mutex Redis ───────────────────────────────────────────────────────────────
describe('POST /api/sync/nocturno — mutex Redis', () => {
  it('lock libre → inicia sync y responde iniciado:true', async () => {
    redisMock.set.mockResolvedValue('OK')
    const res = await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    expect(res.status).toBe(200)
    expect((await res.json()).iniciado).toBe(true)
    expect(syncMock).toHaveBeenCalledTimes(1)
  })

  it('lock ocupado → omite sync y responde omitido:true', async () => {
    redisMock.set.mockResolvedValue(null)
    const res = await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    const body = await res.json()
    expect(body.omitido).toBe(true)
    expect(body.razon).toBe('sync_en_curso')
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('doble dispatch simultáneo → solo uno inicia', async () => {
    redisMock.set
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null)
    const [r1, r2] = await Promise.all([
      POST(makeReq({}, { 'x-cron-secret': 'test-secret' })),
      POST(makeReq({}, { 'x-cron-secret': 'test-secret' })),
    ])
    const [b1, b2] = await Promise.all([r1.json(), r2.json()])
    expect([b1, b2].filter(b => b.iniciado).length).toBe(1)
    expect([b1, b2].filter(b => b.omitido).length).toBe(1)
    expect(syncMock).toHaveBeenCalledTimes(1)
  })

  it('lock usa key unificada sync-nocturno:lock con TTL 900s', async () => {
    await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    expect(redisMock.set).toHaveBeenCalledWith('sync-nocturno:lock', 'nocturno', 'EX', 900, 'NX')
  })

  it('lock se libera al terminar el sync', async () => {
    syncMock.mockResolvedValue([])
    await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    await new Promise(r => setTimeout(r, 20))
    expect(redisMock.del).toHaveBeenCalledWith('sync-nocturno:lock')
  })

  it('lock se libera aunque el sync falle', async () => {
    syncMock.mockRejectedValue(new Error('error simulado'))
    await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    await new Promise(r => setTimeout(r, 20))
    expect(redisMock.del).toHaveBeenCalledWith('sync-nocturno:lock')
  })

  it('SKIP_SYNC_LOCK=true → ignora lock y corre siempre', async () => {
    process.env.SKIP_SYNC_LOCK = 'true'
    redisMock.set.mockResolvedValue(null) // simula lock ocupado — debería ignorarse
    const res = await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    const body = await res.json()
    expect(body.iniciado).toBe(true)
    expect(syncMock).toHaveBeenCalledTimes(1)
  })
})
