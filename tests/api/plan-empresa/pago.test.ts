import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/billing/marcarPagado', () => ({
  marcarPlanPagado: vi.fn(),
}))

import { POST } from '@/app/api/plan-empresa/pago/route'
import { marcarPlanPagado } from '@/lib/billing/marcarPagado'

const markMock = marcarPlanPagado as any

function makeReq(body: any, secret = 'master-secret') {
  return new NextRequest('http://localhost/api/plan-empresa/pago', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-master-secret': secret },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MASTER_API_SECRET = 'master-secret'
  markMock.mockResolvedValue({ ok: true, mesesPagados: ['2026-09'], excedente: 0, voucherNum: 'PM2609001' })
})

describe('POST /api/plan-empresa/pago — auth', () => {
  it('secret inválido → 401', async () => {
    const res = await POST(makeReq({ empresaId: 'e1', pagoId: 'p1', montoPagado: 100000 }, 'wrong'))
    expect(res.status).toBe(401)
    expect(markMock).not.toHaveBeenCalled()
  })

  it('sin empresaId → 400', async () => {
    const res = await POST(makeReq({ pagoId: 'p1', montoPagado: 100000 }))
    expect(res.status).toBe(400)
  })

  it('sin pagoId → 400', async () => {
    const res = await POST(makeReq({ empresaId: 'e1', montoPagado: 100000 }))
    expect(res.status).toBe(400)
  })

  it('sin montoPagado → 400', async () => {
    const res = await POST(makeReq({ empresaId: 'e1', pagoId: 'p1' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/plan-empresa/pago — flujo', () => {
  it('llama marcarPlanPagado con params correctos → 200', async () => {
    const res = await POST(makeReq({ empresaId: 'e1', pagoId: 'p1', montoPagado: 125000 }))
    expect(res.status).toBe(200)
    expect(markMock).toHaveBeenCalledWith('e1', 'p1', 125000, undefined)
  })

  it('pagoFecha string → se convierte a Date', async () => {
    await POST(makeReq({ empresaId: 'e1', pagoId: 'p1', montoPagado: 100000, pagoFecha: '2026-09-15T12:00:00Z' }))
    const fechaArg = markMock.mock.calls[0][3]
    expect(fechaArg).toBeInstanceOf(Date)
    expect(fechaArg.toISOString()).toBe('2026-09-15T12:00:00.000Z')
  })

  it('montoPagado string numérico → se convierte a Number', async () => {
    await POST(makeReq({ empresaId: 'e1', pagoId: 'p1', montoPagado: '125000' }))
    expect(markMock).toHaveBeenCalledWith('e1', 'p1', 125000, undefined)
  })

  it('response incluye resultado de marcarPlanPagado', async () => {
    const res = await POST(makeReq({ empresaId: 'e1', pagoId: 'p1', montoPagado: 125000 }))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.mesesPagados).toEqual(['2026-09'])
    expect(json.voucherNum).toBe('PM2609001')
  })

  it('marcarPlanPagado lanza error → propaga (no swallow)', async () => {
    markMock.mockRejectedValue(new Error('DB timeout'))
    await expect(POST(makeReq({ empresaId: 'e1', pagoId: 'p1', montoPagado: 100000 }))).rejects.toThrow('DB timeout')
  })
})
