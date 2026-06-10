import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncDeuda: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    pagoCartera: { findMany: vi.fn() },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === 'function') {
        const { prisma: p } = await import('@/lib/prisma')
        return ops(p)
      }
      return Array.isArray(ops) ? Promise.all(ops) : ops
    }),
  },
}))

import { sincronizarDeudas, marcarZombis } from '@/lib/integracion/sync'
import { prisma } from '@/lib/prisma'

const INT_ID = 'intg-1'
const EMP_ID = 'emp-1'

describe('lib/integracion/sync — marcarZombis', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('todas vivas → 0 zombis, no escribe', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', externalId: 'ext-1' },
      { id: 'sd-2', externalId: 'ext-2' },
    ])
    const vivas = new Set(['ext-1', 'ext-2'])

    const result = await marcarZombis(vivas, INT_ID, EMP_ID)
    expect(result).toBe(0)
    expect((prisma as any).syncDeuda.updateMany).not.toHaveBeenCalled()
  })

  it('1 zombi: cierra solo esa con saldo=0, condition=false', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', externalId: 'ext-1' },
      { id: 'sd-2', externalId: 'ext-2' },
      { id: 'sd-3', externalId: 'ext-3' }, // zombi
    ])
    const vivas = new Set(['ext-1', 'ext-2'])
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 1 })

    const result = await marcarZombis(vivas, INT_ID, EMP_ID)
    expect(result).toBe(1)
    expect((prisma as any).syncDeuda.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sd-3'] } },
      data: { saldo: 0, condition: false, externalUpdatedAt: expect.any(Date) },
    })
  })

  it('set vivas vacío → todas son zombis', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', externalId: 'ext-1' },
      { id: 'sd-2', externalId: 'ext-2' },
    ])
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 2 })

    const result = await marcarZombis(new Set(), INT_ID, EMP_ID)
    expect(result).toBe(2)
    expect((prisma as any).syncDeuda.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sd-1', 'sd-2'] } },
      data: expect.objectContaining({ saldo: 0, condition: false }),
    })
  })

  it('filtra por integracionId + solo activas', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    await marcarZombis(new Set(['ext-1']), INT_ID, EMP_ID)

    expect((prisma as any).syncDeuda.findMany).toHaveBeenCalledWith({
      where: { integracionId: INT_ID, condition: true },
      select: { id: true, externalId: true },
    })
  })

  it('sin BD locales activas → 0 sin escribir', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    const result = await marcarZombis(new Set(['ext-1', 'ext-2']), INT_ID, EMP_ID)
    expect(result).toBe(0)
    expect((prisma as any).syncDeuda.updateMany).not.toHaveBeenCalled()
  })
})

