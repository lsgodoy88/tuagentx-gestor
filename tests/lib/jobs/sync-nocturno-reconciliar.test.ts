import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncDeuda: {
      update: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ fechaVencimiento: null }),
    },
    pagoCarteraDeuda: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { envioFecha: new Date() } }),
      count: vi.fn().mockResolvedValue(0),
    },
    pagoCartera: {
      update: vi.fn(),
    },
  },
}))

import { reconciliarDeuda, derivarEnvioEstado, encontrarSubsetExacto } from '@/lib/jobs/sync-nocturno'
import { prisma } from '@/lib/prisma'

const INT_ID = 'intg-1'

// Helper base para inputs — saldoLocalActual/saldoUptresAnterior mantenidos
// por compatibilidad de interfaz pero ya no afectan la lógica de nSaldo.
const base = (overrides: object) => ({
  sdId: 'sd-1', externalId: 'ext-1', valor: 1000000,
  condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 300000,
  ...overrides,
})

describe('sync-nocturno — reconciliarDeuda (misión reducida)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  // ── MISIÓN 1: condition=false ──────────────────────────────────────────────

  it('condicionUpTres=false sin receivableAt → cierreUptres, saldo=0, condition=false', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany)
      .mockResolvedValueOnce([{ id: 'apl-1' }])
      .mockResolvedValueOnce([{ pagoId: 'p1' }])
      .mockResolvedValueOnce([{ envioEstado: 'cierreUptres' }])
    vi.mocked((prisma as any).pagoCarteraDeuda.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).pagoCartera.update).mockResolvedValue({})
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda(base({ saldo: 0, condicionUpTres: false }), INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['apl-1'] } },
      data: { envioEstado: 'cierreUptres' },
    })
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 0, condition: false }) })
    )
  })

  it('condicionUpTres=false CON receivableAt → recibido, saldo=0, condition=false', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany)
      .mockResolvedValueOnce([{ id: 'apl-1' }])
      .mockResolvedValueOnce([{ pagoId: 'p1' }])
      .mockResolvedValueOnce([{ envioEstado: 'recibido' }])
    vi.mocked((prisma as any).pagoCarteraDeuda.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).pagoCartera.update).mockResolvedValue({})
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda(base({ saldo: 0, condicionUpTres: false, receivableAt: new Date('2026-07-10') }), INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['apl-1'] } },
      data: expect.objectContaining({ envioEstado: 'recibido' }),
    })
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 0, condition: false }) })
    )
  })

  // ── MISIÓN 2: confirmar pagos que UpTres ya reflejó ───────────────────────

  it('delta exacto cubre pendienteLocal → marca aplicaciones recibido', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany)
      .mockResolvedValueOnce([{ id: 'apl-1', montoAplicado: 100000, pagoId: 'p1' }])
      .mockResolvedValueOnce([{ pagoId: 'p1' }])
      .mockResolvedValueOnce([{ envioEstado: 'recibido' }])
    vi.mocked((prisma as any).pagoCarteraDeuda.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).pagoCartera.update).mockResolvedValue({})
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    // saldo bajó de 300000 a 200000 → delta=100000 = pendienteLocal
    await reconciliarDeuda(base({ saldo: 200000, saldoUptresAnterior: 300000 }), INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['apl-1'] } },
      data: expect.objectContaining({ envioEstado: 'recibido' }),
    })
    // saldo (referencia UpTres) siempre se actualiza
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 200000 }) })
    )
  })

  it('delta=0, UpTres no refleja nada → no marca aplicaciones, actualiza saldo referencia', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-1', montoAplicado: 100000, pagoId: 'p1' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda(base({ saldo: 300000, saldoUptresAnterior: 300000 }), INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    // saldo referencia sí se actualiza (mismo valor = no-op real, pero se escribe)
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 300000 }) })
    )
  })

  it('pago externo puro (sin pagos pendientes, delta>0) → actualiza saldo referencia, no toca aplicaciones', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda(base({ saldo: 200000, saldoUptresAnterior: 300000 }), INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 200000 }) })
    )
  })

  it('cargo nuevo (UpTres sube, delta<0) → actualiza saldo referencia sin tocar aplicaciones', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-1', montoAplicado: 50000, pagoId: 'p1' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    // saldo subió de 300000 a 320000 → delta=-20000 (cargo nuevo)
    await reconciliarDeuda(base({ saldo: 320000, saldoUptresAnterior: 300000 }), INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 320000 }) })
    )
  })

  // ── BUG REAL: Sergio González / Claudia / Leche — julio 2026 ─────────────
  // Con la nueva lógica, nSaldo NO vive en reconciliarDeuda sino en
  // calcularNSaldoBatch (valor - SUM pagos). El nocturno nunca puede pisarlo.

  it('BUG CC2606050: UpTres con lag (delta=0), pago pendiente → no marca, actualiza saldo referencia, nSaldo inmune', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-cc2606050', montoAplicado: 150000, pagoId: 'p-cc2606050' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'cmpwq4wax001pphq972ysac3e',
      externalId: '69f20a4bea692fad8a4eb265',
      saldo: 386285,            // UpTres aún muestra este valor (lag)
      valor: 428815,
      condicionUpTres: true,
      saldoUptresAnterior: 386285,   // mismo → delta=0
      saldoLocalActual: 236285,      // ya no afecta nSaldo
    }, INT_ID)

    // No marca ningún pago como recibido
    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    // Actualiza saldo referencia (386285) — no nSaldo
    const callData = vi.mocked((prisma as any).syncDeuda.update).mock.calls[0][0].data
    expect(callData.saldo).toBe(386285)
    expect(callData.nSaldo).toBeUndefined()
    expect(callData.condition).toBeUndefined() // deuda sigue activa
  })

  // ── Subset exacto (caso real Nancy Benítez, 25/06) ────────────────────────

  it('delta coincide con subconjunto de aplicaciones → marca solo ese subconjunto recibido', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany)
      .mockResolvedValueOnce([
        { id: 'apl-1', montoAplicado: 100000, pagoId: 'p1' },
        { id: 'apl-2', montoAplicado: 70000,  pagoId: 'p2' },
        { id: 'apl-3', montoAplicado: 100000, pagoId: 'p3' },
      ])
      .mockResolvedValueOnce([{ pagoId: 'p1' }, { pagoId: 'p2' }])
      .mockResolvedValueOnce([{ envioEstado: 'recibido' }])
      .mockResolvedValueOnce([{ envioEstado: 'recibido' }])
    vi.mocked((prisma as any).pagoCarteraDeuda.updateMany).mockResolvedValue({ count: 2 })
    vi.mocked((prisma as any).pagoCartera.update).mockResolvedValue({})
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    // delta = 361500 - 191500 = 170000 = apl-1(100000) + apl-2(70000)
    await reconciliarDeuda(base({ saldo: 191500, saldoUptresAnterior: 361500 }), INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['apl-1', 'apl-2'] } },
      data: expect.objectContaining({ envioEstado: 'recibido' }),
    })
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 191500 }) })
    )
  })

  it('delta no coincide con ningún subconjunto → no marca nada, actualiza saldo referencia', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-1', montoAplicado: 100000, pagoId: 'p1' },
      { id: 'apl-2', montoAplicado: 70000,  pagoId: 'p2' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    // delta=50000 — no coincide con 100000, ni 70000, ni 170000
    await reconciliarDeuda(base({ saldo: 250000, saldoUptresAnterior: 300000 }), INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 250000 }) })
    )
  })
})

