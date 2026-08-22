import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRawUnsafe: vi.fn() },
  DB_SCHEMA: 'gestor_staging',
}))

import { prisma } from '@/lib/prisma'
const p = prisma as any
p.empresa   = { findUnique: vi.fn(), update: vi.fn() }
p.planEmpresa = { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() }

import { marcarPlanPagado } from '@/lib/billing/marcarPagado'

const FECHA = new Date('2026-09-10T12:00:00Z')

function planPendiente(mes: string, saldo: number, id?: string) {
  return { id: id ?? `plan-${mes}`, mes, saldo, estado: 'pendiente', pagoIds: [] }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.$queryRawUnsafe.mockResolvedValue([{ cnt: 0 }]) // voucher consecutivo = 001
  p.empresa.findUnique.mockResolvedValue({ planFin: null, creditoSaldo: 0 })
  p.empresa.update.mockResolvedValue({})
  p.planEmpresa.update.mockResolvedValue({})
  p.planEmpresa.updateMany.mockResolvedValue({})
  p.planEmpresa.count.mockResolvedValue(0)
})

describe('marcarPlanPagado — FIFO', () => {
  it('pago exacto a un mes → estado pagado, excedente 0', async () => {
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-08', 125000)])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 125000, FECHA)
    expect(r.ok).toBe(true)
    expect(r.mesesPagados).toEqual(['2026-08'])
    expect(r.excedente).toBe(0)
    expect(r.quedanPendientes).toBe(0)
  })

  it('pago mayor → excedente queda en creditoSaldo empresa', async () => {
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-08', 100000)])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 150000, FECHA)
    expect(r.mesesPagados).toEqual(['2026-08'])
    expect(r.excedente).toBe(50000)
    const updateCall = p.empresa.update.mock.calls.find((c: any) => c[0].data.creditoSaldo !== undefined)
    expect(updateCall[0].data.creditoSaldo).toBe(50000)
  })

  it('pago menor → saldo se reduce, mes queda pendiente', async () => {
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-08', 125000)])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 80000, FECHA)
    expect(r.mesesPagados).toHaveLength(0)
    expect(r.excedente).toBe(0)
    const updateCall = p.planEmpresa.update.mock.calls[0][0]
    expect(updateCall.data.saldo).toBe(45000) // 125000 - 80000
    expect(updateCall.data.estado).toBeUndefined() // no cambia a pagado
  })

  it('FIFO: paga 2 meses con un solo pago', async () => {
    p.planEmpresa.findMany.mockResolvedValue([
      planPendiente('2026-07', 100000, 'p1'),
      planPendiente('2026-08', 100000, 'p2'),
    ])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 200000, FECHA)
    expect(r.mesesPagados).toEqual(['2026-07', '2026-08'])
    expect(r.excedente).toBe(0)
  })

  it('sin planes pendientes → pago va a creditoSaldo', async () => {
    p.planEmpresa.findMany.mockResolvedValue([])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 50000, FECHA)
    expect(r.mesesPagados).toHaveLength(0)
    expect(r.excedente).toBe(50000)
    expect(r.voucherNum).toBeNull()
  })

  it('creditoSaldo existente se suma al pago entrante', async () => {
    p.empresa.findUnique.mockResolvedValue({ planFin: null, creditoSaldo: 25000 })
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-08', 100000)])
    // pago 75000 + credito 25000 = 100000 exacto
    const r = await marcarPlanPagado('emp-01', 'pago-01', 75000, FECHA)
    expect(r.mesesPagados).toEqual(['2026-08'])
    expect(r.excedente).toBe(0)
  })
})

describe('marcarPlanPagado — voucherNum', () => {
  it('genera voucher PM con consecutivo 001 al pagar primer mes', async () => {
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-09', 100000)])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA, 'PAIDMES')
    // FECHA = 2026-09-10 → yy=26, mm=09 → PM2609001
    expect(r.voucherNum).toBe('PM2609001')
  })

  it('voucher NP para plan nuevo', async () => {
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-09', 100000)])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA, 'NEWPLAN')
    expect(r.voucherNum).toBe('NP2609001')
  })

  it('consecutivo incrementa con planes existentes del mismo mes', async () => {
    p.$queryRawUnsafe.mockResolvedValue([{ cnt: 3 }]) // ya hay 3 vouchers PM2609
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-09', 100000)])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA)
    expect(r.voucherNum).toBe('PM2609004')
  })

  it('voucher se genera solo una vez aunque se paguen 2 meses', async () => {
    p.planEmpresa.findMany.mockResolvedValue([
      planPendiente('2026-07', 100000, 'p1'),
      planPendiente('2026-08', 100000, 'p2'),
    ])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 200000, FECHA)
    expect(r.voucherNum).toBe('PM2609001')
    // $queryRawUnsafe llamado solo 1 vez (voucher generado 1 sola vez)
    expect(p.$queryRawUnsafe).toHaveBeenCalledTimes(1)
  })
})

