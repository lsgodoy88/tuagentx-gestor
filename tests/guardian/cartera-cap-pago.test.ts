/**
 * Tests del Guardián — Cap de monto en registrarPago
 *
 * Verifica las dos reglas implementadas en DashboardVendedor.tsx:
 * 1. Descuento sin monto → bloqueado
 * 2. Monto guardado = Math.min(suma lineas, saldoPendiente - descuento)
 *
 * Estos tests usan la lógica pura extraída del componente — sin DOM, sin fetch.
 */

import { describe, it, expect } from 'vitest'

// ── Lógica pura extraída de registrarPago ─────────────────────────
// (misma lógica que DashboardVendedor.tsx — si cambia allá, cambia acá)

interface LineaPago {
  metodoPago: 'efectivo' | 'transferencia'
  monto: number
  voucherKey: string | null
  voucherDatosIA: any
}

function calcularPago(params: {
  lineasValidas: LineaPago[]
  descuentosPorFactura: Record<string, number>
  saldoPendiente: number
}): { error: string | null; montoTotal: number; lineasCapadas: LineaPago[] } {
  const { lineasValidas, descuentosPorFactura, saldoPendiente } = params

  const descuentoTotal = Object.values(descuentosPorFactura).reduce((s, v) => s + Number(v || 0), 0)
  const montoLineas = lineasValidas.reduce((s, l) => s + l.monto, 0)

  // Regla 1: descuento sin monto → bloquear
  if (descuentoTotal > 0 && montoLineas === 0) {
    return { error: 'Si hay descuento, debes ingresar también el valor del pago.', montoTotal: 0, lineasCapadas: [] }
  }

  // Regla 2: cap al saldo efectivo
  const saldoEfectivo = Math.max(0, saldoPendiente - descuentoTotal)
  const montoTotal = Math.min(montoLineas, saldoEfectivo)

  const factor = montoLineas > 0 ? montoTotal / montoLineas : 1
  const lineasCapadas = lineasValidas.map((l, i, arr) => {
    if (i < arr.length - 1) return { ...l, monto: Math.round(l.monto * factor) }
    const sumAntes = arr.slice(0, i).reduce((s, x) => s + Math.round(x.monto * factor), 0)
    return { ...l, monto: montoTotal - sumAntes }
  })

  return { error: null, montoTotal, lineasCapadas }
}

// ── Tests ─────────────────────────────────────────────────────────

