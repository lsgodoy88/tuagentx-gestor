import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cache', () => ({
  withCache: vi.fn((_k: string, _ttl: number, fn: () => any) => fn()),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {}, DB_SCHEMA: 'gestor_staging' }))
vi.mock('@/lib/fechas', () => ({
  nowBogota: vi.fn(() => new Date('2026-09-15T15:00:00Z')), // 10:00 Bogotá
}))

import { prisma } from '@/lib/prisma'
import { getResumenCartera } from '@/lib/cartera/resumen'

const p = prisma as any

const INTEGRACION = { id: 'integ-01' }

function aggMock(monto: number, descuento = 0, count = 5) {
  return { _sum: { monto, descuento, saldoPendiente: monto }, _count: { id: count, clienteId: count } }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.integracion  = { findFirst: vi.fn().mockResolvedValue(INTEGRACION) }
  p.carteraCache = { aggregate: vi.fn().mockResolvedValue({ _sum: { saldoPendiente: 500000 }, _count: { clienteId: 10 } }) }
  p.$queryRaw    = vi.fn().mockResolvedValue([{ totalCartera: '300000', totalPendiente: '300000', clientes: 5 }])
  p.pagoCartera  = { aggregate: vi.fn().mockResolvedValue(aggMock(100000, 5000, 8)) }
  p.empleado     = { findUnique: vi.fn().mockResolvedValue({ apiId: 'api-emp-01' }) }
})

describe('getResumenCartera — admin (sin empleadoId)', () => {
  it('con integración → usa CarteraCache.aggregate', async () => {
    const r = await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: null })
    expect(p.carteraCache.aggregate).toHaveBeenCalled()
    expect(r.totalCartera).toBe(500000)
    expect(r.clientes).toBe(10)
  })

  it('sin integración → usa cartera.aggregate (modo legacy)', async () => {
    p.integracion.findFirst.mockResolvedValue(null)
    p.cartera = { aggregate: vi.fn().mockResolvedValue({ _sum: { saldoPendiente: 200000 }, _count: { id: 3 } }) }
    const r = await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: null })
    expect(p.cartera.aggregate).toHaveBeenCalled()
    expect(r.totalCartera).toBe(200000)
    expect(r.clientes).toBe(3)
  })

  it('calcula recaudadoMes correctamente', async () => {
    p.pagoCartera.aggregate
      .mockResolvedValueOnce(aggMock(150000, 10000, 5))  // mes actual
      .mockResolvedValueOnce(aggMock(100000, 5000, 4))   // mes anterior
    const r = await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: null })
    expect(r.recaudadoMes).toBe(150000)
    expect(r.descuentosMes).toBe(10000)
    expect(r.pagosCount).toBe(5)
  })

  it('variación correcta entre meses', async () => {
    p.pagoCartera.aggregate
      .mockResolvedValueOnce(aggMock(120000, 0))  // mes actual: 120000
      .mockResolvedValueOnce(aggMock(100000, 0))  // mes anterior: 100000
    const r = await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: null })
    expect(r.variacion).toBe(20) // 20% de aumento
  })

  it('mes anterior = 0 → variación 0 (evita división por cero)', async () => {
    p.pagoCartera.aggregate
      .mockResolvedValueOnce(aggMock(100000))
      .mockResolvedValueOnce(aggMock(0))
    const r = await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: null })
    expect(r.variacion).toBe(0)
  })

  it('pagos null → 0 en todos los campos', async () => {
    p.pagoCartera.aggregate.mockResolvedValue({ _sum: { monto: null, descuento: null }, _count: { id: null } })
    const r = await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: null })
    expect(r.recaudadoMes).toBe(0)
    expect(r.descuentosMes).toBe(0)
    expect(r.pagosCount).toBe(0)
  })
})

describe('getResumenCartera — vendedor (con empleadoIdForzado)', () => {
  it('con empleadoId → usa $queryRaw con apiId del empleado', async () => {
    const r = await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: 'vend-01' })
    expect(p.$queryRaw).toHaveBeenCalled()
    expect(r.totalCartera).toBe(300000)
    expect(r.clientes).toBe(5)
  })

  it('empleado sin apiId → totalCartera 0', async () => {
    p.empleado.findUnique.mockResolvedValue({ apiId: null })
    const r = await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: 'vend-01' })
    expect(r.totalCartera).toBe(0)
    expect(r.clientes).toBe(0)
    expect(p.$queryRaw).not.toHaveBeenCalled()
  })

  it('empleado no encontrado → totalCartera 0', async () => {
    p.empleado.findUnique.mockResolvedValue(null)
    const r = await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: 'vend-01' })
    expect(r.totalCartera).toBe(0)
  })

  it('filtra pagos por empleadoId en whereMes', async () => {
    await getResumenCartera({ empresaId: 'emp-01', empleadoIdForzado: 'vend-01' })
    const firstCall = p.pagoCartera.aggregate.mock.calls[0][0]
    expect(firstCall.where.empleadoId).toBe('vend-01')
  })
})
