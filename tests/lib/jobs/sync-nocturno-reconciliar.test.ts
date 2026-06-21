import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncDeuda: {
      update: vi.fn(),
    },
    pagoCartera: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { reconciliarDeuda } from '@/lib/jobs/sync-nocturno'
import { prisma } from '@/lib/prisma'

const INT_ID = 'intg-1'

describe('sync-nocturno — reconciliarDeuda', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('condicionUpTres=false → marca pagos pendientes/enviados como recibido, saldo=0', async () => {
    vi.mocked((prisma as any).pagoCartera.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 0, valor: 300000,
      condicionUpTres: false, saldoUptresAnterior: 300000, saldoLocalActual: 0,
    }, INT_ID)

    expect((prisma as any).pagoCartera.updateMany).toHaveBeenCalledWith({
      where: { syncDeudaId: 'sd-1', envioEstado: { in: ['pendiente', 'enviado'] } },
      data: { envioEstado: 'recibido' },
    })
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 0, condition: false }) })
    )
  })

  it('delta exacto cubre pendienteLocal → marca esos pagos recibido, acepta saldo de UpTres', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { id: 'p1', monto: 100000 },
    ])
    vi.mocked((prisma as any).pagoCartera.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 200000, valor: 1000000,
      condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 200000,
    }, INT_ID)

    expect((prisma as any).pagoCartera.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1'] } },
      data: { envioEstado: 'recibido' },
    })
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 200000, condition: true }) })
    )
  })

  it('UpTres aun no refleja nada (delta=0) → preserva saldo local, no marca ningun pago', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { id: 'p1', monto: 100000 },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 300000, valor: 1000000,
      condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 200000,
    }, INT_ID)

    expect((prisma as any).pagoCartera.updateMany).not.toHaveBeenCalled()
    const callData = vi.mocked((prisma as any).syncDeuda.update).mock.calls[0][0].data
    expect(callData.saldo).toBeUndefined() // baseUpdate no incluye saldo cuando se preserva
  })

  it('cargo nuevo mezclado con pago pendiente (UpTres sube) → ajusta saldo local sin marcar pagos', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { id: 'p1', monto: 50000 },
    ])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    // saldoUptresAnterior=300000, ahora UpTres reporta 320000 (subio por interes) — delta=-20000
    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 320000, valor: 1000000,
      condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 250000,
    }, INT_ID)

    expect((prisma as any).pagoCartera.updateMany).not.toHaveBeenCalled()
    // ajuste = 300000-320000 = -20000 (subio) → saldoLocalNuevo = max(0, 250000 - (-20000)) = 270000
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 270000, condition: true }) })
    )
  })

  it('pago externo directo sin pendienteLocal (delta>0, pendienteLocal=0) → acepta el nuevo saldo bajo', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})

    await reconciliarDeuda({
      sdId: 'sd-1', externalId: 'ext-1', saldo: 200000, valor: 1000000,
      condicionUpTres: true, saldoUptresAnterior: 300000, saldoLocalActual: 300000,
    }, INT_ID)

    expect((prisma as any).pagoCartera.updateMany).not.toHaveBeenCalled()
    // ajuste = 300000-200000 = 100000 (bajo) → saldoLocalNuevo = max(0, 300000-100000) = 200000
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 200000, condition: true }) })
    )
  })
})
