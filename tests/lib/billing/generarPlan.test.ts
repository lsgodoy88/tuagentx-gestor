import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    empresa: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
  DB_SCHEMA: 'gestor_staging',
}))

// planEmpresa se accede como (prisma as any).planEmpresa
// Lo injectamos después del mock base
import { prisma } from '@/lib/prisma'
const p = prisma as any
p.precioRol = { findMany: vi.fn() }
p.planEmpresa = { findUnique: vi.fn(), create: vi.fn() }

import { generarPlanMes } from '@/lib/billing/generarPlan'

const PRECIOS = [
  { rol: 'vendedor',    precio: 45000 },
  { rol: 'supervisor',  precio: 35000 },
  { rol: 'bodega',      precio: 30000 },
  { rol: 'entregas',    precio: 25000 },
  { rol: 'impulsadora', precio: 20000 },
]

const EMPRESA_BASE = {
  id: 'emp-test-01',
  nombre: 'Empresa Test',
  montoNegociado: null,
  creditoSaldo: 0,
}

const SLOTS_BASE = {
  maxVendedores: 2, maxSupervisores: 1, maxBodega: 0, maxEntregas: 0, maxImpulsadoras: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  p.precioRol.findMany.mockResolvedValue(PRECIOS)
  p.planEmpresa.findUnique.mockResolvedValue(null) // no existe plan previo
  p.planEmpresa.create.mockResolvedValue({})
  p.empresa = {
    findMany: vi.fn().mockResolvedValue([EMPRESA_BASE]),
    findUnique: vi.fn().mockResolvedValue(SLOTS_BASE),
    update: vi.fn().mockResolvedValue({}),
  }
})

describe('generarPlanMes — cálculo de monto', () => {
  it('calcula monto correcto por slots (2 vendedores + 1 supervisor)', async () => {
    const res = await generarPlanMes('2026-09')
    expect(res.ok).toBe(true)
    const r = res.resultados[0]
    // 2*45000 + 1*35000 = 125000
    expect(r.montoBase).toBe(125000)
    expect(r.monto).toBe(125000)
    expect(r.creditoUsado).toBe(0)
    expect(r.accion).toBe('creado')
  })

  it('aplica crédito acumulado al monto final', async () => {
    p.empresa.findMany.mockResolvedValue([{ ...EMPRESA_BASE, creditoSaldo: 45000 }])
    const res = await generarPlanMes('2026-09')
    const r = res.resultados[0]
    expect(r.montoBase).toBe(125000)
    expect(r.monto).toBe(80000)       // 125000 - 45000
    expect(r.creditoUsado).toBe(45000)
  })

  it('crédito mayor al monto → plan queda en 0 (pagado automático)', async () => {
    p.empresa.findMany.mockResolvedValue([{ ...EMPRESA_BASE, creditoSaldo: 200000 }])
    const res = await generarPlanMes('2026-09')
    const r = res.resultados[0]
    expect(r.monto).toBe(0)
    expect(r.creditoUsado).toBe(125000)
  })

  it('montoNegociado tiene prioridad sobre slots', async () => {
    p.empresa.findMany.mockResolvedValue([{ ...EMPRESA_BASE, montoNegociado: 99000, creditoSaldo: 0 }])
    const res = await generarPlanMes('2026-09')
    const r = res.resultados[0]
    expect(r.montoBase).toBe(99000)
    expect(r.desglose[0].rol).toBe('negociado')
  })

  it('empresa exenta no genera plan (superadmin-001)', async () => {
    p.empresa.findMany.mockResolvedValue([]) // la query filtra exentas — resultado vacío
    const res = await generarPlanMes('2026-09')
    expect(res.resultados).toHaveLength(0)
  })

  it('plan ya existente → accion=ya_existe, no crea duplicado', async () => {
    p.planEmpresa.findUnique.mockResolvedValue({ id: 'plan-existente' })
    const res = await generarPlanMes('2026-09')
    expect(res.resultados[0].accion).toBe('ya_existe')
    expect(p.planEmpresa.create).not.toHaveBeenCalled()
  })

  it('mes override se usa correctamente en el id del plan', async () => {
    await generarPlanMes('2026-11')
    const createCall = p.planEmpresa.create.mock.calls[0][0].data
    expect(createCall.mes).toBe('2026-11')
    expect(createCall.id).toBe('plan-emp-test-01-2026-11')
  })

  it('slots en 0 → no genera plan (monto 0)', async () => {
    p.empresa.findUnique.mockResolvedValue({ maxVendedores: 0, maxSupervisores: 0, maxBodega: 0, maxEntregas: 0, maxImpulsadoras: 0 })
    const res = await generarPlanMes('2026-09')
    // monto=0 → continue → no push a resultados
    expect(res.resultados).toHaveLength(0)
  })
})
