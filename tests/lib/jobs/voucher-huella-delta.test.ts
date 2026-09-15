import { describe, it, expect } from 'vitest'

// ── Lógica pura extraída del job ──────────────────────────────────

function esCrossEmpresa(empresaIds: string[]): boolean {
  return new Set(empresaIds).size > 1
}

function buildAlertaVoucher(dup: {
  referencia: string
  valor: number
  fecha: string
  banco: string
  titular: string
  primer_uso: Date
  pago_ids: string[]
  empresa_ids: string[]
  vendedores: (string | null)[]
}, indice: number): object {
  const esCross = esCrossEmpresa(dup.empresa_ids)
  const otrosIdx = dup.pago_ids.map((_, j) => j).filter(j => j !== indice)
  return {
    tipo:       esCross ? 'cross-empresa' : 'duplicado-interno',
    referencia: dup.referencia,
    valor:      Number(dup.valor),
    fecha:      dup.fecha,
    banco:      dup.banco,
    titular:    dup.titular,
    primerUso:  dup.primer_uso,
    otrosRecibos: otrosIdx.map(j => ({
      pagoId:    dup.pago_ids[j],
      empresaId: dup.empresa_ids[j],
      vendedor:  dup.vendedores[j] ?? null,
    })),
  }
}

function matchCompleto(huella: {
  referencia?: string | null
  valor?: number | null
  fecha?: string | null
  banco?: string | null
  titular?: string | null
}): boolean {
  return !!(
    huella.referencia && huella.referencia !== '' &&
    huella.valor      != null &&
    huella.fecha      && huella.fecha      !== '' &&
    huella.banco      && huella.banco      !== '' &&
    huella.titular    && huella.titular    !== ''
  )
}

// ── esCrossEmpresa ────────────────────────────────────────────────
describe('esCrossEmpresa', () => {
  it('misma empresa → false', () => {
    expect(esCrossEmpresa(['emp1', 'emp1'])).toBe(false)
  })
  it('dos empresas distintas → true', () => {
    expect(esCrossEmpresa(['emp1', 'emp2'])).toBe(true)
  })
  it('tres empresas, dos iguales → true', () => {
    expect(esCrossEmpresa(['emp1', 'emp2', 'emp1'])).toBe(true)
  })
  it('una sola empresa → false', () => {
    expect(esCrossEmpresa(['emp1'])).toBe(false)
  })
})

// ── matchCompleto ─────────────────────────────────────────────────
describe('matchCompleto', () => {
  const base = { referencia: '033658', valor: 500000, fecha: '10/09/2026', banco: 'Bancolombia', titular: 'Juan Perez' }

  it('5 campos completos → true', () => {
    expect(matchCompleto(base)).toBe(true)
  })
  it('sin referencia → false', () => {
    expect(matchCompleto({ ...base, referencia: null })).toBe(false)
  })
  it('referencia vacía → false', () => {
    expect(matchCompleto({ ...base, referencia: '' })).toBe(false)
  })
  it('sin valor → false', () => {
    expect(matchCompleto({ ...base, valor: null })).toBe(false)
  })
  it('sin fecha → false', () => {
    expect(matchCompleto({ ...base, fecha: null })).toBe(false)
  })
  it('sin banco → false', () => {
    expect(matchCompleto({ ...base, banco: '' })).toBe(false)
  })
  it('sin titular → false', () => {
    expect(matchCompleto({ ...base, titular: null })).toBe(false)
  })
})

// ── buildAlertaVoucher ────────────────────────────────────────────
describe('buildAlertaVoucher', () => {
  const primerUso = new Date('2026-09-10T10:00:00Z')

  const dupCross = {
    referencia: '033658',
    valor: 500000,
    fecha: '10/09/2026',
    banco: 'Bancolombia',
    titular: 'Juan Perez',
    primer_uso: primerUso,
    pago_ids:    ['pago-A', 'pago-B'],
    empresa_ids: ['prokpil', 'lumeli'],
    vendedores:  ['Alejandra', 'Maria'],
  }

  const dupInterno = {
    ...dupCross,
    empresa_ids: ['prokpil', 'prokpil'],
  }

  it('cross-empresa → tipo cross-empresa', () => {
    const alerta: any = buildAlertaVoucher(dupCross, 0)
    expect(alerta.tipo).toBe('cross-empresa')
  })

  it('misma empresa → tipo duplicado-interno', () => {
    const alerta: any = buildAlertaVoucher(dupInterno, 0)
    expect(alerta.tipo).toBe('duplicado-interno')
  })

  it('otrosRecibos excluye el índice propio', () => {
    const alerta: any = buildAlertaVoucher(dupCross, 0)
    expect(alerta.otrosRecibos).toHaveLength(1)
    expect(alerta.otrosRecibos[0].pagoId).toBe('pago-B')
    expect(alerta.otrosRecibos[0].empresaId).toBe('lumeli')
  })

  it('desde el segundo pago, otrosRecibos apunta al primero', () => {
    const alerta: any = buildAlertaVoucher(dupCross, 1)
    expect(alerta.otrosRecibos[0].pagoId).toBe('pago-A')
    expect(alerta.otrosRecibos[0].empresaId).toBe('prokpil')
  })

  it('conserva los 5 campos del match', () => {
    const alerta: any = buildAlertaVoucher(dupCross, 0)
    expect(alerta.referencia).toBe('033658')
    expect(alerta.valor).toBe(500000)
    expect(alerta.fecha).toBe('10/09/2026')
    expect(alerta.banco).toBe('Bancolombia')
    expect(alerta.titular).toBe('Juan Perez')
  })

  it('vendedor null → null en otrosRecibos', () => {
    const dupSinVendedor = { ...dupCross, vendedores: ['Alejandra', null] }
    const alerta: any = buildAlertaVoucher(dupSinVendedor, 0)
    expect(alerta.otrosRecibos[0].vendedor).toBeNull()
  })

  it('3 pagos → otrosRecibos tiene 2 entradas', () => {
    const dup3 = {
      ...dupCross,
      pago_ids:    ['pago-A', 'pago-B', 'pago-C'],
      empresa_ids: ['prokpil', 'lumeli', 'otra'],
      vendedores:  ['Ana', 'Maria', 'Laura'],
    }
    const alerta: any = buildAlertaVoucher(dup3, 0)
    expect(alerta.otrosRecibos).toHaveLength(2)
  })
})
