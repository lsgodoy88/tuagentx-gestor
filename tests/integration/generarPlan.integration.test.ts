/**
 * Tests de integración — generarPlanMes contra BD real (staging)
 * Empresa aislada: test-intg-01 (2 vendedores, 1 supervisor, 0 resto)
 * Precios reales en BD: vendedor=30000, supervisor=20000
 * Monto esperado: 2×30000 + 1×20000 = 80000
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { generarPlanMes } from '@/lib/billing/generarPlan'

const EMP = 'test-intg-02'
const MES_TEST = '2099-01' // mes futuro improbable — no choca con datos reales

// Precios reales en BD (leídos antes de correr tests)
let PRECIO_VENDEDOR = 0
let PRECIO_SUPERVISOR = 0
let MONTO_ESPERADO = 0 // 2×vendedor + 1×supervisor

async function limpiarPlan() {
  await (prisma as any).planEmpresa.deleteMany({
    where: { empresaId: EMP, mes: MES_TEST },
  })
}

async function resetEmpresa() {
  await (prisma as any).empresa.update({
    where: { id: EMP },
    data: { creditoSaldo: 0, montoNegociado: null },
  })
}

beforeEach(async () => {
  // Leer precios reales de BD
  const precios = await (prisma as any).precioRol.findMany({
    where: { rol: { in: ['vendedor', 'supervisor'] } },
    select: { rol: true, precio: true },
  })
  PRECIO_VENDEDOR = precios.find((p: any) => p.rol === 'vendedor')?.precio ?? 0
  PRECIO_SUPERVISOR = precios.find((p: any) => p.rol === 'supervisor')?.precio ?? 0
  MONTO_ESPERADO = 2 * PRECIO_VENDEDOR + 1 * PRECIO_SUPERVISOR

  await limpiarPlan()
  await resetEmpresa()
})

afterEach(async () => {
  await limpiarPlan()
  await resetEmpresa()
})

describe('generarPlanMes — integración BD real', () => {
  it('genera plan con monto correcto por slots (2 vend + 1 sup)', async () => {
    const r = await generarPlanMes(MES_TEST, EMP)

    expect(r.ok).toBe(true)
    expect(r.resultados).toHaveLength(1)

    const res = r.resultados[0]
    expect(res.accion).toBe('creado')
    expect(res.montoBase).toBe(MONTO_ESPERADO)
    expect(res.monto).toBe(MONTO_ESPERADO)
    expect(res.creditoUsado).toBe(0)

    // Verificar en BD
    const plan = await (prisma as any).planEmpresa.findUnique({
      where: { empresaId_mes: { empresaId: EMP, mes: MES_TEST } },
    })
    expect(plan).not.toBeNull()
    expect(plan.monto).toBe(MONTO_ESPERADO)
    expect(plan.montoOriginal).toBe(MONTO_ESPERADO)
    expect(plan.saldo).toBe(MONTO_ESPERADO)
    expect(plan.estado).toBe('pendiente')
  })

  it('desglose incluye vendedor y supervisor con precios correctos', async () => {
    const r = await generarPlanMes(MES_TEST, EMP)
    const res = r.resultados[0]

    const itemVend = res.desglose.find((d: any) => d.rol === 'vendedor')
    const itemSup = res.desglose.find((d: any) => d.rol === 'supervisor')

    expect(itemVend).toBeDefined()
    expect(itemVend.cantidad).toBe(2)
    expect(itemVend.precioUnitario).toBe(PRECIO_VENDEDOR)
    expect(itemVend.subtotal).toBe(2 * PRECIO_VENDEDOR)

    expect(itemSup).toBeDefined()
    expect(itemSup.cantidad).toBe(1)
    expect(itemSup.precioUnitario).toBe(PRECIO_SUPERVISOR)
    expect(itemSup.subtotal).toBe(PRECIO_SUPERVISOR)
  })

  it('plan ya existente → accion=ya_existe, no crea duplicado', async () => {
    await generarPlanMes(MES_TEST, EMP)
    const r2 = await generarPlanMes(MES_TEST, EMP)

    expect(r2.resultados[0].accion).toBe('ya_existe')

    // Solo 1 plan en BD
    const planes = await (prisma as any).planEmpresa.findMany({
      where: { empresaId: EMP, mes: MES_TEST },
    })
    expect(planes).toHaveLength(1)
  })

  it('creditoSaldo descuenta del monto final', async () => {
    const credito = 10000
    await (prisma as any).empresa.update({
      where: { id: EMP },
      data: { creditoSaldo: credito },
    })

    const r = await generarPlanMes(MES_TEST, EMP)
    const res = r.resultados[0]

    expect(res.montoBase).toBe(MONTO_ESPERADO)
    expect(res.monto).toBe(MONTO_ESPERADO - credito)
    expect(res.creditoUsado).toBe(credito)

    const plan = await (prisma as any).planEmpresa.findUnique({
      where: { empresaId_mes: { empresaId: EMP, mes: MES_TEST } },
    })
    expect(plan.monto).toBe(MONTO_ESPERADO - credito)
    expect(plan.montoOriginal).toBe(MONTO_ESPERADO) // inmutable

    // creditoSaldo empresa reducido
    const emp = await (prisma as any).empresa.findUnique({ where: { id: EMP } })
    expect(emp.creditoSaldo).toBe(0)
  })

  it('crédito mayor al monto → plan en 0, estado=pagado', async () => {
    await (prisma as any).empresa.update({
      where: { id: EMP },
      data: { creditoSaldo: MONTO_ESPERADO + 10000 },
    })

    const r = await generarPlanMes(MES_TEST, EMP)
    const res = r.resultados[0]

    expect(res.monto).toBe(0)
    expect(res.creditoUsado).toBe(MONTO_ESPERADO)

    const plan = await (prisma as any).planEmpresa.findUnique({
      where: { empresaId_mes: { empresaId: EMP, mes: MES_TEST } },
    })
    expect(plan.estado).toBe('pagado')
    expect(plan.saldo).toBe(0)

    // Crédito restante en empresa
    const emp = await (prisma as any).empresa.findUnique({ where: { id: EMP } })
    expect(emp.creditoSaldo).toBe(10000)
  })

  it('montoNegociado tiene prioridad sobre slots', async () => {
    const NEGOCIADO = 55000
    await (prisma as any).empresa.update({
      where: { id: EMP },
      data: { montoNegociado: NEGOCIADO },
    })

    const r = await generarPlanMes(MES_TEST, EMP)
    const res = r.resultados[0]

    expect(res.montoBase).toBe(NEGOCIADO)
    expect(res.desglose[0].rol).toBe('negociado')

    const plan = await (prisma as any).planEmpresa.findUnique({
      where: { empresaId_mes: { empresaId: EMP, mes: MES_TEST } },
    })
    expect(plan.montoOriginal).toBe(NEGOCIADO)
  })

  it('empresa exenta no genera plan', async () => {
    // superadmin-001 está en EMPRESAS_EXENTAS
    const r = await generarPlanMes(MES_TEST, 'superadmin-001')
    expect(r.resultados).toHaveLength(0)
  })

  it('plan existente pendiente + negociación cambió → accion=negociacion_actualizada', async () => {
    await generarPlanMes(MES_TEST, EMP)
    const NEGOCIADO = 55000
    await (prisma as any).empresa.update({ where: { id: EMP }, data: { montoNegociado: NEGOCIADO } })

    const r2 = await generarPlanMes(MES_TEST, EMP)
    expect(r2.resultados[0].accion).toBe('negociacion_actualizada')
    expect(r2.resultados[0].monto).toBe(NEGOCIADO)

    const plan = await (prisma as any).planEmpresa.findUnique({ where: { empresaId_mes: { empresaId: EMP, mes: MES_TEST } } })
    expect(plan.monto).toBe(NEGOCIADO)
    expect(plan.montoOriginal).toBe(NEGOCIADO)
    expect(plan.saldo).toBe(NEGOCIADO)
    expect(plan.desglose[0].rol).toBe('negociado')
  })

  it('plan existente pendiente + negociación NO cambió → accion=ya_existe', async () => {
    const NEGOCIADO = 55000
    await (prisma as any).empresa.update({ where: { id: EMP }, data: { montoNegociado: NEGOCIADO } })
    await generarPlanMes(MES_TEST, EMP)
    const r2 = await generarPlanMes(MES_TEST, EMP)
    expect(r2.resultados[0].accion).toBe('ya_existe')
  })

  it('plan pagado + negociación cambió → no modifica', async () => {
    await generarPlanMes(MES_TEST, EMP)
    await (prisma as any).planEmpresa.update({
      where: { empresaId_mes: { empresaId: EMP, mes: MES_TEST } },
      data: { estado: 'pagado', saldo: 0 },
    })
    await (prisma as any).empresa.update({ where: { id: EMP }, data: { montoNegociado: 99999 } })

    const r2 = await generarPlanMes(MES_TEST, EMP)
    expect(r2.resultados[0].accion).toBe('ya_existe')

    const plan = await (prisma as any).planEmpresa.findUnique({ where: { empresaId_mes: { empresaId: EMP, mes: MES_TEST } } })
    expect(plan.estado).toBe('pagado')
    expect(plan.monto).toBe(MONTO_ESPERADO)
  })

  it('negociación con abono parcial → saldo correcto tras cambio de monto', async () => {
    const NEGOCIADO = 55000
    const ABONO = 20000
    await (prisma as any).empresa.update({ where: { id: EMP }, data: { montoNegociado: NEGOCIADO } })
    await generarPlanMes(MES_TEST, EMP)
    await (prisma as any).planEmpresa.update({
      where: { empresaId_mes: { empresaId: EMP, mes: MES_TEST } },
      data: { saldo: NEGOCIADO - ABONO },
    })

    const NEGOCIADO2 = 60000
    await (prisma as any).empresa.update({ where: { id: EMP }, data: { montoNegociado: NEGOCIADO2 } })
    await generarPlanMes(MES_TEST, EMP)

    const plan = await (prisma as any).planEmpresa.findUnique({ where: { empresaId_mes: { empresaId: EMP, mes: MES_TEST } } })
    expect(plan.montoOriginal).toBe(NEGOCIADO2)
    expect(plan.saldo).toBe(NEGOCIADO2 - ABONO) // 40000
  })
})
