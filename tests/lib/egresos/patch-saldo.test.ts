import { describe, it, expect } from 'vitest'

/**
 * Simula la desestructuración del PATCH en /api/egresos/route.ts:
 *   const { id, saldo: _s, abonoPago: _a, ...data } = body
 * Verifica que `saldo` y `abonoPago` nunca lleguen al UPDATE de Prisma.
 */
function buildPatchData(body: Record<string, unknown>) {
  const { id, saldo: _s, abonoPago: _a, ...data } = body
  return { id, data }
}

describe('PATCH /api/egresos — saldo y abonoPago excluidos del UPDATE', () => {
  it('no incluye saldo en data', () => {
    const { data } = buildPatchData({ id: 'x', concepto: 'NOMINA', saldo: 500000 })
    expect(data).not.toHaveProperty('saldo')
  })

  it('no incluye abonoPago en data', () => {
    const { data } = buildPatchData({ id: 'x', concepto: 'NOMINA', abonoPago: 200000 })
    expect(data).not.toHaveProperty('abonoPago')
  })

  it('campos legítimos pasan normalmente', () => {
    const { data } = buildPatchData({ id: 'x', concepto: 'ARRIENDO', estado: 'ok', autorizado: true, saldo: 0, abonoPago: 100000 })
    expect(data.concepto).toBe('ARRIENDO')
    expect(data.estado).toBe('ok')
    expect(data.autorizado).toBe(true)
  })

  it('body sin saldo ni abonoPago no falla', () => {
    const { data } = buildPatchData({ id: 'x', concepto: 'SERVICIOS' })
    expect(data).not.toHaveProperty('saldo')
    expect(data).not.toHaveProperty('abonoPago')
    expect(data.concepto).toBe('SERVICIOS')
  })

  it('id se extrae correctamente', () => {
    const { id, data } = buildPatchData({ id: 'egr_123', concepto: 'NOMINA', saldo: 999 })
    expect(id).toBe('egr_123')
    expect(data).not.toHaveProperty('id')
  })
})

/**
 * Invariante: saldo se recalcula en /api/egresos/abono como:
 *   saldo = MAX(0, valor - retencion - totalAbono - descuento)
 * El PATCH nunca debe tocar este campo.
 */
describe('Invariante saldo — fuente única: /api/egresos/abono', () => {
  function calcSaldo(valor: number, retencion: number, descuento: number, totalAbono: number) {
    return Math.max(0, valor - retencion - totalAbono - descuento)
  }

  it('abono parcial: saldo = valor - abono', () => {
    expect(calcSaldo(1000000, 0, 0, 400000)).toBe(600000)
  })

  it('abono total: saldo = 0', () => {
    expect(calcSaldo(500000, 0, 0, 500000)).toBe(0)
  })

  it('abono > valor: saldo no negativo', () => {
    expect(calcSaldo(100000, 0, 0, 200000)).toBe(0)
  })

  it('con retención: saldo = valor - retencion - abono', () => {
    expect(calcSaldo(1000000, 50000, 0, 300000)).toBe(650000)
  })

  it('con descuento: saldo = valor - descuento - abono', () => {
    expect(calcSaldo(1000000, 0, 100000, 300000)).toBe(600000)
  })

  it('caso real producción: saldo pisado corregido', () => {
    // Antes del fix: PATCH mandaba saldo=valor (stale), pisando el cálculo correcto
    // Post-fix: solo /abono controla saldo
    const valorEgreso = 667777
    const abonos = [{ valor: 500000 }]
    const totalAbono = abonos.reduce((s, a) => s + a.valor, 0)
    const saldoCorrecto = calcSaldo(valorEgreso, 666, 0, totalAbono)
    const saldoStaleDelFrontend = valorEgreso // lo que mandaba el PATCH antes del fix
    expect(saldoCorrecto).toBeLessThan(saldoStaleDelFrontend)
    expect(saldoCorrecto).toBe(167111)
  })
})