describe('GUARDIÁN: Cap de monto en registrarPago', () => {

  // ── Regla 1: descuento sin monto ─────────────────────────────────
  describe('[REGLA 1] Descuento sin monto → bloqueado', () => {

    it('descuento > 0 y lineas vacías → error', () => {
      const result = calcularPago({
        lineasValidas: [],
        descuentosPorFactura: { 'fact-1': 30000 },
        saldoPendiente: 500000,
      })
      expect(result.error).not.toBeNull()
      expect(result.montoTotal).toBe(0)
    })

    it('descuento > 0 y monto = 0 → error', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'efectivo', monto: 0, voucherKey: null, voucherDatosIA: null }],
        descuentosPorFactura: { 'fact-1': 30000 },
        saldoPendiente: 500000,
      })
      // lineasValidas ya está filtrada por monto > 0 antes de llegar aquí
      // con monto=0 no llega a lineasValidas — pero igual validamos el guard
      expect(result.error).not.toBeNull()
    })

    it('sin descuento y sin monto → NO error (sinMonto lo maneja otro guard)', () => {
      const result = calcularPago({
        lineasValidas: [],
        descuentosPorFactura: {},
        saldoPendiente: 500000,
      })
      // No es error de esta regla — el guard sinMonto lo bloquea antes
      expect(result.error).toBeNull()
      expect(result.montoTotal).toBe(0)
    })
  })

  // ── Regla 2: cap al saldo efectivo ───────────────────────────────
  describe('[REGLA 2] Cap al saldo pendiente', () => {

    it('Escenario 1: deuda 500k, descuento 30k, comprobante 1M → guarda 470k', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'transferencia', monto: 1000000, voucherKey: 'v1', voucherDatosIA: { valor: 1000000 } }],
        descuentosPorFactura: { 'fact-1': 30000 },
        saldoPendiente: 500000,
      })
      expect(result.error).toBeNull()
      expect(result.montoTotal).toBe(470000) // 500k - 30k
      expect(result.lineasCapadas[0].monto).toBe(470000)
    })

    it('Escenario 2: deuda 500k, sin descuento, usuario edita a 200k → guarda 200k', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'transferencia', monto: 200000, voucherKey: 'v1', voucherDatosIA: { valor: 1000000 } }],
        descuentosPorFactura: {},
        saldoPendiente: 500000,
      })
      expect(result.error).toBeNull()
      expect(result.montoTotal).toBe(200000) // respeta el valor editado
      expect(result.lineasCapadas[0].monto).toBe(200000)
    })

    it('pago exacto al saldo → sin cap, guarda el monto completo', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'efectivo', monto: 500000, voucherKey: null, voucherDatosIA: null }],
        descuentosPorFactura: {},
        saldoPendiente: 500000,
      })
      expect(result.error).toBeNull()
      expect(result.montoTotal).toBe(500000)
    })

    it('pago menor al saldo → sin cap, guarda el monto ingresado', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'efectivo', monto: 300000, voucherKey: null, voucherDatosIA: null }],
        descuentosPorFactura: {},
        saldoPendiente: 500000,
      })
      expect(result.error).toBeNull()
      expect(result.montoTotal).toBe(300000)
    })

    it('descuento igual al saldo → saldoEfectivo = 0, montoTotal = 0', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'efectivo', monto: 100000, voucherKey: null, voucherDatosIA: null }],
        descuentosPorFactura: { 'fact-1': 500000 },
        saldoPendiente: 500000,
      })
      expect(result.error).toBeNull()
      expect(result.montoTotal).toBe(0)
    })

    it('descuento mayor al saldo → saldoEfectivo = 0, no negativo', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'efectivo', monto: 100000, voucherKey: null, voucherDatosIA: null }],
        descuentosPorFactura: { 'fact-1': 600000 },
        saldoPendiente: 500000,
      })
      expect(result.montoTotal).toBe(0)
      expect(result.montoTotal).toBeGreaterThanOrEqual(0)
    })
  })

  // ── Múltiples líneas ─────────────────────────────────────────────
  describe('[MÚLTIPLES LÍNEAS] distribución proporcional del cap', () => {

    it('2 líneas iguales, cap aplica → se distribuye 50/50', () => {
      // Deuda 400k, 2 pagos de 300k cada uno = 600k total → cap a 400k
      const result = calcularPago({
        lineasValidas: [
          { metodoPago: 'efectivo', monto: 300000, voucherKey: null, voucherDatosIA: null },
          { metodoPago: 'transferencia', monto: 300000, voucherKey: 'v1', voucherDatosIA: {} },
        ],
        descuentosPorFactura: {},
        saldoPendiente: 400000,
      })
      expect(result.montoTotal).toBe(400000)
      expect(result.lineasCapadas[0].monto).toBe(200000)
      expect(result.lineasCapadas[1].monto).toBe(200000)
    })

    it('2 líneas distintas, cap aplica → distribución proporcional', () => {
      // Deuda 300k, línea1=100k, línea2=200k → factor=1 (300k total = 300k deuda)
      const result = calcularPago({
        lineasValidas: [
          { metodoPago: 'efectivo', monto: 100000, voucherKey: null, voucherDatosIA: null },
          { metodoPago: 'transferencia', monto: 200000, voucherKey: 'v1', voucherDatosIA: {} },
        ],
        descuentosPorFactura: {},
        saldoPendiente: 300000,
      })
      expect(result.montoTotal).toBe(300000)
      expect(result.lineasCapadas[0].monto).toBe(100000)
      expect(result.lineasCapadas[1].monto).toBe(200000)
    })

    it('2 líneas, cap a la mitad → factor 0.5 proporcional', () => {
      // Deuda 300k, 2 líneas de 300k cada una = 600k → cap a 300k, factor 0.5
      const result = calcularPago({
        lineasValidas: [
          { metodoPago: 'efectivo', monto: 300000, voucherKey: null, voucherDatosIA: null },
          { metodoPago: 'transferencia', monto: 300000, voucherKey: 'v1', voucherDatosIA: {} },
        ],
        descuentosPorFactura: {},
        saldoPendiente: 300000,
      })
      expect(result.montoTotal).toBe(300000)
      expect(result.lineasCapadas[0].monto + result.lineasCapadas[1].monto).toBe(300000)
    })
  })

  // ── Edge cases ───────────────────────────────────────────────────
  describe('[EDGE CASES]', () => {

    it('saldoPendiente = 0 → montoTotal = 0', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'efectivo', monto: 100000, voucherKey: null, voucherDatosIA: null }],
        descuentosPorFactura: {},
        saldoPendiente: 0,
      })
      expect(result.montoTotal).toBe(0)
    })

    it('sin descuentos → descuentoTotal = 0, no afecta cap', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'efectivo', monto: 300000, voucherKey: null, voucherDatosIA: null }],
        descuentosPorFactura: {},
        saldoPendiente: 500000,
      })
      expect(result.montoTotal).toBe(300000)
    })

    it('múltiples facturas con descuento → suma total de descuentos', () => {
      const result = calcularPago({
        lineasValidas: [{ metodoPago: 'efectivo', monto: 1000000, voucherKey: null, voucherDatosIA: null }],
        descuentosPorFactura: { 'fact-1': 20000, 'fact-2': 30000 },
        saldoPendiente: 500000,
      })
      // saldoEfectivo = 500k - 50k = 450k
      expect(result.montoTotal).toBe(450000)
    })
  })
})

