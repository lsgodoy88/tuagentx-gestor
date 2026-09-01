/**
 * Tests de integración — marcarPlanPagado contra BD real (staging)
 * Empresa aislada: test-intg-01 — se limpia antes y después de cada test
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { marcarPlanPagado } from '@/lib/billing/marcarPagado'

const EMP = 'test-intg-01'
const FECHA = new Date('2026-09-10T12:00:00Z')

async function resetEmpresa() {
  await (prisma as any).planEmpresa.deleteMany({ where: { empresaId: EMP } })
  await (prisma as any).empresa.update({
    where: { id: EMP },
    data: { creditoSaldo: 0, planFin: null },
  })
}

async function crearPlan(mes: string, saldo: number, id?: string) {
  return (prisma as any).planEmpresa.create({
    data: {
      id: id ?? `test-plan-${mes}`,
      empresaId: EMP,
      mes,
      saldo,
      montoOriginal: saldo,
      monto: saldo,
      estado: 'pendiente',
      pagoIds: [],
      desglose: [],
      fechaCorte: new Date('2026-09-05T00:00:00Z'),
      fechaLimite: new Date('2026-09-10T00:00:00Z'),
    },
  })
}

beforeEach(async () => { await resetEmpresa() })
afterEach(async () => { await resetEmpresa() })

describe('marcarPlanPagado — integración BD real', () => {
  it('FIFO: pago exacto → estado pagado, saldo=0, condition BD correcta', async () => {
    await crearPlan('2026-08', 125000)
    const r = await marcarPlanPagado(EMP, 'pago-intg-01', 125000, FECHA)

    expect(r.ok).toBe(true)
    expect(r.mesesPagados).toEqual(['2026-08'])
    expect(r.excedente).toBe(0)

    const plan = await (prisma as any).planEmpresa.findUnique({ where: { id: 'test-plan-2026-08' } })
    expect(plan.estado).toBe('pagado')
    expect(plan.saldo).toBe(0)
    expect(plan.pagoId).toBe('pago-intg-01')
    expect(plan.voucherNum).toMatch(/^PM2609\d{3}$/)
  })

  it('FIFO: pago mayor → excedente en creditoSaldo empresa', async () => {
    await crearPlan('2026-08', 100000)
    const r = await marcarPlanPagado(EMP, 'pago-intg-02', 150000, FECHA)

    expect(r.excedente).toBe(50000)

    const emp = await (prisma as any).empresa.findUnique({ where: { id: EMP } })
    expect(emp.creditoSaldo).toBe(50000)
  })

  it('FIFO: pago parcial → saldo reducido, estado sigue pendiente', async () => {
    await crearPlan('2026-08', 125000)
    const r = await marcarPlanPagado(EMP, 'pago-intg-03', 80000, FECHA)

    expect(r.mesesPagados).toHaveLength(0)

    const plan = await (prisma as any).planEmpresa.findUnique({ where: { id: 'test-plan-2026-08' } })
    expect(plan.estado).toBe('pendiente')
    expect(plan.saldo).toBe(45000)
  })

  it('FIFO: pago cubre 2 meses en orden ASC', async () => {
    await crearPlan('2026-07', 100000, 'test-plan-2026-07')
    await crearPlan('2026-08', 100000, 'test-plan-2026-08')
    const r = await marcarPlanPagado(EMP, 'pago-intg-04', 200000, FECHA)

    expect(r.mesesPagados).toEqual(['2026-07', '2026-08'])

    const p07 = await (prisma as any).planEmpresa.findUnique({ where: { id: 'test-plan-2026-07' } })
    const p08 = await (prisma as any).planEmpresa.findUnique({ where: { id: 'test-plan-2026-08' } })
    expect(p07.estado).toBe('pagado')
    expect(p08.estado).toBe('pagado')
  })

  it('creditoSaldo existente se suma al pago → cubre plan completo', async () => {
    await (prisma as any).empresa.update({ where: { id: EMP }, data: { creditoSaldo: 25000 } })
    await crearPlan('2026-08', 100000)
    const r = await marcarPlanPagado(EMP, 'pago-intg-05', 75000, FECHA)

    expect(r.mesesPagados).toEqual(['2026-08'])
    expect(r.excedente).toBe(0)

    const emp = await (prisma as any).empresa.findUnique({ where: { id: EMP } })
    expect(emp.creditoSaldo).toBe(0)
  })

  it('planFin se actualiza al mes siguiente del último mes pagado', async () => {
    await crearPlan('2026-09', 100000)
    await marcarPlanPagado(EMP, 'pago-intg-06', 100000, FECHA)

    const emp = await (prisma as any).empresa.findUnique({ where: { id: EMP } })
    expect(new Date(emp.planFin)).toEqual(new Date(Date.UTC(2026, 9, 6))) // Oct 6 — gracia hasta día 5
  })

  it('planFin no retrocede si ya era mayor', async () => {
    const planFinFuturo = new Date(Date.UTC(2027, 5, 1)) // Jun 2027
    await (prisma as any).empresa.update({ where: { id: EMP }, data: { planFin: planFinFuturo } })
    await crearPlan('2026-09', 100000)
    await marcarPlanPagado(EMP, 'pago-intg-07', 100000, FECHA)

    const emp = await (prisma as any).empresa.findUnique({ where: { id: EMP } })
    expect(new Date(emp.planFin)).toEqual(planFinFuturo)
  })

  it('idempotencia: pagoId duplicado no se repite en pagoIds', async () => {
    await crearPlan('2026-08', 100000)
    await marcarPlanPagado(EMP, 'pago-intg-08', 50000, FECHA)
    // Segunda llamada con mismo pagoId
    await marcarPlanPagado(EMP, 'pago-intg-08', 50000, FECHA)

    const plan = await (prisma as any).planEmpresa.findUnique({ where: { id: 'test-plan-2026-08' } })
    const ocurrencias = plan.pagoIds.filter((id: string) => id === 'pago-intg-08').length
    expect(ocurrencias).toBe(1)
  })

  it('quedanPendientes=0 → banner desactivado en todos los planes', async () => {
    await crearPlan('2026-08', 100000)
    await marcarPlanPagado(EMP, 'pago-intg-09', 100000, FECHA)

    const plan = await (prisma as any).planEmpresa.findUnique({ where: { id: 'test-plan-2026-08' } })
    expect(plan.bannerActivo).toBe(false)
  })
})
