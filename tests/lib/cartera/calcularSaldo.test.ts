import { describe, it, expect } from 'vitest'
import { calcularNSaldoBatch, EMPRESA_LUMELI, CORTE_LUMELI } from '@/lib/cartera/calcularSaldo'

const EMPRESA_LECHE = 'cmojhfct40000znvfaos1jy1m'

// Helpers
const deuda = (id: string, valor: number, numeroFactura = 1, extra = {}) =>
  ({ id, valor, numeroFactura, nSaldo: null, saldo: null, ...extra })

const pago = (syncDeudaId: string, monto: number, fecha = new Date('2026-07-01')) =>
  ({ syncDeudaId, montoAplicado: monto, createdAt: fecha })

// ── Rama 2: Leche — usa nSaldo persistido en BD ────────────────────────────
// nSaldo en BD es la fuente de verdad: fue calculado correctamente por
// aplicarPagoEnCache (post-pago) como saldoUptresOriginal - SUM(pagos).
// calcularNSaldoBatch lo lee y devuelve, sin recalcular desde valor.
// El nocturno (reconciliarDeuda) ya NO toca nSaldo — inmune al lag.

describe('calcularNSaldoBatch — Rama 2 (Leche)', () => {
  it('sin pagos nuestros y nSaldo en BD → devuelve nSaldo BD (saldo UpTres)', () => {
    const d = deuda('d1', 347180, 9605, { nSaldo: 347180, saldo: 347180 })
    const result = calcularNSaldoBatch([d], [], {}, EMPRESA_LECHE)
    expect(result['d1'].nSaldo).toBe(347180)
    expect(result['d1'].tienePagosLocales).toBe(false)
  })

  it('nSaldo null → fallback a saldo (crudo UpTres)', () => {
    const d = deuda('d1', 390930, 9717, { nSaldo: null, saldo: 390930 })
    const result = calcularNSaldoBatch([d], [], {}, EMPRESA_LECHE)
    expect(result['d1'].nSaldo).toBe(390930)
  })

  it('nSaldo y saldo null → fallback a valor', () => {
    const d = deuda('d1', 200000, 1, { nSaldo: null, saldo: null })
    const result = calcularNSaldoBatch([d], [], {}, EMPRESA_LECHE)
    expect(result['d1'].nSaldo).toBe(200000)
  })

  it('nSaldo correcto en BD → lo respeta aunque haya pagos registrados', () => {
    // El nSaldo en BD ya fue calculado por aplicarPagoEnCache correctamente
    // calcularNSaldoBatch lo lee y devuelve sin modificar
    const d = deuda('d1', 428815, 9469, { nSaldo: 236285, saldo: 386285 })
    const pagos = [pago('d1', 42530), pago('d1', 150000)]
    const result = calcularNSaldoBatch([d], pagos, {}, EMPRESA_LECHE)
    expect(result['d1'].nSaldo).toBe(236285)  // lee nSaldo BD, no recalcula
    expect(result['d1'].tienePagosLocales).toBe(true)
  })

  it('factura con abono previo UpTres + pago Gestor — nSaldo BD es correcto', () => {
    // Fact 8821: valor=990055, abono previo UpTres=600000, saldo_uptres=390055
    // aplicarPagoEnCache calculó: nSaldo = 390055 - 100000 = 290055
    // calcularNSaldoBatch debe respetarlo (NO calcular valor-pagos=890055)
    const d = deuda('d1', 990055, 8821, { nSaldo: 290055, saldo: 390055 })
    const pagos = [pago('d1', 100000)]
    const result = calcularNSaldoBatch([d], pagos, {}, EMPRESA_LECHE)
    expect(result['d1'].nSaldo).toBe(290055)  // correcto: saldo_uptres - pago
    expect(result['d1'].nSaldo).not.toBe(890055) // incorrecto: valor - pago
  })

  it('múltiples deudas — cada una respeta su nSaldo BD', () => {
    const d1 = deuda('d1', 428815, 9469, { nSaldo: 236285, saldo: 386285 })
    const d2 = deuda('d2', 347180, 9605, { nSaldo: 347180, saldo: 347180 })
    const d3 = deuda('d3', 390930, 9717, { nSaldo: 390930, saldo: 390930 })
    const pagos = [pago('d1', 42530), pago('d1', 150000)]
    const result = calcularNSaldoBatch([d1, d2, d3], pagos, {}, EMPRESA_LECHE)
    expect(result['d1'].nSaldo).toBe(236285)
    expect(result['d2'].nSaldo).toBe(347180)
    expect(result['d3'].nSaldo).toBe(390930)
  })

  it('nSaldo no negativo', () => {
    const d = deuda('d1', 100000, 1, { nSaldo: 0, saldo: 0 })
    const result = calcularNSaldoBatch([d], [], {}, EMPRESA_LECHE)
    expect(result['d1'].nSaldo).toBe(0)
  })
})

// ── Rama 1: Lumeli — saldoInicial - pagos post-corte ──────────────────────

describe('calcularNSaldoBatch — Rama 1 (Lumeli)', () => {
  const saldosIniciales = { 9469: 428815, 9605: 347180 }

  it('factura con saldoInicial → saldoInicial - pagos post-corte', () => {
    const d = deuda('d1', 428815, 9469)
    const fechaPostCorte = new Date(CORTE_LUMELI.getTime() + 1000)
    const pagos = [pago('d1', 100000, fechaPostCorte)]
    const result = calcularNSaldoBatch([d], pagos, saldosIniciales, EMPRESA_LUMELI)
    expect(result['d1'].nSaldo).toBe(428815 - 100000)
  })

  it('pagos PRE-corte no se descuentan (ya incluidos en saldoInicial)', () => {
    const d = deuda('d1', 428815, 9469)
    const fechaPreCorte = new Date(CORTE_LUMELI.getTime() - 1000)
    const pagos = [pago('d1', 100000, fechaPreCorte)]
    const result = calcularNSaldoBatch([d], pagos, saldosIniciales, EMPRESA_LUMELI)
    expect(result['d1'].nSaldo).toBe(428815)
  })

  it('factura sin saldoInicial (nueva post-corte) → fallback a nSaldo BD', () => {
    const d = deuda('d1', 200000, 9999, { nSaldo: 180000, saldo: 180000 })
    const result = calcularNSaldoBatch([d], [], saldosIniciales, EMPRESA_LUMELI)
    expect(result['d1'].nSaldo).toBe(180000)
  })

  it('saldo no negativo', () => {
    const d = deuda('d1', 428815, 9469)
    const fechaPost = new Date(CORTE_LUMELI.getTime() + 1000)
    const pagos = [pago('d1', 500000, fechaPost)]
    const result = calcularNSaldoBatch([d], pagos, saldosIniciales, EMPRESA_LUMELI)
    expect(result['d1'].nSaldo).toBe(0)
  })
})
