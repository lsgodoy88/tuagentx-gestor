import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}))

import { prisma } from '@/lib/prisma'
const p = prisma as any
p.egreso       = { aggregate: vi.fn() }
p.saldoEfectivo = { aggregate: vi.fn() }
p.saldoBancos   = { aggregate: vi.fn() }
p.saldoOtros    = { aggregate: vi.fn() }

import { calcularEgresosMes, calcularSaldoActual } from '@/lib/cartera/saldos'

beforeEach(() => vi.clearAllMocks())

describe('calcularEgresosMes', () => {
  it('calcula total, pagado y pendiente correctamente', async () => {
    p.egreso.aggregate.mockResolvedValue({
      _sum: { valor: 500000, abonoPago: 200000, saldo: 300000 },
    })
    const r = await calcularEgresosMes('emp-01', 9, 2026)
    expect(r.total).toBe(500000)
    expect(r.pagado).toBe(200000)
    expect(r.pendiente).toBe(300000)
  })

  it('valores null → 0 (empresa sin egresos)', async () => {
    p.egreso.aggregate.mockResolvedValue({ _sum: { valor: null, abonoPago: null, saldo: null } })
    const r = await calcularEgresosMes('emp-01', 9, 2026)
    expect(r.total).toBe(0)
    expect(r.pagado).toBe(0)
    expect(r.pendiente).toBe(0)
  })

  it('redondea valores decimales', async () => {
    p.egreso.aggregate.mockResolvedValue({
      _sum: { valor: 100000.7, abonoPago: 50000.3, saldo: 50000.4 },
    })
    const r = await calcularEgresosMes('emp-01', 9, 2026)
    expect(r.total).toBe(100001)
    expect(r.pagado).toBe(50000)
    expect(r.pendiente).toBe(50000)
  })
})

describe('calcularSaldoActual', () => {
  function mockAggregate(ingreso: number, egreso: number) {
    return { _sum: { ingreso, egreso } }
  }

  it('calcula saldo efectivo, bancos y otros correctamente', async () => {
    p.saldoEfectivo.aggregate.mockResolvedValue(mockAggregate(500000, 200000))
    p.saldoBancos.aggregate.mockResolvedValue(mockAggregate(1000000, 300000))
    p.saldoOtros.aggregate.mockResolvedValue(mockAggregate(100000, 100000))
    const r = await calcularSaldoActual('emp-01')
    expect(r.efectivo).toBe(300000)
    expect(r.bancos).toBe(700000)
    expect(r.otros).toBe(0)
  })

  it('saldo negativo permitido (empresa en déficit)', async () => {
    p.saldoEfectivo.aggregate.mockResolvedValue(mockAggregate(0, 50000))
    p.saldoBancos.aggregate.mockResolvedValue(mockAggregate(0, 0))
    p.saldoOtros.aggregate.mockResolvedValue(mockAggregate(0, 0))
    const r = await calcularSaldoActual('emp-01')
    expect(r.efectivo).toBe(-50000)
  })

  it('todos null → 0 en los tres tipos', async () => {
    const nullAgg = { _sum: { ingreso: null, egreso: null } }
    p.saldoEfectivo.aggregate.mockResolvedValue(nullAgg)
    p.saldoBancos.aggregate.mockResolvedValue(nullAgg)
    p.saldoOtros.aggregate.mockResolvedValue(nullAgg)
    const r = await calcularSaldoActual('emp-01')
    expect(r.efectivo).toBe(0)
    expect(r.bancos).toBe(0)
    expect(r.otros).toBe(0)
  })
})
