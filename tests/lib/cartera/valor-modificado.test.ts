import { describe, it, expect } from 'vitest'

// Lógica extraída de cartera/page.tsx — detección de valor modificado en lineasPago
function hayValorModificado(lineasPago: any): boolean {
  if (!Array.isArray(lineasPago)) return false
  return lineasPago.some((l: any) =>
    l.valorModificado ||
    (l.voucherDatosIA?.valor != null && Number(l.monto) !== Number(l.voucherDatosIA.valor))
  )
}

describe('hayValorModificado', () => {

  describe('sin lineasPago', () => {
    it('null → false', () => expect(hayValorModificado(null)).toBe(false))
    it('undefined → false', () => expect(hayValorModificado(undefined)).toBe(false))
    it('array vacío → false', () => expect(hayValorModificado([])).toBe(false))
    it('string → false', () => expect(hayValorModificado('invalid')).toBe(false))
  })

  describe('pago efectivo (sin voucher)', () => {
    it('efectivo sin voucherDatosIA → false', () => {
      expect(hayValorModificado([
        { metodoPago: 'efectivo', monto: 200000, voucherKey: null, voucherDatosIA: null }
      ])).toBe(false)
    })
  })

  describe('transferencia — monto igual al comprobante', () => {
    it('monto number === valor IA number → false', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: 600000, voucherDatosIA: { valor: 600000 } }
      ])).toBe(false)
    })

    it('monto string === valor IA number → false (normalización Number())', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: '600000', voucherDatosIA: { valor: 600000 } }
      ])).toBe(false)
    })

    it('monto number === valor IA string → false (normalización Number())', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: 600000, voucherDatosIA: { valor: '600000' } }
      ])).toBe(false)
    })

    it('monto con decimales igual → false', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: 200000.0, voucherDatosIA: { valor: 200000 } }
      ])).toBe(false)
    })
  })

  describe('transferencia — monto menor al comprobante (modificado)', () => {
    it('monto < valor IA → true', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: 200000, voucherDatosIA: { valor: 600000 } }
      ])).toBe(true)
    })

    it('monto string < valor IA number → true', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: '200000', voucherDatosIA: { valor: 600000 } }
      ])).toBe(true)
    })

    it('flag valorModificado: true aunque montos iguales → true', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: 600000, voucherDatosIA: { valor: 600000 }, valorModificado: true }
      ])).toBe(true)
    })
  })

  describe('múltiples líneas (mixto)', () => {
    it('efectivo + transferencia sin modificar → false', () => {
      expect(hayValorModificado([
        { metodoPago: 'efectivo', monto: 100000, voucherDatosIA: null },
        { metodoPago: 'transferencia', monto: 200000, voucherDatosIA: { valor: 200000 } }
      ])).toBe(false)
    })

    it('efectivo + transferencia modificada → true', () => {
      expect(hayValorModificado([
        { metodoPago: 'efectivo', monto: 100000, voucherDatosIA: null },
        { metodoPago: 'transferencia', monto: 200000, voucherDatosIA: { valor: 600000 } }
      ])).toBe(true)
    })

    it('dos transferencias, solo una modificada → true', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: 300000, voucherDatosIA: { valor: 300000 } },
        { metodoPago: 'transferencia', monto: 100000, voucherDatosIA: { valor: 300000 } }
      ])).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('voucherDatosIA.valor = null → no cuenta como modificado', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: 200000, voucherDatosIA: { valor: null } }
      ])).toBe(false)
    })

    it('voucherDatosIA sin campo valor → false', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: 200000, voucherDatosIA: { banco: 'Nequi' } }
      ])).toBe(false)
    })

    it('monto 0 con valor IA 0 → false', () => {
      expect(hayValorModificado([
        { metodoPago: 'transferencia', monto: 0, voucherDatosIA: { valor: 0 } }
      ])).toBe(false)
    })
  })
})
