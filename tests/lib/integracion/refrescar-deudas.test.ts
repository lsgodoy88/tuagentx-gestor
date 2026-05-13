import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pagoCartera: { findMany: vi.fn() },
    syncDeuda: { findMany: vi.fn(), update: vi.fn() },
  },
}))

import { refrescarDeudasConPagosPendientes } from '@/lib/integracion/sync'
import { prisma } from '@/lib/prisma'

const INT_ID = 'intg-1'
const EMP_ID = 'emp-1'

// Mock adapter
function makeAdapter(deudasPorCliente: Record<string, any[]> = {}, errores: Set<string> = new Set()) {
  return {
    login: vi.fn(),
    fetchClientes: vi.fn(),
    fetchEmpleados: vi.fn(),
    fetchDeudas: vi.fn(),
    fetchDeudasCliente: vi.fn(async (apiId: string) => {
      if (errores.has(apiId)) throw new Error(`fail-${apiId}`)
      return deudasPorCliente[apiId] || []
    }),
  } as any
}

describe('lib/integracion/sync — refrescarDeudasConPagosPendientes', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sin pagos locales registrados → no consulta UpTres, retorna ceros', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([])
    const adapter = makeAdapter()
    const result = await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)
    expect(result).toEqual({ clientes: 0, confrontados: 0, deudasActualizadas: 0 })
    expect(adapter.fetchDeudasCliente).not.toHaveBeenCalled()
  })

  it('busca pagos solo con syncDeudaId no-null + distinct', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([])
    const adapter = makeAdapter()
    await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)
    expect((prisma as any).pagoCartera.findMany).toHaveBeenCalledWith({
      where: { syncDeudaId: { not: null } },
      select: { syncDeudaId: true, createdAt: true },
      distinct: ['syncDeudaId'],
    })
  })

  it('busca syncDeudas filtradas por integracionId AND condition:true', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    const adapter = makeAdapter()
    await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)
    expect((prisma as any).syncDeuda.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['sd-1'] }, integracionId: INT_ID, condition: true },
    })
  })

  it('consulta adapter una vez por cliente único (dedup)', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
      { syncDeudaId: 'sd-2', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-1', saldo: 100, valor: 100, externalUpdatedAt: null },
      { id: 'sd-2', clienteApiId: 'api-c1', externalId: 'ext-2', saldo: 50,  valor: 50,  externalUpdatedAt: null },
    ])
    const adapter = makeAdapter({ 'api-c1': [] })
    const result = await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)
    expect(adapter.fetchDeudasCliente).toHaveBeenCalledTimes(1)
    expect(adapter.fetchDeudasCliente).toHaveBeenCalledWith('api-c1')
    expect(result.clientes).toBe(1)
  })

  it('saldo cambió en UpTres → update y suma deudasActualizadas', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-1', saldo: 100, valor: 100, externalUpdatedAt: new Date('2026-05-01') },
    ])
    const adapter = makeAdapter({
      'api-c1': [{ uid: 'ext-1', vSaldo: 60, fModificado: '2026-05-10T00:00:00Z' }],
    })

    const result = await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)

    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-1' },
      data: {
        saldo: 60,
        abono: 40, // valor 100 - nuevo saldo 60
        condition: true,
        externalUpdatedAt: new Date('2026-05-10T00:00:00Z'),
      },
    })
    expect(result.deudasActualizadas).toBe(1)
  })

  it('saldo nuevo en 0 → condition false (deuda pagada en UpTres)', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-1', saldo: 100, valor: 100, externalUpdatedAt: null },
    ])
    const adapter = makeAdapter({
      'api-c1': [{ uid: 'ext-1', vSaldo: 0, fModificado: '2026-05-10' }],
    })

    await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)

    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-1' },
      data: expect.objectContaining({ saldo: 0, condition: false }),
    })
  })

  it('saldo idéntico Y fModificado idéntico → no update', async () => {
    const upd = new Date('2026-05-10T00:00:00Z')
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-1', saldo: 60, valor: 100, externalUpdatedAt: upd },
    ])
    const adapter = makeAdapter({
      'api-c1': [{ uid: 'ext-1', vSaldo: 60, fModificado: '2026-05-10T00:00:00Z' }],
    })

    const result = await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)
    expect((prisma as any).syncDeuda.update).not.toHaveBeenCalled()
    expect(result.deudasActualizadas).toBe(0)
  })

  it('saldo igual pero fModificado distinto → SÍ actualiza (timestamp drift)', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-1', saldo: 60, valor: 100, externalUpdatedAt: new Date('2026-05-01') },
    ])
    const adapter = makeAdapter({
      'api-c1': [{ uid: 'ext-1', vSaldo: 60, fModificado: '2026-05-10T00:00:00Z' }],
    })

    const result = await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)
    expect((prisma as any).syncDeuda.update).toHaveBeenCalled()
    expect(result.deudasActualizadas).toBe(1)
  })

  it('deuda local no aparece en respuesta UpTres → skip (no update)', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-huerfana', saldo: 100, valor: 100, externalUpdatedAt: null },
    ])
    const adapter = makeAdapter({ 'api-c1': [] }) // UpTres no devolvió la deuda

    const result = await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)
    expect((prisma as any).syncDeuda.update).not.toHaveBeenCalled()
    expect(result.deudasActualizadas).toBe(0)
  })

  it('adapter throw para un cliente → continúa con los demás', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
      { syncDeudaId: 'sd-2', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-1', saldo: 100, valor: 100, externalUpdatedAt: null },
      { id: 'sd-2', clienteApiId: 'api-c2', externalId: 'ext-2', saldo: 50, valor: 50, externalUpdatedAt: null },
    ])
    const adapter = makeAdapter(
      { 'api-c2': [{ uid: 'ext-2', vSaldo: 30, fModificado: '2026-05-10' }] },
      new Set(['api-c1']) // c1 falla
    )

    const result = await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)

    // c1 falló pero c2 SÍ se actualizó
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledTimes(1)
    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-2' },
      data: expect.objectContaining({ saldo: 30 }),
    })
    expect(result.clientes).toBe(2)            // ambos contados
    expect(result.deudasActualizadas).toBe(1)   // solo el que no falló
  })

  it('UpTres devuelve balance (no vSaldo) → tolera ambos campos', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-1', saldo: 100, valor: 100, externalUpdatedAt: null },
    ])
    const adapter = makeAdapter({
      'api-c1': [{ uid: 'ext-1', balance: 25, fModificado: '2026-05-10' }], // ← balance, no vSaldo
    })

    await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)

    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-1' },
      data: expect.objectContaining({ saldo: 25 }),
    })
  })

  it('UpTres devuelve deuda sin fModificado → usa Date now', async () => {
    vi.useFakeTimers()
    const NOW = new Date('2026-05-12T12:00:00Z')
    vi.setSystemTime(NOW)

    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-1', saldo: 100, valor: 100, externalUpdatedAt: new Date('2026-05-01') },
    ])
    const adapter = makeAdapter({
      'api-c1': [{ uid: 'ext-1', vSaldo: 50 }], // sin fModificado
    })

    await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)

    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-1' },
      data: expect.objectContaining({ externalUpdatedAt: NOW }),
    })
    vi.useRealTimers()
  })

  it('abono = valor - saldoNuevo, nunca negativo', async () => {
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([
      { syncDeudaId: 'sd-1', createdAt: new Date() },
    ])
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      // saldo nuevo > valor (caso raro: UpTres devuelve más de lo facturado)
      { id: 'sd-1', clienteApiId: 'api-c1', externalId: 'ext-1', saldo: 50, valor: 100, externalUpdatedAt: null },
    ])
    const adapter = makeAdapter({
      'api-c1': [{ uid: 'ext-1', vSaldo: 150, fModificado: '2026-05-10' }], // ¡saldo mayor!
    })

    await refrescarDeudasConPagosPendientes(adapter, INT_ID, EMP_ID)

    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-1' },
      data: expect.objectContaining({ abono: 0 }), // max 0
    })
  })
})
