import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/jobs/sync-nocturno', () => ({
  runSyncNocturno: vi.fn().mockResolvedValue({ ok: true }),
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
