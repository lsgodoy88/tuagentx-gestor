import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rutaFijaCliente: { findMany: vi.fn() },
    cliente: { findMany: vi.fn() },
    visita: { findMany: vi.fn() },
    ventaMesCliente: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { recalcularVentasMesImpulsos } from '@/lib/integracion/venta-mes'
import { prisma } from '@/lib/prisma'

const EMP_ID = 'emp-1'

function makeAdapter(ventasPorApiId: Record<string, any[]> = {}) {
  return {
    fetchVentas: vi.fn(async (_inicio: Date, apiId: string) => {
      return ventasPorApiId[apiId] || []
    }),
  } as any
}

describe('lib/integracion/venta-mes — recalcularVentasMesImpulsos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked((prisma as any).$transaction).mockImplementation(async (ops: any) => ops)
  })

  it('sin clientes en rutas → short-circuit, no toca BD', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([])
    await recalcularVentasMesImpulsos(EMP_ID)
    expect(prisma.cliente.findMany).not.toHaveBeenCalled()
    expect((prisma as any).ventaMesCliente.upsert).not.toHaveBeenCalled()
  })

  it('busca clientes en rutas fijas filtradas por empresaId, distinct clienteId', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([])
    await recalcularVentasMesImpulsos(EMP_ID)
    expect((prisma as any).rutaFijaCliente.findMany).toHaveBeenCalledWith({
      where: { rutaFija: { empresaId: EMP_ID } },
      select: { clienteId: true },
      distinct: ['clienteId'],
    })
  })

  it('con empleadoId opcional filtra rutas del vendedor', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([])
    await recalcularVentasMesImpulsos(EMP_ID, undefined, 'vendedor-1')
    expect((prisma as any).rutaFijaCliente.findMany).toHaveBeenCalledWith({
      where: { rutaFija: { empresaId: EMP_ID, empleadoId: 'vendedor-1' } },
      select: { clienteId: true },
      distinct: ['clienteId'],
    })
  })

  it('cliente con apiId + adapter → upsert con ventas de UpTres agrupadas por mes', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([{ clienteId: 'c1' }])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1' } as any,
    ])
    const adapter = makeAdapter({
      'api-c1': [
        { cliente: { uid: 'api-c1' }, fCreado: '2026-04-05T00:00:00Z', vTotal: 100 },
        { cliente: { uid: 'api-c1' }, fCreado: '2026-04-15T00:00:00Z', vTotal: 50 },
        { cliente: { uid: 'api-c1' }, fCreado: '2026-05-01T00:00:00Z', vTotal: 200 },
      ],
    })

    await recalcularVentasMesImpulsos(EMP_ID, adapter)

    // 2 upserts: 2026-04 (150, 2 visitas) y 2026-05 (200, 1 visita)
    expect((prisma as any).ventaMesCliente.upsert).toHaveBeenCalledTimes(2)
    const callsByMes = vi.mocked((prisma as any).ventaMesCliente.upsert).mock.calls
      .reduce((acc: any, [args]: any) => {
        acc[args.where.clienteId_mes.mes] = args.create
        return acc
      }, {})
    expect(callsByMes['2026-04']).toMatchObject({ totalVenta: 150, cantidadVisitas: 2 })
    expect(callsByMes['2026-05']).toMatchObject({ totalVenta: 200, cantidadVisitas: 1 })
  })

  it('ventas de OTRO cliente devueltas en error por UpTres → ignoradas (filtro cliente.uid)', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([{ clienteId: 'c1' }])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1' } as any,
    ])
    const adapter = makeAdapter({
      'api-c1': [
        { cliente: { uid: 'api-c1' }, fCreado: '2026-05-01', vTotal: 100 },
        { cliente: { uid: 'OTRO' }, fCreado: '2026-05-01', vTotal: 99999 }, // ignorada
      ],
    })

    await recalcularVentasMesImpulsos(EMP_ID, adapter)

    const args = vi.mocked((prisma as any).ventaMesCliente.upsert).mock.calls[0][0]
    expect(args.create.totalVenta).toBe(100)
    expect(args.create.cantidadVisitas).toBe(1)
  })

  it('ventas sin fCreado pero con fModificado → usa fModificado', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([{ clienteId: 'c1' }])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1' } as any,
    ])
    const adapter = makeAdapter({
      'api-c1': [{ cliente: { uid: 'api-c1' }, fModificado: '2026-03-10', vTotal: 50 }],
    })

    await recalcularVentasMesImpulsos(EMP_ID, adapter)

    const args = vi.mocked((prisma as any).ventaMesCliente.upsert).mock.calls[0][0]
    expect(args.where.clienteId_mes.mes).toBe('2026-03')
  })

  it('ventas sin fecha o fecha inválida → skip', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([{ clienteId: 'c1' }])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1' } as any,
    ])
    const adapter = makeAdapter({
      'api-c1': [
        { cliente: { uid: 'api-c1' }, vTotal: 100 },                    // sin fecha
        { cliente: { uid: 'api-c1' }, fCreado: 'fecha-invalida', vTotal: 100 }, // inválida
        { cliente: { uid: 'api-c1' }, fCreado: '2026-05-01', vTotal: 80 }, // válida
      ],
    })

    await recalcularVentasMesImpulsos(EMP_ID, adapter)

    expect((prisma as any).ventaMesCliente.upsert).toHaveBeenCalledTimes(1)
    const args = vi.mocked((prisma as any).ventaMesCliente.upsert).mock.calls[0][0]
    expect(args.create.totalVenta).toBe(80)
  })

  it('adapter throw → cliente saltado, no rompe el batch', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([
      { clienteId: 'c1' }, { clienteId: 'c2' },
    ])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1' },
      { id: 'c2', apiId: 'api-c2' },
    ] as any)
    const adapter = {
      fetchVentas: vi.fn(async (_i: Date, apiId: string) => {
        if (apiId === 'api-c1') throw new Error('boom')
        return [{ cliente: { uid: 'api-c2' }, fCreado: '2026-05-01', vTotal: 60 }]
      }),
    } as any

    await recalcularVentasMesImpulsos(EMP_ID, adapter)

    // c2 se procesó aunque c1 falló
    expect((prisma as any).ventaMesCliente.upsert).toHaveBeenCalledTimes(1)
    const args = vi.mocked((prisma as any).ventaMesCliente.upsert).mock.calls[0][0]
    expect(args.where.clienteId_mes.clienteId).toBe('c2')
  })

  it('cliente SIN apiId → usa Visita.monto en lugar del adapter', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([{ clienteId: 'c1' }])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: null } as any,
    ])
    vi.mocked(prisma.visita.findMany).mockResolvedValue([
      { clienteId: 'c1', monto: 150, fechaBogota: new Date('2026-05-05') },
      { clienteId: 'c1', monto: 50,  fechaBogota: new Date('2026-05-10') },
    ] as any)

    await recalcularVentasMesImpulsos(EMP_ID, undefined)

    expect(prisma.visita.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        clienteId: { in: ['c1'] },
        tipo: 'venta',
        monto: { gt: 0 },
      }),
      select: { clienteId: true, monto: true, fechaBogota: true },
    })
    const args = vi.mocked((prisma as any).ventaMesCliente.upsert).mock.calls[0][0]
    expect(args.create.totalVenta).toBe(200)
    expect(args.create.cantidadVisitas).toBe(2)
  })

  it('mezcla: 1 cliente con apiId (UpTres) + 1 sin (Visita) → upserts separados', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([
      { clienteId: 'c1' }, { clienteId: 'c2' },
    ])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1' },
      { id: 'c2', apiId: null },
    ] as any)
    vi.mocked(prisma.visita.findMany).mockResolvedValue([
      { clienteId: 'c2', monto: 70, fechaBogota: new Date('2026-05-05') },
    ] as any)
    const adapter = makeAdapter({
      'api-c1': [{ cliente: { uid: 'api-c1' }, fCreado: '2026-05-15', vTotal: 200 }],
    })

    await recalcularVentasMesImpulsos(EMP_ID, adapter)

    expect((prisma as any).ventaMesCliente.upsert).toHaveBeenCalledTimes(2)
    const calls = vi.mocked((prisma as any).ventaMesCliente.upsert).mock.calls.map((c: any) => c[0])
    const erp = calls.find((c: any) => c.where.clienteId_mes.clienteId === 'c1')
    const app = calls.find((c: any) => c.where.clienteId_mes.clienteId === 'c2')
    expect(erp.create.totalVenta).toBe(200)
    expect(app.create.totalVenta).toBe(70)
  })

  it('todas las upserts se envuelven en $transaction', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([{ clienteId: 'c1' }])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1' } as any,
    ])
    const adapter = makeAdapter({
      'api-c1': [{ cliente: { uid: 'api-c1' }, fCreado: '2026-05-01', vTotal: 100 }],
    })

    await recalcularVentasMesImpulsos(EMP_ID, adapter)

    expect((prisma as any).$transaction).toHaveBeenCalledOnce()
  })

  it('sin nada que upsertar → no llama $transaction', async () => {
    vi.mocked((prisma as any).rutaFijaCliente.findMany).mockResolvedValue([{ clienteId: 'c1' }])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1' } as any,
    ])
    // Adapter no devuelve nada utilizable
    const adapter = makeAdapter({ 'api-c1': [] })

    await recalcularVentasMesImpulsos(EMP_ID, adapter)

    expect((prisma as any).$transaction).not.toHaveBeenCalled()
    expect((prisma as any).ventaMesCliente.upsert).not.toHaveBeenCalled()
  })
})
