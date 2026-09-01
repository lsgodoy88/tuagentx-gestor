import { describe, it, expect } from 'vitest'

function calcularNuevoSaldo(valor: number, retencion: number, descuento: number, totalAbono: number) {
  const r = isNaN(retencion) ? 0 : retencion
  const d = isNaN(descuento) ? 0 : descuento
  return Math.max(0, valor - r - d - totalAbono)
}

function calcularSaldoModal(valor: number, retencion: number, descuento: number, abonos: {valor: number}[]) {
  const total = abonos.reduce((s, a) => s + a.valor, 0)
  return calcularNuevoSaldo(valor, retencion, descuento, total)
}

describe('calcularNuevoSaldo — API abono', () => {
  it('caso base: valor - abono', () => {
    expect(calcularNuevoSaldo(667777, 0, 0, 500000)).toBe(167777)
  })
  it('saldo no negativo', () => {
    expect(calcularNuevoSaldo(100000, 0, 0, 150000)).toBe(0)
  })
  it('descuenta retención y descuento', () => {
    expect(calcularNuevoSaldo(1000000, 50000, 20000, 200000)).toBe(730000)
  })
  it('abono exacto = saldo 0', () => {
    expect(calcularNuevoSaldo(500000, 0, 0, 500000)).toBe(0)
  })
  it('retención NaN tratada como 0', () => {
    expect(calcularNuevoSaldo(500000, NaN, 0, 100000)).toBe(400000)
  })
  it('retención parcial + abono parcial', () => {
    expect(calcularNuevoSaldo(667777, 666, 0, 500000)).toBe(167111)
  })
  it('con descuento', () => {
    expect(calcularNuevoSaldo(1000000, 0, 100000, 400000)).toBe(500000)
  })
  it('sin ningún descuento ni abono', () => {
    expect(calcularNuevoSaldo(1000000, 0, 0, 0)).toBe(1000000)
  })
})

describe('calcularSaldoModal — lógica del modal', () => {
  it('sin abonos previos = valor completo', () => {
    expect(calcularSaldoModal(1000000, 0, 0, [])).toBe(1000000)
  })
  it('un abono parcial', () => {
    expect(calcularSaldoModal(1000000, 0, 0, [{valor: 300000}])).toBe(700000)
  })
  it('múltiples abonos acumulados', () => {
    expect(calcularSaldoModal(1000000, 0, 0, [{valor: 200000}, {valor: 300000}])).toBe(500000)
  })
  it('abonos + retención + descuento', () => {
    expect(calcularSaldoModal(1000000, 50000, 20000, [{valor: 200000}, {valor: 100000}])).toBe(630000)
  })
  it('abonos cubren todo', () => {
    expect(calcularSaldoModal(500000, 0, 0, [{valor: 300000}, {valor: 200000}])).toBe(0)
  })
  it('abonos exceden valor: saldo = 0', () => {
    expect(calcularSaldoModal(500000, 0, 0, [{valor: 600000}])).toBe(0)
  })
})
