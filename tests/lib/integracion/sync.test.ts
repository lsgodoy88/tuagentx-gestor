import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncDeuda: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    pagoCartera: { findMany: vi.fn() },
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

  it('deuda nueva activa → upsert + retorna clienteUid en el set', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vTotal: '100', vSaldo: '50', vAbono: '50',
      numeroOrden: 1, numeroFacturado: 101,
      dias: '30', fCreado: '2026-05-01T00:00:00Z',
      fModificado: '2026-05-10T00:00:00Z',
      condition: true,
    }]
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue(null)
    vi.mocked((prisma as any).syncDeuda.upsert).mockResolvedValue({})

    const result = await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    expect(result).toEqual(new Set(['cli-1']))
    expect((prisma as any).syncDeuda.upsert).toHaveBeenCalledTimes(1)
    const upsertArgs = vi.mocked((prisma as any).syncDeuda.upsert).mock.calls[0][0]
    expect(upsertArgs.where).toEqual({ integracionId_externalId: { integracionId: INT_ID, externalId: 'ext-1' } })
    expect(upsertArgs.create.valor).toBe(100)
    expect(upsertArgs.create.saldo).toBe(50)
    expect(upsertArgs.create.abono).toBe(50)
    expect(upsertArgs.create.condition).toBe(true)
  })

  it('deuda inactiva (condition=false) → updateMany condition=false, NO upsert', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vSaldo: '0', condition: false,
    }]
    await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    expect((prisma as any).syncDeuda.updateMany).toHaveBeenCalledWith({
      where: { integracionId: INT_ID, externalId: 'ext-1' },
      data: { condition: false },
    })
    expect((prisma as any).syncDeuda.upsert).not.toHaveBeenCalled()
  })

  it('deuda con saldo=0 también se trata como inactiva', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vSaldo: '0', condition: true, // condition true PERO saldo 0
    }]
    await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    expect((prisma as any).syncDeuda.updateMany).toHaveBeenCalled()
    expect((prisma as any).syncDeuda.upsert).not.toHaveBeenCalled()
  })

  it('condition undefined + saldo>0 → activa (caso "campo no vino")', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vSaldo: '100', vTotal: '100',
      // condition omitido a propósito
    }]
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue(null)
    await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    expect((prisma as any).syncDeuda.upsert).toHaveBeenCalled()
  })

  it('sin externalId o sin clienteUid → skip', async () => {
    const deudas = [
      { vSaldo: '100', condition: true, cliente: { uid: 'cli-1' } }, // sin uid
      { uid: 'ext-2', vSaldo: '100', condition: true },               // sin cliente
      { uid: 'ext-3', cliente: {} },                                  // sin cliente.uid
    ]
    const result = await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    expect(result.size).toBe(0)
    expect((prisma as any).syncDeuda.upsert).not.toHaveBeenCalled()
    expect((prisma as any).syncDeuda.updateMany).not.toHaveBeenCalled()
  })

  it('fechaVencimiento: usa fPago si está', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vSaldo: '100', condition: true,
      fPago: '2026-06-01T00:00:00Z',
    }]
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue(null)
    await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).syncDeuda.upsert).mock.calls[0][0]
    expect(args.create.fechaVencimiento.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('fechaVencimiento: fallback a fCreado + dias cuando no hay fPago', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vSaldo: '100', condition: true,
      fCreado: '2026-05-01T00:00:00Z',
      dias: '30',
    }]
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue(null)
    await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).syncDeuda.upsert).mock.calls[0][0]
    // 1-may + 30 días = 31-may
    expect(args.create.fechaVencimiento.toISOString()).toBe('2026-05-31T00:00:00.000Z')
  })

  it('fechaVencimiento: sin fPago, sin dias → null', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vSaldo: '100', condition: true,
    }]
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue(null)
    await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).syncDeuda.upsert).mock.calls[0][0]
    expect(args.create.fechaVencimiento).toBeNull()
  })

  it('saldoAnterior en update = saldo previo de BD (para detectar cambios)', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vSaldo: '40', vTotal: '100', condition: true,
    }]
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue({ saldo: 80 }) // antes valía 80
    await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).syncDeuda.upsert).mock.calls[0][0]
    expect(args.update.saldoAnterior).toBe(80)
    expect(args.update.saldo).toBe(40)
  })

  it('saldoAnterior en update sin previo (deuda nueva) → vale igual al saldo nuevo', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vSaldo: '50', condition: true,
    }]
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue(null)
    await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).syncDeuda.upsert).mock.calls[0][0]
    expect(args.update.saldoAnterior).toBe(50)
  })

  it('múltiples deudas del mismo cliente → set retornado tiene 1 elemento (dedup)', async () => {
    const deudas = [
      { uid: 'ext-1', cliente: { uid: 'cli-1' }, vSaldo: '100', condition: true },
      { uid: 'ext-2', cliente: { uid: 'cli-1' }, vSaldo: '200', condition: true },
      { uid: 'ext-3', cliente: { uid: 'cli-1' }, vSaldo: '300', condition: true },
    ]
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue(null)
    const result = await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    expect(result).toEqual(new Set(['cli-1']))
    expect(result.size).toBe(1)
  })

  it('parseFloat tolera strings, undefined, valores raros', async () => {
    const deudas = [{
      uid: 'ext-1', cliente: { uid: 'cli-1' },
      vSaldo: '50.75',
      vTotal: undefined,  // → 0
      vAbono: 'abc',      // → NaN, pero parseFloat de "abc" es NaN; código lo pasa a la BD
      condition: true,
    }]
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue(null)
    await sincronizarDeudas(deudas as any, INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).syncDeuda.upsert).mock.calls[0][0]
    expect(args.create.saldo).toBe(50.75)
    expect(args.create.valor).toBe(0)
  })
})