describe('marcarPlanPagado — planFin', () => {
  it('actualiza planFin al mes siguiente del último mes pagado', async () => {
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-09', 100000)])
    await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA)
    const updateEmpresa = p.empresa.update.mock.calls.find(
      (c: any) => c[0].data.planFin !== undefined
    )
    const planFin = new Date(updateEmpresa[0].data.planFin)
    expect(planFin).toEqual(new Date(Date.UTC(2026, 9, 1))) // Oct 1 2026
  })

  it('no retrocede planFin si ya era mayor', async () => {
    const planFinExistente = new Date(Date.UTC(2027, 0, 1)) // Ene 2027
    p.empresa.findUnique.mockResolvedValue({ planFin: planFinExistente, creditoSaldo: 0 })
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-09', 100000)])
    await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA)
    const updateEmpresa = p.empresa.update.mock.calls.find(
      (c: any) => c[0].data.planFin !== undefined
    )
    expect(new Date(updateEmpresa[0].data.planFin)).toEqual(planFinExistente)
  })
})

describe('marcarPlanPagado — ramas no cubiertas', () => {
  it('pagoFecha undefined → usa new Date() (rama ?? new Date())', async () => {
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-09', 100000)])
    // Sin pagoFecha → ahora = new Date() → voucherNum usa mes actual
    const r = await marcarPlanPagado('emp-01', 'pago-01', 100000)
    expect(r.ok).toBe(true)
    // voucherNum debe ser generado (no null)
    expect(r.voucherNum).not.toBeNull()
    expect(r.voucherNum).toMatch(/^PM\d{4}\d{3}$/)
  })

  it('empresa sin creditoSaldo (null) → asume 0 (rama ?? 0)', async () => {
    p.empresa.findUnique.mockResolvedValue({ planFin: null, creditoSaldo: null })
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-08', 100000)])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA)
    // null ?? 0 → restante = 100000 + 0 = 100000 exacto
    expect(r.mesesPagados).toEqual(['2026-08'])
    expect(r.excedente).toBe(0)
  })

  it('$queryRawUnsafe retorna array vacío → cnt ?? 0 → consecutivo 001', async () => {
    p.$queryRawUnsafe.mockResolvedValue([]) // array vacío — sin rows[0]
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-09', 100000)])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA)
    expect(r.voucherNum).toBe('PM2609001')
  })

  it('tipo desconocido → prefijo = tipo literal (rama ?? tipo)', async () => {
    p.planEmpresa.findMany.mockResolvedValue([planPendiente('2026-09', 100000)])
    // Forzar tipo inválido vía cast
    const r = await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA, 'CUSTOM' as any)
    // TIPO_PREFIJO['CUSTOM'] = undefined → undefined ?? 'CUSTOM' → prefijo = 'CUSTOM2609'
    expect(r.voucherNum).toMatch(/^CUSTOM2609/)
  })

  it('plan.pagoIds no es array → se usa [] como fallback', async () => {
    // pagoIds viene como null o undefined desde BD
    const planConPagoIdsNull = { id: 'p1', mes: '2026-08', saldo: 100000, estado: 'pendiente', pagoIds: null }
    p.planEmpresa.findMany.mockResolvedValue([planConPagoIdsNull])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA)
    expect(r.ok).toBe(true)
    // debe actualizar sin explotar
    const updateData = p.planEmpresa.update.mock.calls[0][0].data
    expect(Array.isArray(updateData.pagoIds)).toBe(true)
    expect(updateData.pagoIds).toContain('pago-01')
  })

  it('pagoId ya en pagoIds → idempotencia: no lo duplica', async () => {
    const planIdempotente = {
      id: 'p1', mes: '2026-08', saldo: 100000, estado: 'pendiente',
      pagoIds: ['pago-01'], // ya está
    }
    p.planEmpresa.findMany.mockResolvedValue([planIdempotente])
    await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA)
    const updateData = p.planEmpresa.update.mock.calls[0][0].data
    // No debe duplicar pago-01
    expect(updateData.pagoIds.filter((id: string) => id === 'pago-01')).toHaveLength(1)
  })

  it('restante <= 0 → break inmediato (no procesa más planes)', async () => {
    // Pago de 0 efectivo después de aplicar crédito negativo
    // Empresa con creditoSaldo negativo no existe en práctica pero la rama sí
    // Simular: monto 50000 cubre exacto plan1, restante = 0 → no toca plan2
    p.planEmpresa.findMany.mockResolvedValue([
      planPendiente('2026-07', 50000, 'p1'),
      planPendiente('2026-08', 100000, 'p2'),
    ])
    const r = await marcarPlanPagado('emp-01', 'pago-01', 50000, FECHA)
    expect(r.mesesPagados).toEqual(['2026-07'])
    // plan2 no tocado
    const updateCalls = p.planEmpresa.update.mock.calls.map((c: any) => c[0].where.id)
    expect(updateCalls).not.toContain('p2')
  })

  it('quedan pendientes > 0 → NO llama updateMany bannerActivo', async () => {
    p.planEmpresa.findMany.mockResolvedValue([
      planPendiente('2026-07', 100000, 'p1'),
      planPendiente('2026-08', 100000, 'p2'), // este queda sin pagar
    ])
    p.planEmpresa.count.mockResolvedValue(1) // queda 1 pendiente
    await marcarPlanPagado('emp-01', 'pago-01', 100000, FECHA)
    expect(p.planEmpresa.updateMany).not.toHaveBeenCalled()
  })
})
