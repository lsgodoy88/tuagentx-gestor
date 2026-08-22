import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRawUnsafe: vi.fn() },
  DB_SCHEMA: 'gestor_staging',
}))

import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/plan-empresa/voucher/route'

const p = prisma as any

function makeReq(body: any, secret = 'master-secret') {
  return new NextRequest('http://localhost/api/plan-empresa/voucher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-master-secret': secret },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MASTER_API_SECRET = 'master-secret'
  // Fijar fecha para formato determinístico
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'))
})

describe('POST /api/plan-empresa/voucher — auth', () => {
  it('sin secret → 401', async () => {
    const res = await POST(makeReq({ tipo: 'PAIDMES', empresaId: 'emp-01' }, 'wrong'))
    expect(res.status).toBe(401)
  })

  it('sin tipo → 400', async () => {
    p.$queryRawUnsafe.mockResolvedValue([{ cnt: 0 }])
    const res = await POST(makeReq({ empresaId: 'emp-01' }))
    expect(res.status).toBe(400)
  })

  it('sin empresaId → 400', async () => {
    p.$queryRawUnsafe.mockResolvedValue([{ cnt: 0 }])
    const res = await POST(makeReq({ tipo: 'PAIDMES' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/plan-empresa/voucher — formato voucherNum', () => {
  it('PAIDMES primer voucher → PM2609001', async () => {
    p.$queryRawUnsafe.mockResolvedValue([{ cnt: 0 }])
    const res = await POST(makeReq({ tipo: 'PAIDMES', empresaId: 'emp-01' }))
    const json = await res.json()
    expect(json.voucherNum).toBe('PM2609001')
  })

  it('NEWPLAN → NP2609001', async () => {
    p.$queryRawUnsafe.mockResolvedValue([{ cnt: 0 }])
    const res = await POST(makeReq({ tipo: 'NEWPLAN', empresaId: 'emp-01' }))
    const json = await res.json()
    expect(json.voucherNum).toBe('NP2609001')
  })

  it('ADDROL → NR2609001', async () => {
    p.$queryRawUnsafe.mockResolvedValue([{ cnt: 0 }])
    const res = await POST(makeReq({ tipo: 'ADDROL', empresaId: 'emp-01' }))
    const json = await res.json()
    expect(json.voucherNum).toBe('NR2609001')
  })

  it('consecutivo incrementa correctamente (cnt=5 → 006)', async () => {
    p.$queryRawUnsafe.mockResolvedValue([{ cnt: 5 }])
    const res = await POST(makeReq({ tipo: 'PAIDMES', empresaId: 'emp-01' }))
    const json = await res.json()
    expect(json.voucherNum).toBe('PM2609006')
  })

  it('consulta SQL usa prefijo correcto para LIKE', async () => {
    p.$queryRawUnsafe.mockResolvedValue([{ cnt: 0 }])
    await POST(makeReq({ tipo: 'PAIDMES', empresaId: 'emp-01' }))
    const [sql, prefijo] = p.$queryRawUnsafe.mock.calls[0]
    expect(sql).toContain('LIKE')
    expect(prefijo).toBe('PM2609%')
  })
})
