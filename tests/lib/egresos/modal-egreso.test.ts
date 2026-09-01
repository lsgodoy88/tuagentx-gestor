import { describe, it, expect } from 'vitest'

// Lógica de cancelación de fila nueva
function debeEliminarFila(fila: { esNueva: boolean; valor: string }) {
  return fila.esNueva && !fila.valor
}

// Lógica borde rojo proveedor
function bordeRojoProveedor(proveedorNoEncontrado: boolean, proveedorSel: any) {
  return proveedorNoEncontrado && !proveedorSel
}

// Lógica saldo modal (valor - retención - descuento - totalAbonos)
function calcularSaldoModal(valor: number, retencion: number, descuento: number, abonos: { valor: number }[]) {
  const total = abonos.reduce((s, a) => s + a.valor, 0)
  return Math.max(0, valor - (isNaN(retencion) ? 0 : retencion) - (isNaN(descuento) ? 0 : descuento) - total)
}

describe('Cancelación fila nueva en egresos', () => {
  it('fila nueva sin valor → eliminar al cancelar', () => {
    expect(debeEliminarFila({ esNueva: true, valor: '' })).toBe(true)
  })
  it('fila nueva con valor → no eliminar', () => {
    expect(debeEliminarFila({ esNueva: true, valor: '500000' })).toBe(false)
  })
  it('fila existente sin valor → no eliminar', () => {
    expect(debeEliminarFila({ esNueva: false, valor: '' })).toBe(false)
  })
  it('fila existente con valor → no eliminar', () => {
    expect(debeEliminarFila({ esNueva: false, valor: '100000' })).toBe(false)
  })
})

describe('Borde rojo proveedor IA', () => {
  it('IA encontró nombre pero no existe → borde rojo', () => {
    expect(bordeRojoProveedor(true, null)).toBe(true)
  })
  it('IA encontró y seleccionó proveedor → sin borde rojo', () => {
    expect(bordeRojoProveedor(true, { id: '123' })).toBe(false)
  })
  it('sin búsqueda de IA → sin borde rojo', () => {
    expect(bordeRojoProveedor(false, null)).toBe(false)
  })
})

describe('Saldo modal con abonos acumulados', () => {
  it('sin abonos, sin retención ni descuento', () => {
    expect(calcularSaldoModal(1000000, 0, 0, [])).toBe(1000000)
  })
  it('con retención y descuento', () => {
    expect(calcularSaldoModal(1000000, 50000, 20000, [])).toBe(930000)
  })
  it('con abonos parciales', () => {
    expect(calcularSaldoModal(1000000, 0, 0, [{ valor: 300000 }, { valor: 200000 }])).toBe(500000)
  })
  it('abonos + retención + descuento', () => {
    expect(calcularSaldoModal(1000000, 50000, 20000, [{ valor: 300000 }])).toBe(630000)
  })
  it('abonos cubren todo → saldo 0', () => {
    expect(calcularSaldoModal(500000, 0, 0, [{ valor: 500000 }])).toBe(0)
  })
  it('exceso de abonos → saldo 0, no negativo', () => {
    expect(calcularSaldoModal(500000, 0, 0, [{ valor: 700000 }])).toBe(0)
  })
  it('retención NaN tratada como 0', () => {
    expect(calcularSaldoModal(500000, NaN, 0, [])).toBe(500000)
  })
})

describe('planFin gracia día 6', () => {
  it('pago septiembre 2026 → planFin 6 octubre 2026', () => {
    const ultimoMes = '2026-09'
    const [anioStr, mesStr] = ultimoMes.split('-')
    const planFin = new Date(Date.UTC(Number(anioStr), Number(mesStr), 6))
    expect(planFin).toEqual(new Date(Date.UTC(2026, 9, 6))) // oct 6
  })
  it('pago agosto 2026 → planFin 6 septiembre 2026', () => {
    const ultimoMes = '2026-08'
    const [anioStr, mesStr] = ultimoMes.split('-')
    const planFin = new Date(Date.UTC(Number(anioStr), Number(mesStr), 6))
    expect(planFin).toEqual(new Date(Date.UTC(2026, 8, 6))) // sept 6
  })
  it('planFin siempre día 6 del mes siguiente al pagado', () => {
    const casos = [
      { mes: '2026-01', esperado: new Date(Date.UTC(2026, 1, 6)) },
      { mes: '2026-06', esperado: new Date(Date.UTC(2026, 6, 6)) },
      { mes: '2026-12', esperado: new Date(Date.UTC(2027, 0, 6)) },
    ]
    for (const { mes, esperado } of casos) {
      const [a, m] = mes.split('-')
      expect(new Date(Date.UTC(Number(a), Number(m), 6))).toEqual(esperado)
    }
  })
})
