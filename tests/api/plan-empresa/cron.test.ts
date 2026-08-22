import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/billing/generarPlan', () => ({
  generarPlanMes: vi.fn().mockResolvedValue({ ok: true, resultados: [{ accion: 'creado', monto: 80000 }] }),
}))
vi.mock('@/lib/billing/notificaciones', () => ({
  enviarRecordatorioPago: vi.fn().mockResolvedValue({ ok: true, total: 2 }),
  activarBannerPago:      vi.fn().mockResolvedValue({ ok: true, activados: 2 }),
}))

import { POST } from '@/app/api/plan-empresa/cron/route'
import { generarPlanMes } from '@/lib/billing/generarPlan'
import { enviarRecordatorioPago, activarBannerPago } from '@/lib/billing/notificaciones'

function makeReq(body: any, secret = 'cron-secret') {
  return new NextRequest('http://localhost/api/plan-empresa/cron', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'cron-secret'
})

describe('POST /api/plan-empresa/cron — auth', () => {
  it('secret inválido → 401', async () => {
    const res = await POST(makeReq({ accion: 'generar' }, 'wrong'))
    expect(res.status).toBe(401)
    expect(generarPlanMes).not.toHaveBeenCalled()
  })
})

describe('POST /api/plan-empresa/cron — accion=generar', () => {
  it('llama generarPlanMes sin mes → usa mes actual', async () => {
    const res = await POST(makeReq({ accion: 'generar' }))
    expect(res.status).toBe(200)
    expect(generarPlanMes).toHaveBeenCalledWith(undefined)
  })

  it('llama generarPlanMes con mes override', async () => {
    const res = await POST(makeReq({ accion: 'generar', mes: '2026-11' }))
    expect(res.status).toBe(200)
    expect(generarPlanMes).toHaveBeenCalledWith('2026-11')
  })

  it('retorna resultado de generarPlanMes', async () => {
    const res = await POST(makeReq({ accion: 'generar' }))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.resultados[0].accion).toBe('creado')
  })
})

describe('POST /api/plan-empresa/cron — accion=recordatorio', () => {
  it('día 3 → enviarRecordatorioPago(3)', async () => {
    vi.setSystemTime(new Date('2026-09-03T14:00:00Z'))
    const res = await POST(makeReq({ accion: 'recordatorio' }))
    expect(res.status).toBe(200)
    expect(enviarRecordatorioPago).toHaveBeenCalledWith(3)
    vi.useRealTimers()
  })
})

describe('POST /api/plan-empresa/cron — accion=alerta', () => {
  it('día 6 → enviarRecordatorioPago(6)', async () => {
    vi.setSystemTime(new Date('2026-09-06T14:00:00Z'))
    const res = await POST(makeReq({ accion: 'alerta' }))
    expect(res.status).toBe(200)
    expect(enviarRecordatorioPago).toHaveBeenCalledWith(6)
    vi.useRealTimers()
  })

  it('día 7 → enviarRecordatorioPago(7)', async () => {
    vi.setSystemTime(new Date('2026-09-07T14:00:00Z'))
    const res = await POST(makeReq({ accion: 'alerta' }))
    expect(enviarRecordatorioPago).toHaveBeenCalledWith(7)
    vi.useRealTimers()
  })

  it('día 8 → enviarRecordatorioPago(7) (fallback >= 7)', async () => {
    vi.setSystemTime(new Date('2026-09-08T14:00:00Z'))
    const res = await POST(makeReq({ accion: 'alerta' }))
    expect(enviarRecordatorioPago).toHaveBeenCalledWith(7)
    vi.useRealTimers()
  })
})

describe('POST /api/plan-empresa/cron — accion=banner', () => {
  it('día 10 → activarBannerPago', async () => {
    const res = await POST(makeReq({ accion: 'banner' }))
    expect(res.status).toBe(200)
    expect(activarBannerPago).toHaveBeenCalledTimes(1)
  })

  it('retorna resultado de activarBannerPago', async () => {
    const res = await POST(makeReq({ accion: 'banner' }))
    const json = await res.json()
    expect(json.activados).toBe(2)
  })
})

describe('POST /api/plan-empresa/cron — accion inválida', () => {
  it('accion desconocida → 400', async () => {
    const res = await POST(makeReq({ accion: 'invalidar' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/accion requerida/)
  })

  it('sin accion → 400', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('body vacío (objeto vacío) → 400', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })
})
