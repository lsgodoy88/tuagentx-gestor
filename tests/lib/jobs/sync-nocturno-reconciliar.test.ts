import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncDeuda: {
      update: vi.fn(),
    },
    pagoCarteraDeuda: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { envioFecha: new Date() } }),
    },
    pagoCartera: {
      update: vi.fn(),
    },
  },
}))

import { reconciliarDeuda, derivarEnvioEstado, encontrarSubsetExacto } from '@/lib/jobs/sync-nocturno'
import { prisma } from '@/lib/prisma'

const INT_ID = 'intg-1'

describe('sync-nocturno — reconciliarDeuda', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('condicionUpTres=false → marca aplicaciones pendientes/enviadas como recibido, saldo=0', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany)
      .mockResolvedValueOnce([{ id: 'apl-1' }])
      .mockResolvedValueOnce([{ pagoId: 'p1' }])
      .mockResolvedValueOnce([{ envioEstado: 'recibido' }])
    vi.mocked((prisma as any).pagoCarteraDeuda.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).pagoCartera.update).mockResolvedValue({})
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 0, valor: 300000,
      condicionUpTres: false, saldoUptresAnterior: 300000, saldoLocalActual: 0,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['apl-1'] } },
      data: expect.objectContaining({ envioEstado: 'recibido' }),
    })
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 0, condition: false }) })
    )
  })

  it('delta exacto cubre pendienteLocal → marca esas aplicaciones recibido, acepta saldo de UpTres', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany)
      .mockResolvedValueOnce([{ id: 'apl-1', montoAplicado: 100000, pagoId: 'p1' }])
      .mockResolvedValueOnce([{ pagoId: 'p1' }])
      .mockResolvedValueOnce([{ envioEstado: 'recibido' }])
    vi.mocked((prisma as any).pagoCarteraDeuda.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).pagoCartera.update).mockResolvedValue({})
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 200000, valor: 1000000,
      condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 200000,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['apl-1'] } },
      data: expect.objectContaining({ envioEstado: 'recibido' }),
    })
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 200000, condition: true }) })
    )
  })

  it('UpTres aun no refleja nada (delta=0) → preserva saldo local, no marca ninguna aplicacion', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-1', montoAplicado: 100000, pagoId: 'p1' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 300000, valor: 1000000,
      condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 200000,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    const callData = vi.mocked((prisma as any).syncDeuda.update).mock.calls[0][0].data
    expect(callData.saldo).toBeUndefined()
  })

  it('cargo nuevo mezclado con pago pendiente (UpTres sube) → ajusta saldo local sin marcar aplicaciones', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-1', montoAplicado: 50000, pagoId: 'p1' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 320000, valor: 1000000,
      condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 250000,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 270000, condition: true }) })
    )
  })

  it('pago externo directo sin pendienteLocal (delta>0, pendienteLocal=0) → acepta el nuevo saldo bajo', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 200000, valor: 1000000,
      condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 300000,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 200000, condition: true }) })
    )
  })

  // ── Guardia de no-regresión ────────────────────────────────────────────────
  it('guardia: pago TOTAL ya aplicado localmente (saldo=0), UpTres aún no refleja nada → preserva saldo 0, NO marca recibido', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-1', montoAplicado: 127800, pagoId: 'p1' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 127800, valor: 127800,
      condicionUpTres: true, saldoUptresAnterior: 127800, saldoLocalActual: 0,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    const callData = vi.mocked((prisma as any).syncDeuda.update).mock.calls[0][0].data
    expect(callData.saldo).toBeUndefined()
  })

  it('guardia: ABONO PARCIAL ya aplicado localmente, UpTres aún no refleja nada → preserva saldo parcial correcto', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-2', montoAplicado: 200000, pagoId: 'p1' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 500000, valor: 500000,
      condicionUpTres: true, saldoUptresAnterior: 500000, saldoLocalActual: 300000,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    const callData = vi.mocked((prisma as any).syncDeuda.update).mock.calls[0][0].data
    expect(callData.saldo).toBeUndefined()
  })

  it('guardia NO debe aplicar si UpTres SUBIÓ (cargo nuevo) simultáneo con pago pendiente — debe sumar el cargo, no enmascararlo', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-3', montoAplicado: 200000, pagoId: 'p1' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 550000, valor: 500000,
      condicionUpTres: true, saldoUptresAnterior: 500000, saldoLocalActual: 300000,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 350000, condition: true }) })
    )
  })

  // ── Subset exacto (caso real Nancy Benítez, 25/06) ──────────────────────────
  it('delta coincide con UN subconjunto de aplicaciones pendientes (no la suma total) → marca solo ese subconjunto recibido', async () => {
    // 3 pagos: 100000 (5/jun), 70000 (11/jun), 100000 (18/jun). UpTres confirmó
    // los primeros 2 (delta=170000) pero el sync los ve junto al tercero (pendienteLocal=270000)
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany)
      .mockResolvedValueOnce([
        { id: 'apl-1', montoAplicado: 100000, pagoId: 'p1' },
        { id: 'apl-2', montoAplicado: 70000, pagoId: 'p2' },
        { id: 'apl-3', montoAplicado: 100000, pagoId: 'p3' },
      ])
      .mockResolvedValueOnce([{ pagoId: 'p1' }, { pagoId: 'p2' }])
      .mockResolvedValueOnce([{ envioEstado: 'recibido' }])
      .mockResolvedValueOnce([{ envioEstado: 'recibido' }])
    vi.mocked((prisma as any).pagoCarteraDeuda.updateMany).mockResolvedValue({ count: 2 })
    vi.mocked((prisma as any).pagoCartera.update).mockResolvedValue({})
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 191500, valor: 361500,
      condicionUpTres: true, saldoUptresAnterior: 361500, saldoLocalActual: 91500,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['apl-1', 'apl-2'] } },
      data: expect.objectContaining({ envioEstado: 'recibido' }),
    })
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 191500, condition: true }) })
    )
  })

  it('delta no coincide con ningún subconjunto → preserva sin marcar nada (comportamiento previo intacto)', async () => {
    vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValueOnce([
      { id: 'apl-1', montoAplicado: 100000, pagoId: 'p1' },
      { id: 'apl-2', montoAplicado: 70000, pagoId: 'p2' },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    // delta=50000 — no coincide con 100000, ni 70000, ni 170000 (la suma)
    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 250000, valor: 500000,
      condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 130000,
    }, INT_ID)

    expect((prisma as any).pagoCarteraDeuda.updateMany).not.toHaveBeenCalled()
    const callData = vi.mocked((prisma as any).syncDeuda.update).mock.calls[0][0].data
    expect(callData.saldo).toBeUndefined()
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
    // tanto [a,b] como [c] suman 100000 — debe preferir [c] (1 elemento, mas conservador)
    const resultado = encontrarSubsetExacto(aplicaciones, 100000)
    expect(resultado?.length).toBe(1)
    expect(resultado?.[0].id).toBe('c')
  })

  it('retorna null con target<=0 o lista vacía', () => {
    expect(encontrarSubsetExacto([], 100)).toBeNull()
    expect(encontrarSubsetExacto([{ id: 'a', montoAplicado: 100 }], 0)).toBeNull()
  })
})

describe('sync-nocturno — derivarEnvioEstado (estado del recibo derivado de sus facturas)', () => {
  it('recibo de 1 factura, recibido → recibido', () => {
    expect(derivarEnvioEstado([{ envioEstado: 'recibido' }])).toBe('recibido')
  })

  it('recibo multi-factura, TODAS recibido → recibido', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'recibido' }, { envioEstado: 'recibido' },
    ])).toBe('recibido')
  })

  it('recibo multi-factura, una recibido y otra enviado (ninguna pendiente) → enviado', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'recibido' }, { envioEstado: 'enviado' },
    ])).toBe('enviado')
  })

  it('recibo multi-factura, una recibido y otra AÚN pendiente → pendiente (caso real del bug 24/06)', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'recibido' }, { envioEstado: 'pendiente' },
    ])).toBe('pendiente')
  })

  it('recibo sin aplicaciones (caso borde) → pendiente', () => {
    expect(derivarEnvioEstado([])).toBe('pendiente')
  })
})
