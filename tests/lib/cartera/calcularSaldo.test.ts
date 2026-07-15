import { describe, it, expect } from 'vitest'
import { calcularNSaldoBatch } from '@/lib/cartera/calcularSaldo'


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
    const result = calcularNSaldoBatch([d], [])
    expect(result['d1'].nSaldo).toBe(347180)
    expect(result['d1'].tienePagosLocales).toBe(false)
  })

  it('nSaldo null → fallback a saldo (crudo UpTres)', () => {
    const d = deuda('d1', 390930, 9717, { nSaldo: null, saldo: 390930 })
    const result = calcularNSaldoBatch([d], [])
    expect(result['d1'].nSaldo).toBe(390930)
  })

  it('nSaldo y saldo null → fallback a valor', () => {
    const d = deuda('d1', 200000, 1, { nSaldo: null, saldo: null })
    const result = calcularNSaldoBatch([d], [])
    expect(result['d1'].nSaldo).toBe(200000)
  })

  it('nSaldo correcto en BD → lo respeta aunque haya pagos registrados', () => {
    // El nSaldo en BD ya fue calculado por aplicarPagoEnCache correctamente
    // calcularNSaldoBatch lo lee y devuelve sin modificar
    const d = deuda('d1', 428815, 9469, { nSaldo: 236285, saldo: 386285 })
    const pagos = [pago('d1', 42530), pago('d1', 150000)]
    const result = calcularNSaldoBatch([d], pagos)
    expect(result['d1'].nSaldo).toBe(236285)  // lee nSaldo BD, no recalcula
    expect(result['d1'].tienePagosLocales).toBe(true)
  })

  it('factura con abono previo UpTres + pago Gestor — nSaldo BD es correcto', () => {
    // Fact 8821: valor=990055, abono previo UpTres=600000, saldo_uptres=390055
    // aplicarPagoEnCache calculó: nSaldo = 390055 - 100000 = 290055
    // calcularNSaldoBatch debe respetarlo (NO calcular valor-pagos=890055)
    const d = deuda('d1', 990055, 8821, { nSaldo: 290055, saldo: 390055 })
    const pagos = [pago('d1', 100000)]
    const result = calcularNSaldoBatch([d], pagos)
    expect(result['d1'].nSaldo).toBe(290055)  // correcto: saldo_uptres - pago
    expect(result['d1'].nSaldo).not.toBe(890055) // incorrecto: valor - pago
  })

  it('múltiples deudas — cada una respeta su nSaldo BD', () => {
    const d1 = deuda('d1', 428815, 9469, { nSaldo: 236285, saldo: 386285 })
    const d2 = deuda('d2', 347180, 9605, { nSaldo: 347180, saldo: 347180 })
    const d3 = deuda('d3', 390930, 9717, { nSaldo: 390930, saldo: 390930 })
    const pagos = [pago('d1', 42530), pago('d1', 150000)]
    const result = calcularNSaldoBatch([d1, d2, d3], pagos)
    expect(result['d1'].nSaldo).toBe(236285)
    expect(result['d2'].nSaldo).toBe(347180)
    expect(result['d3'].nSaldo).toBe(390930)
  })

  it('nSaldo no negativo', () => {
    const d = deuda('d1', 100000, 1, { nSaldo: 0, saldo: 0 })
    const result = calcularNSaldoBatch([d], [])
    expect(result['d1'].nSaldo).toBe(0)
  })
})

// ── Rama 1 eliminada — migrada a Rama 0 (nSaldoBase) — ver tests Rama 0 abajo ──

// ── Rama 0: sync inicial vendedor — nSaldoBase - pagos post-nSaldoBaseAt ──

