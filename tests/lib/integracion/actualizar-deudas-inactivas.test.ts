import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncDeuda: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { actualizarDeudasInactivas } from '@/lib/integracion/sync'
import { prisma } from '@/lib/prisma'

const INT_ID = 'intg-1'

function mockAdapter(deudasInactivasPorCliente: Record<string, any[]>) {
  return {
    fetchDeudasClienteInactivas: vi.fn(async (clienteApiId: string) => deudasInactivasPorCliente[clienteApiId] || []),
  } as any
}

describe('lib/integracion/sync — actualizarDeudasInactivas', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sin deudas condition=false con saldo>0 → no hace nada, retorna 0', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    const adapter = mockAdapter({})

    const result = await actualizarDeudasInactivas(adapter, INT_ID)

    expect(result).toBe(0)
    expect(adapter.fetchDeudasClienteInactivas).not.toHaveBeenCalled()
  })

  it('UpTres confirma saldo=0 para la deuda inactiva → actualiza saldo=0, condition=false', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', externalId: 'ext-1', clienteApiId: 'api-c1', saldo: 226275, numeroFactura: 9497 },
    ])
    const adapter = mockAdapter({
      'api-c1': [{ uid: 'ext-1', vSaldo: '0' }],
    })

    const result = await actualizarDeudasInactivas(adapter, INT_ID)

    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-1' },
      data: expect.objectContaining({ saldo: 0, condition: false }),
    })
    expect(result).toBe(1)
  })

  it('UpTres no incluye la deuda en inactivas (huerfana) → trata como saldada, saldo=0', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', externalId: 'ext-1', clienteApiId: 'api-c1', saldo: 53440, numeroFactura: 3492 },
    ])
    const adapter = mockAdapter({ 'api-c1': [] }) // UpTres no la trae

    await actualizarDeudasInactivas(adapter, INT_ID)

    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-1' },
      data: expect.objectContaining({ saldo: 0, condition: false }),
    })
  })

  it('saldo en BD ya coincide con UpTres (sin cambio real) → no actualiza, evita escritura innecesaria', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', externalId: 'ext-1', clienteApiId: 'api-c1', saldo: 100000, numeroFactura: 3675 },
    ])
    const adapter = mockAdapter({
      'api-c1': [{ uid: 'ext-1', vSaldo: '100000' }], // mismo saldo, sin diferencia real
    })

    const result = await actualizarDeudasInactivas(adapter, INT_ID)

    expect((prisma as any).syncDeuda.update).not.toHaveBeenCalled()
    expect(result).toBe(0)
  })

  it('error en un cliente no detiene el procesamiento de los demas', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', externalId: 'ext-1', clienteApiId: 'api-c1', saldo: 50000, numeroFactura: 1 },
      { id: 'sd-2', externalId: 'ext-2', clienteApiId: 'api-c2', saldo: 70000, numeroFactura: 2 },
    ])
    const adapter = {
      fetchDeudasClienteInactivas: vi.fn(async (clienteApiId: string) => {
        if (clienteApiId === 'api-c1') throw new Error('UpTres timeout')
        return [{ uid: 'ext-2', vSaldo: '0' }]
      }),
    } as any

    const result = await actualizarDeudasInactivas(adapter, INT_ID)

    expect(result).toBe(1) // solo api-c2 se actualizo
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledTimes(1)
  })
})