describe('lib/integracion/sync — sincronizarDeudas', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('deuda nueva activa → createMany + retorna clienteUid en el set', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).syncDeuda.createMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 0 })

    const result = await sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '100', vTotal: '100', vAbono: '0',
        condition: true, numeroOrden: 1, numeroFacturado: 1, dias: '30', fCreado: '2026-01-01' }
    ], INT_ID, EMP_ID)

    expect(result.has('cli-1')).toBe(true)
    expect((prisma as any).syncDeuda.createMany).toHaveBeenCalled()
  })

  it('deuda inactiva (condition=false) → updateMany condition=false, NO createMany', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { externalId: 'ext-1', saldo: 100 }
    ])
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 1 })

    await sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '100', vTotal: '100',
        vAbono: '0', condition: false, numeroOrden: 1, numeroFacturado: 1, dias: '0' }
    ], INT_ID, EMP_ID)

    const calls = vi.mocked((prisma as any).syncDeuda.updateMany).mock.calls
    const deactivate = calls.find((c: any) => c[0]?.data?.condition === false)
    expect(deactivate).toBeDefined()
  })

  it('deuda con saldo=0 también se trata como inactiva', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { externalId: 'ext-1', saldo: 50 }
    ])
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 1 })

    await sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '0', vTotal: '100',
        vAbono: '0', condition: true, numeroOrden: 1, numeroFacturado: 1, dias: '0' }
    ], INT_ID, EMP_ID)

    const calls = vi.mocked((prisma as any).syncDeuda.updateMany).mock.calls
    const deactivate = calls.find((c: any) => c[0]?.data?.condition === false)
    expect(deactivate).toBeDefined()
  })

  it('condition undefined + saldo>0 → activa (caso "campo no vino")', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).syncDeuda.createMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 0 })

    const result = await sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '100', vTotal: '100',
        vAbono: '0', condition: undefined, numeroOrden: 1, numeroFacturado: 1, dias: '0' }
    ], INT_ID, EMP_ID)

    expect(result.has('cli-1')).toBe(true)
    expect((prisma as any).syncDeuda.createMany).toHaveBeenCalled()
  })

  it('fechaVencimiento: usa fPago si está', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).syncDeuda.createMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 0 })

    await sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '100', vTotal: '100',
        vAbono: '0', condition: true, fPago: '2026-06-15',
        numeroOrden: 1, numeroFacturado: 1, dias: '30' }
    ], INT_ID, EMP_ID)

    const create = vi.mocked((prisma as any).syncDeuda.createMany).mock.calls[0][0]
    expect(create.data[0].fechaVencimiento).toEqual(new Date('2026-06-15'))
  })

  it('fechaVencimiento: sin fPago, sin dias → null', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).syncDeuda.createMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 0 })

    await sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '100', vTotal: '100',
        vAbono: '0', condition: true, numeroOrden: 1, numeroFacturado: 1, dias: '0' }
    ], INT_ID, EMP_ID)

    const create = vi.mocked((prisma as any).syncDeuda.createMany).mock.calls[0][0]
    expect(create.data[0].fechaVencimiento).toBeNull()
  })

  it('múltiples deudas del mismo cliente → set retornado tiene 1 elemento (dedup)', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).syncDeuda.createMany).mockResolvedValue({ count: 2 })
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 0 })

    const result = await sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '100', vTotal: '100', vAbono: '0', condition: true, numeroOrden: 1, numeroFacturado: 1, dias: '0' },
      { uid: 'ext-2', cliente: { uid: 'cli-1' }, vSaldo: '200', vTotal: '200', vAbono: '0', condition: true, numeroOrden: 2, numeroFacturado: 2, dias: '0' },
    ], INT_ID, EMP_ID)

    expect(result.size).toBe(1)
  })

  it('saldoAnterior en update = saldo previo de BD', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { externalId: 'ext-1', saldo: 500 }
    ])
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 1 })

    await sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '300', vTotal: '500',
        vAbono: '0', condition: true, numeroOrden: 1, numeroFacturado: 1, dias: '0' }
    ], INT_ID, EMP_ID)

    const calls = vi.mocked((prisma as any).syncDeuda.updateMany).mock.calls
    const update = calls.find((c: any) => c[0]?.data?.saldo !== undefined)
    expect(update[0].data.saldoAnterior).toBe(500)
    expect(update[0].data.saldo).toBe(300)
  })

  it('sin externalId o sin clienteUid → skip', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).syncDeuda.createMany).mockResolvedValue({ count: 0 })

    const result = await sincronizarDeudas([
      { uid: '', cliente: { uid: 'cli-1' }, vSaldo: '100', vTotal: '100', vAbono: '0', condition: true, numeroOrden: 1, numeroFacturado: 1, dias: '0' },
      { uid: 'ext-1', cliente: { uid: '' }, vSaldo: '100', vTotal: '100', vAbono: '0', condition: true, numeroOrden: 1, numeroFacturado: 1, dias: '0' },
    ], INT_ID, EMP_ID)

    expect(result.size).toBe(0)
  })

  it('parseFloat tolera strings, undefined, valores raros', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).syncDeuda.createMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 0 })

    await expect(sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: undefined as any,
        vTotal: 'abc', vAbono: null as any, condition: true, numeroOrden: 1, numeroFacturado: 1, dias: '0' }
    ], INT_ID, EMP_ID)).resolves.not.toThrow()
  })

  it('fechaVencimiento: fallback a fCreado + dias cuando no hay fPago', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).syncDeuda.createMany).mockResolvedValue({ count: 1 })
    vi.mocked((prisma as any).syncDeuda.updateMany).mockResolvedValue({ count: 0 })

    await sincronizarDeudas([
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '100', vTotal: '100',
        vAbono: '0', condition: true, fCreado: '2026-05-01', dias: '30',
        numeroOrden: 1, numeroFacturado: 1 }
    ], INT_ID, EMP_ID)

    const create = vi.mocked((prisma as any).syncDeuda.createMany).mock.calls[0][0]
    const fecha = create.data[0].fechaVencimiento
    expect(fecha).toBeInstanceOf(Date)
    // 1 mayo UTC + 30 dias. Aceptar 30 o 31 según zona horaria del runner
    expect(fecha.getUTCDate() >= 30).toBe(true)
  })
})
