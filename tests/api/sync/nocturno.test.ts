import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/jobs/sync-nocturno', () => ({
  runSyncNocturno: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'), // lock libre por defecto
    del: vi.fn().mockResolvedValue(1),
  },
}))

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

import { getServerSession } from 'next-auth'
import { runSyncNocturno } from '@/lib/jobs/sync-nocturno'
import { POST } from '@/app/api/sync/nocturno/route'

const sessionMock = getServerSession as any
const syncMock = runSyncNocturno as any

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
})

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

  it('rol no admin → 401', async () => {
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

describe('POST /api/sync/nocturno — fire-and-forget', () => {
  it('responde {ok:true, iniciado:true} inmediatamente', async () => {
    const res = await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    const json = await res.json()
    expect(json).toEqual({ ok: true, iniciado: true })
  })

  it('runSyncNocturno se llama sin await (fire-and-forget)', async () => {
    // El mock resuelve inmediatamente — verificamos que fue llamado
    await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    expect(syncMock).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/sync/nocturno — modo', () => {
  it('modo desde body → se pasa a runSyncNocturno', async () => {
    await POST(makeReq({ modo: 'completo' }, { 'x-cron-secret': 'test-secret' }))
    expect(syncMock).toHaveBeenCalledWith({ modo: 'completo' })
  })

  it('modo desde querystring → se pasa a runSyncNocturno', async () => {
    const req = new NextRequest('http://localhost/api/sync/nocturno?modo=delta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': 'test-secret' },
      body: JSON.stringify({}),
    })
    await POST(req)
    expect(syncMock).toHaveBeenCalledWith({ modo: 'delta' })
  })

  it('sin modo → default completo', async () => {
    await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    expect(syncMock).toHaveBeenCalledWith({ modo: 'completo' })
  })

  it('body inválido (no JSON) → no lanza, usa modo default', async () => {
    const req = new NextRequest('http://localhost/api/sync/nocturno', {
      method: 'POST',
      headers: { 'x-cron-secret': 'test-secret' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(syncMock).toHaveBeenCalledWith({ modo: 'completo' })
  })
})

describe('POST /api/sync/nocturno — mutex Redis', () => {
  let syncMock: any
  let redisMock: any

  beforeEach(async () => {
    vi.clearAllMocks()
    syncMock = (await import('@/lib/jobs/sync-nocturno')).runSyncNocturno as any
    redisMock = (await import('@/lib/redis')).redis as any
  })

  it('lock libre → inicia sync y responde iniciado:true', async () => {
    redisMock.set.mockResolvedValue('OK')
    const res = await POST(makeReq({ modo: 'delta' }, { 'x-cron-secret': 'test-secret' }))
    expect(res.status).toBe(200)
    expect((await res.json()).iniciado).toBe(true)
    expect(syncMock).toHaveBeenCalledTimes(1)
  })

  it('lock ocupado → omite sync y responde omitido:true', async () => {
    redisMock.set.mockResolvedValue(null) // NX devuelve null si ya existe
    const res = await POST(makeReq({ modo: 'completo' }, { 'x-cron-secret': 'test-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.omitido).toBe(true)
    expect(body.razon).toBe('sync_en_curso')
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('doble dispatch simultáneo → solo uno inicia', async () => {
    redisMock.set
      .mockResolvedValueOnce('OK')   // primera llamada obtiene lock
      .mockResolvedValueOnce(null)    // segunda es rechazada
    const [r1, r2] = await Promise.all([
      POST(makeReq({ modo: 'completo' }, { 'x-cron-secret': 'test-secret' })),
      POST(makeReq({ modo: 'completo' }, { 'x-cron-secret': 'test-secret' })),
    ])
    const [b1, b2] = await Promise.all([r1.json(), r2.json()])
    const iniciados = [b1, b2].filter(b => b.iniciado).length
    const omitidos  = [b1, b2].filter(b => b.omitido).length
    expect(iniciados).toBe(1)
    expect(omitidos).toBe(1)
    expect(syncMock).toHaveBeenCalledTimes(1)
  })

  it('lock se libera al terminar el sync', async () => {
    redisMock.set.mockResolvedValue('OK')
    syncMock.mockResolvedValue({ ok: true })
    await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    // Dar tiempo al finally
    await new Promise(r => setTimeout(r, 10))
    expect(redisMock.del).toHaveBeenCalledWith('sync-nocturno:lock')
  })

  it('lock se libera aunque el sync falle', async () => {
    redisMock.set.mockResolvedValue('OK')
    syncMock.mockRejectedValue(new Error('error simulado'))
    await POST(makeReq({}, { 'x-cron-secret': 'test-secret' }))
    await new Promise(r => setTimeout(r, 10))
    expect(redisMock.del).toHaveBeenCalledWith('sync-nocturno:lock')
  })

  it('completo usa key sync-nocturno:lock', async () => {
    redisMock.set.mockResolvedValue('OK')
    await POST(makeReq({ modo: 'completo' }, { 'x-cron-secret': 'test-secret' }))
    expect(redisMock.set).toHaveBeenCalledWith('sync-nocturno:lock', 'completo', 'EX', 3600, 'NX')
  })

  it('delta usa key sync-nocturno:lock:delta', async () => {
    redisMock.set.mockResolvedValue('OK')
    await POST(makeReq({ modo: 'delta' }, { 'x-cron-secret': 'test-secret' }))
    expect(redisMock.set).toHaveBeenCalledWith('sync-nocturno:lock:delta', 'delta', 'EX', 600, 'NX')
  })

  it('delta ocupado no bloquea completo', async () => {
    redisMock.set
      .mockResolvedValueOnce(null)  // delta lock ocupado
      .mockResolvedValueOnce('OK')  // completo lock libre
    const [r1, r2] = await Promise.all([
      POST(makeReq({ modo: 'delta' }, { 'x-cron-secret': 'test-secret' })),
      POST(makeReq({ modo: 'completo' }, { 'x-cron-secret': 'test-secret' })),
    ])
    const [b1, b2] = await Promise.all([r1.json(), r2.json()])
    expect(b1.omitido).toBe(true)
    expect(b2.iniciado).toBe(true)
  })
})