describe('calcularNSaldoBatch — Rama 0 (sync inicial vendedor)', () => {
  const BASE_AT = new Date('2026-07-04T05:00:00Z')

  const deudaConBase = (id: string, valor: number, nSaldoBase: number, extra = {}) =>
    ({ id, valor, numeroFactura: 1, nSaldo: valor, saldo: valor, nSaldoBase, nSaldoBaseAt: BASE_AT, ...extra })

  it('sin pagos posteriores → devuelve nSaldoBase exacto', () => {
    const d = deudaConBase('d1', 1018200, 708200)
    const result = calcularNSaldoBatch([d], [])
    expect(result['d1'].nSaldo).toBe(708200)
  })

  it('pago posterior a nSaldoBaseAt → se descuenta de nSaldoBase', () => {
    const d = deudaConBase('d1', 1018200, 708200)
    const pagoPost = pago('d1', 100000, new Date('2026-07-10T10:00:00Z'))
    const result = calcularNSaldoBatch([d], [pagoPost])
    expect(result['d1'].nSaldo).toBe(608200)
  })

  it('pago ANTERIOR a nSaldoBaseAt → NO se descuenta (ya en nSaldoBase)', () => {
    const d = deudaConBase('d1', 1018200, 708200)
    const pagoAntes = pago('d1', 100000, new Date('2026-07-01T10:00:00Z'))
    const result = calcularNSaldoBatch([d], [pagoAntes])
    expect(result['d1'].nSaldo).toBe(708200)
  })

  it('múltiples pagos — solo los posteriores se descuentan', () => {
    const d = deudaConBase('d1', 1018200, 708200)
    const pagoAntes = pago('d1', 50000, new Date('2026-07-01T10:00:00Z'))
    const pagoPost1 = pago('d1', 100000, new Date('2026-07-10T10:00:00Z'))
    const pagoPost2 = pago('d1', 80000, new Date('2026-07-12T10:00:00Z'))
    const result = calcularNSaldoBatch([d], [pagoAntes, pagoPost1, pagoPost2])
    expect(result['d1'].nSaldo).toBe(708200 - 100000 - 80000)
  })

  it('Rama 0 aplica independientemente de empresa', () => {
    const d = deudaConBase('d1', 428815, 350000, { numeroFactura: 9469 })
    const pagoPost = pago('d1', 50000, new Date('2026-07-10T10:00:00Z'))
    const result = calcularNSaldoBatch([d], [pagoPost])
    expect(result['d1'].nSaldo).toBe(300000) // 350000 - 50000
  })

  it('Rama 0 funciona también para Leche', () => {
    const d = deudaConBase('d1', 1017600, 497600, { numeroFactura: 3418 })
    const pagoPost = pago('d1', 200000, new Date('2026-07-10T10:00:00Z'))
    const result = calcularNSaldoBatch([d], [pagoPost])
    expect(result['d1'].nSaldo).toBe(297600)
  })

  it('resultado no negativo aunque pagos superen nSaldoBase', () => {
    const d = deudaConBase('d1', 1000000, 200000)
    const pagoPost = pago('d1', 300000, new Date('2026-07-10T10:00:00Z'))
    const result = calcularNSaldoBatch([d], [pagoPost])
    expect(result['d1'].nSaldo).toBe(0)
  })

  it('deuda sin nSaldoBase → no entra a Rama 0 (cae en Rama 2)', () => {
    const d = deuda('d1', 500000, 1, { nSaldo: 500000, saldo: 500000, nSaldoBase: null, nSaldoBaseAt: null })
    const result = calcularNSaldoBatch([d], [])
    expect(result['d1'].nSaldo).toBe(500000) // Rama 2
  })

  it('mezcla: una deuda con base y otra sin — cada una por su rama', () => {
    const dConBase = deudaConBase('d1', 1018200, 708200)
    const dSinBase = deuda('d2', 500000, 2, { nSaldo: 500000, saldo: 500000 })
    const pagoPost = pago('d1', 100000, new Date('2026-07-10T10:00:00Z'))
    const result = calcularNSaldoBatch([dConBase, dSinBase], [pagoPost])
    expect(result['d1'].nSaldo).toBe(608200) // Rama 0
    expect(result['d2'].nSaldo).toBe(500000) // Rama 2
  })
})
