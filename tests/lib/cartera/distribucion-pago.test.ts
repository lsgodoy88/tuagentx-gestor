import { describe, it, expect } from 'vitest'

// Lógica de distribución de pago — pago-sync.ts
// saldoActual = nSaldo != null ? Math.min(nSaldo, saldo) : saldo

function getSaldoActual(deuda: { saldo: number; nSaldo: number | null }): number {
  return deuda.nSaldo != null ? Math.min(deuda.nSaldo, deuda.saldo) : deuda.saldo
}

function distribuirPago(deudas: { id: string; saldo: number; nSaldo: number | null }[], totalAplicado: number) {
  const aplicaciones: { id: string; montoAplicado: number }[] = []
  let restante = totalAplicado
  for (const d of deudas) {
    if (restante <= 0) break
    const saldoActual = getSaldoActual(d)
    if (saldoActual <= 0) continue
    const aplicar = Math.min(saldoActual, restante)
    aplicaciones.push({ id: d.id, montoAplicado: aplicar })
    restante -= aplicar
  }
  return aplicaciones
}

describe('getSaldoActual — selección de saldo correcto', () => {
  it('sin nSaldo → usa saldo UpTres', () => {
    expect(getSaldoActual({ saldo: 166000, nSaldo: null })).toBe(166000)
  })
  it('nSaldo < saldo → usa nSaldo (pagos previos en TuAgentX)', () => {
    expect(getSaldoActual({ saldo: 166000, nSaldo: 66000 })).toBe(66000)
  })
  it('nSaldo > saldo → usa saldo UpTres (UpTres ya actualizó)', () => {
    expect(getSaldoActual({ saldo: 50000, nSaldo: 80000 })).toBe(50000)
  })
  it('nSaldo = saldo → cualquiera es igual', () => {
    expect(getSaldoActual({ saldo: 77000, nSaldo: 77000 })).toBe(77000)
  })
  it('nSaldo = 0 → saldo 0, no se aplica', () => {
    expect(getSaldoActual({ saldo: 100000, nSaldo: 0 })).toBe(0)
  })
})

describe('distribuirPago — caso real CL2609008', () => {
  // Factura 3821: saldo UpTres 166k, nSaldo 66k (pagos previos)
  // Factura 4193: saldo UpTres 77k, nSaldo 77k
  // Pago: $100.000
  const deudas = [
    { id: 'sd-3821', saldo: 166000, nSaldo: 66000 },
    { id: 'sd-4193', saldo: 77000,  nSaldo: 77000 },
  ]

  it('distribuye correctamente entre dos facturas', () => {
    const apps = distribuirPago(deudas, 100000)
    expect(apps).toHaveLength(2)
    expect(apps[0]).toEqual({ id: 'sd-3821', montoAplicado: 66000 })
    expect(apps[1]).toEqual({ id: 'sd-4193', montoAplicado: 34000 })
  })

  it('suma de aplicaciones = monto total', () => {
    const apps = distribuirPago(deudas, 100000)
    const total = apps.reduce((s, a) => s + a.montoAplicado, 0)
    expect(total).toBe(100000)
  })

  it('BUG ANTERIOR: con saldo UpTres todo va a primera factura', () => {
    // Con el bug original usaba saldo=166k → aplica 100k → restante=0 → no pasa a 4193
    const deudasBug = [
      { id: 'sd-3821', saldo: 166000, nSaldo: null }, // sin nSaldo = bug
      { id: 'sd-4193', saldo: 77000,  nSaldo: null },
    ]
    const apps = distribuirPago(deudasBug, 100000)
    expect(apps).toHaveLength(1) // solo una factura — bug
    expect(apps[0].montoAplicado).toBe(100000)
  })
})

describe('distribuirPago — casos edge', () => {
  it('pago exacto al saldo de la primera', () => {
    const apps = distribuirPago([
      { id: 'a', saldo: 50000, nSaldo: 50000 },
      { id: 'b', saldo: 30000, nSaldo: 30000 },
    ], 50000)
    expect(apps).toHaveLength(1)
    expect(apps[0]).toEqual({ id: 'a', montoAplicado: 50000 })
  })

  it('pago mayor al total de deudas — aplica hasta el saldo disponible', () => {
    const apps = distribuirPago([
      { id: 'a', saldo: 30000, nSaldo: 30000 },
      { id: 'b', saldo: 20000, nSaldo: 20000 },
    ], 100000)
    expect(apps).toHaveLength(2)
    expect(apps[0].montoAplicado).toBe(30000)
    expect(apps[1].montoAplicado).toBe(20000)
  })

  it('deuda con nSaldo mayor que saldo — usa saldo UpTres', () => {
    const apps = distribuirPago([
      { id: 'a', saldo: 40000, nSaldo: 90000 }, // nSaldo inflado
    ], 100000)
    expect(apps[0].montoAplicado).toBe(40000) // usa saldo UpTres
  })

  it('deuda con saldo 0 — se omite', () => {
    const apps = distribuirPago([
      { id: 'a', saldo: 0, nSaldo: 0 },
      { id: 'b', saldo: 50000, nSaldo: 50000 },
    ], 30000)
    expect(apps).toHaveLength(1)
    expect(apps[0].id).toBe('b')
  })
})
