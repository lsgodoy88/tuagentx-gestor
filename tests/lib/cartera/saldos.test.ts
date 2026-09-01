import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}))

import { prisma } from '@/lib/prisma'
const p = prisma as any
p.egreso          = { aggregate: vi.fn() }
p.saldoMovimiento = { groupBy: vi.fn() }

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
  function mockRows(efectivo: [number,number], bancos: [number,number], otros: [number,number]) {
    return [
      { tab_key: 'efectivo', _sum: { ingreso: efectivo[0], egreso: efectivo[1] } },
      { tab_key: 'bancos',   _sum: { ingreso: bancos[0],   egreso: bancos[1]   } },
      { tab_key: 'otros',    _sum: { ingreso: otros[0],    egreso: otros[1]    } },
    ]
  }

  it('calcula saldo efectivo, bancos y otros correctamente', async () => {
    p.saldoMovimiento.groupBy.mockResolvedValue(mockRows([500000,200000],[1000000,300000],[100000,100000]))
    const r = await calcularSaldoActual('emp-01')
    expect(r.efectivo).toBe(300000)
    expect(r.bancos).toBe(700000)
    expect(r.otros).toBe(0)
  })

  it('saldo negativo permitido (empresa en déficit)', async () => {
    p.saldoMovimiento.groupBy.mockResolvedValue(mockRows([0,50000],[0,0],[0,0]))
    const r = await calcularSaldoActual('emp-01')
    expect(r.efectivo).toBe(-50000)
  })

  it('todos null → 0 en los tres tipos', async () => {
    p.saldoMovimiento.groupBy.mockResolvedValue([
      { tab_key: 'efectivo', _sum: { ingreso: null, egreso: null } },
      { tab_key: 'bancos',   _sum: { ingreso: null, egreso: null } },
      { tab_key: 'otros',    _sum: { ingreso: null, egreso: null } },
    ])
    const r = await calcularSaldoActual('emp-01')
    expect(r.efectivo).toBe(0)
    expect(r.bancos).toBe(0)
    expect(r.otros).toBe(0)
  })
})
