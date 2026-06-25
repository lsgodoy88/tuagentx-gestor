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

import { reconciliarDeuda, derivarEnvioEstado } from '@/lib/jobs/sync-nocturno'
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