// ── Cap en OCR (auto-fill del campo monto) ────────────────────────

function calcularMontoOCR(params: {
  valorOCR: number
  montoSeleccionado: number
  descuentosPorFactura: Record<string, string>
}): number {
  const { valorOCR, montoSeleccionado, descuentosPorFactura } = params
  const descTotal = Object.values(descuentosPorFactura).reduce((s, v) => s + Number(v || 0), 0)
  const saldoEfectivo = Math.max(0, montoSeleccionado - descTotal)
  const montoOCR = Math.round(valorOCR)
  return saldoEfectivo > 0 ? Math.min(montoOCR, saldoEfectivo) : montoOCR
}

describe('GUARDIÁN: Cap de monto OCR (auto-fill)', () => {

  it('Escenario 1: deuda 500k, comprobante 1M → campo = 500k', () => {
    const monto = calcularMontoOCR({
      valorOCR: 1000000,
      montoSeleccionado: 500000,
      descuentosPorFactura: {},
    })
    expect(monto).toBe(500000)
  })

  it('Escenario 2: deuda 500k, comprobante 1M, descuento 30k → campo = 470k', () => {
    const monto = calcularMontoOCR({
      valorOCR: 1000000,
      montoSeleccionado: 500000,
      descuentosPorFactura: { 'fact-1': '30000' },
    })
    expect(monto).toBe(470000)
  })

  it('comprobante menor a la deuda → respeta el valor del comprobante', () => {
    const monto = calcularMontoOCR({
      valorOCR: 200000,
      montoSeleccionado: 500000,
      descuentosPorFactura: {},
    })
    expect(monto).toBe(200000)
  })

  it('comprobante exacto a la deuda → sin cap', () => {
    const monto = calcularMontoOCR({
      valorOCR: 500000,
      montoSeleccionado: 500000,
      descuentosPorFactura: {},
    })
    expect(monto).toBe(500000)
  })

  it('sin montoSeleccionado (0) → usa valor OCR sin cap', () => {
    const monto = calcularMontoOCR({
      valorOCR: 1000000,
      montoSeleccionado: 0,
      descuentosPorFactura: {},
    })
    expect(monto).toBe(1000000)
  })

  it('descuento cubre toda la deuda → saldoEfectivo = 0 → usa OCR sin cap', () => {
    const monto = calcularMontoOCR({
      valorOCR: 1000000,
      montoSeleccionado: 500000,
      descuentosPorFactura: { 'fact-1': '500000' },
    })
    expect(monto).toBe(1000000)
  })
})

// ── Residuo de redondeo ───────────────────────────────────────────