describe('sync-nocturno — encontrarSubsetExacto', () => {
  it('encuentra el subconjunto exacto entre varias aplicaciones', () => {
    const aplicaciones = [
      { id: 'a', montoAplicado: 100000 },
      { id: 'b', montoAplicado: 70000 },
      { id: 'c', montoAplicado: 100000 },
    ]
    const resultado = encontrarSubsetExacto(aplicaciones, 170000)
    expect(resultado?.map(r => r.id).sort()).toEqual(['a', 'b'])
  })

  it('retorna null si ningún subconjunto coincide', () => {
    const aplicaciones = [
      { id: 'a', montoAplicado: 100000 },
      { id: 'b', montoAplicado: 70000 },
    ]
    expect(encontrarSubsetExacto(aplicaciones, 50000)).toBeNull()
  })

  it('retorna el subconjunto de MENOS elementos cuando hay varios que calzan', () => {
    const aplicaciones = [
      { id: 'a', montoAplicado: 50000 },
      { id: 'b', montoAplicado: 50000 },
      { id: 'c', montoAplicado: 100000 },
    ]
    const resultado = encontrarSubsetExacto(aplicaciones, 100000)
    expect(resultado?.length).toBe(1)
    expect(resultado?.[0].id).toBe('c')
  })

  it('retorna null con target<=0 o lista vacía', () => {
    expect(encontrarSubsetExacto([], 100)).toBeNull()
    expect(encontrarSubsetExacto([{ id: 'a', montoAplicado: 100 }], 0)).toBeNull()
  })
})

describe('sync-nocturno — derivarEnvioEstado', () => {
  it('recibo de 1 factura, recibido → recibido', () => {
    expect(derivarEnvioEstado([{ envioEstado: 'recibido' }])).toBe('recibido')
  })

  it('recibo multi-factura, TODAS recibido → recibido', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'recibido' }, { envioEstado: 'recibido' },
    ])).toBe('recibido')
  })

  it('recibo multi-factura, una recibido y otra enviado → enviado', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'recibido' }, { envioEstado: 'enviado' },
    ])).toBe('enviado')
  })

  it('recibo multi-factura, una recibido y otra pendiente → pendiente (bug 24/06)', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'recibido' }, { envioEstado: 'pendiente' },
    ])).toBe('pendiente')
  })

  it('recibo sin aplicaciones → pendiente', () => {
    expect(derivarEnvioEstado([])).toBe('pendiente')
  })

  it('cierreUptres solo → cierreUptres', () => {
    expect(derivarEnvioEstado([{ envioEstado: 'cierreUptres' }])).toBe('cierreUptres')
  })

  it('mezcla recibido + cierreUptres → cierreUptres', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'recibido' }, { envioEstado: 'cierreUptres' },
    ])).toBe('cierreUptres')
  })

  it('mezcla cierreUptres + enviado → enviado', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'cierreUptres' }, { envioEstado: 'enviado' },
    ])).toBe('enviado')
  })

  it('mezcla cierreUptres + pendiente → pendiente', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'cierreUptres' }, { envioEstado: 'pendiente' },
    ])).toBe('pendiente')
  })
})