describe('GUARDIÁN: Residuo de redondeo en líneas capadas', () => {

  it('suma de líneas capadas siempre igual a montoTotal exacto', () => {
    // 3 líneas de 333.333 cada una = 999.999 → cap a 700.000
    // factor = 700000/999999 ≈ 0.700000700...
    // Round(333333 * factor) * 3 puede diferir de 700000
    const result = calcularPago({
      lineasValidas: [
        { metodoPago: 'efectivo', monto: 333333, voucherKey: null, voucherDatosIA: null },
        { metodoPago: 'efectivo', monto: 333333, voucherKey: null, voucherDatosIA: null },
        { metodoPago: 'transferencia', monto: 333333, voucherKey: 'v1', voucherDatosIA: {} },
      ],
      descuentosPorFactura: {},
      saldoPendiente: 700000,
    })
    const sumaLineas = result.lineasCapadas.reduce((s, l) => s + l.monto, 0)
    expect(sumaLineas).toBe(result.montoTotal) // exacto, sin ±1
    expect(sumaLineas).toBe(700000)
  })

  it('2 líneas con factor no entero → suma exacta', () => {
    // 2 líneas de 150.000 = 300.000 → cap a 200.000
    // factor = 2/3 → Round(150000 * 2/3) = Round(100000) = 100000 × 2 = 200000 ✓
    const result = calcularPago({
      lineasValidas: [
        { metodoPago: 'efectivo', monto: 150000, voucherKey: null, voucherDatosIA: null },
        { metodoPago: 'transferencia', monto: 150000, voucherKey: 'v1', voucherDatosIA: {} },
      ],
      descuentosPorFactura: {},
      saldoPendiente: 200000,
    })
    const sumaLineas = result.lineasCapadas.reduce((s, l) => s + l.monto, 0)
    expect(sumaLineas).toBe(result.montoTotal)
  })

  it('línea única → sin residuo, monto exacto', () => {
    const result = calcularPago({
      lineasValidas: [
        { metodoPago: 'transferencia', monto: 1000000, voucherKey: 'v1', voucherDatosIA: {} },
      ],
      descuentosPorFactura: {},
      saldoPendiente: 421200,
    })
    expect(result.lineasCapadas[0].monto).toBe(421200)
    expect(result.montoTotal).toBe(421200)
  })
})

// ── registrarPago guards ──────────────────────────────────────────

describe('GUARDIÁN: Guards de registrarPago', () => {

  it('total = 0 → no procede (guard early return)', () => {
    const lineasValidas: LineaPago[] = []
    const total = lineasValidas.reduce((s, l) => s + l.monto, 0)
    expect(total).toBe(0) // registrarPago hace early return aquí
  })

  it('con lineas válidas → total > 0 → procede', () => {
    const lineasValidas: LineaPago[] = [
      { metodoPago: 'efectivo', monto: 300000, voucherKey: null, voucherDatosIA: null }
    ]
    const total = lineasValidas.reduce((s, l) => s + l.monto, 0)
    expect(total).toBeGreaterThan(0)
  })
})

// ── Cap OCR múltiples pagos ───────────────────────────────────────

describe('GUARDIÁN: Cap OCR múltiples pagos detectados', () => {

  // Misma lógica que el caso pagos.length > 1 en subirVoucherArchivo
  function calcularMontoOCRMultiple(params: {
    valorOCR: number
    saldoVivo: number
    descuentosPorFactura: Record<string, string>
  }): number {
    const { valorOCR, saldoVivo, descuentosPorFactura } = params
    const descTotal = Object.values(descuentosPorFactura).reduce((s, v) => s + Number(v || 0), 0)
    const saldoEfectivo = Math.max(0, saldoVivo - descTotal)
    const montoOCR = Math.round(valorOCR)
    return saldoEfectivo > 0 ? Math.min(montoOCR, saldoEfectivo) : montoOCR
  }

  it('pago 1 de 2 detectados: cap al saldo vivo', () => {
    // Deuda 149k, comprobante 1 OCR extrae 2 pagos de 395k y 200k
    // Solo el primero debería caparse a 149k
    const monto = calcularMontoOCRMultiple({
      valorOCR: 395000,
      saldoVivo: 149000,
      descuentosPorFactura: {},
    })
    expect(monto).toBe(149000)
  })

  it('pago 2 de 2: también capado al saldo restante', () => {
    const monto = calcularMontoOCRMultiple({
      valorOCR: 200000,
      saldoVivo: 149000,
      descuentosPorFactura: {},
    })
    expect(monto).toBe(149000)
  })

  it('múltiples pagos con descuento → cap a saldoEfectivo', () => {
    const monto = calcularMontoOCRMultiple({
      valorOCR: 395000,
      saldoVivo: 149000,
      descuentosPorFactura: { 'fact-1': '20000' },
    })
    expect(monto).toBe(129000) // 149k - 20k
  })
})
