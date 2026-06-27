import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncDeuda: { findMany: vi.fn() },
    cliente: { findMany: vi.fn() },
    empleado: { findMany: vi.fn() },
    pagoCarteraDeuda: { findMany: vi.fn() },
    carteraCache: { deleteMany: vi.fn(), upsert: vi.fn() },
  },
}))

import { actualizarCache } from '@/lib/integracion/sync'
import { prisma } from '@/lib/prisma'

const INT_ID = 'intg-1'
const EMP_ID = 'emp-1'

// Helpers para mock data
// NOTA 26/06: 'saldo' aqui es el VALOR de la factura por defecto (igual a valor),
// ya que con nSaldo el saldo real se calcula como valor - SUM(pagos), no se lee
// directo de SyncDeuda.saldo. Los tests que necesitan simular pagos los agregan
// via mockAplicaciones().
const baseDeuda = (overrides: any = {}) => ({
  id: 'sd-1',
  externalId: 'ext-1',
  clienteApiId: 'api-c1',
  numeroOrden: 1,
  numeroFactura: 101,
  valor: 100,
  saldo: 100, // crudo UpTres — ya no se usa para el saldo mostrado, solo referencia
  abono: 0,
  diasCredito: 30,
  fechaVencimiento: null,
  empleadoExternalId: 'emp-ext-1',
  ...overrides,
})

function mockSinAplicaciones() {
  vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValue([])
}

function mockAplicaciones(apps: Array<{ syncDeudaId: string; montoAplicado: number; descuento?: number }>) {
  vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValue(apps)
}

describe('lib/integracion/sync — actualizarCache', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('set vacío → no hace nada (short-circuit)', async () => {
    await actualizarCache(new Set(), INT_ID, EMP_ID)
    expect(prisma.syncDeuda.findMany).not.toHaveBeenCalled()
    expect((prisma as any).carteraCache.upsert).not.toHaveBeenCalled()
  })

  it('cliente sin deudas activas → deleteMany de su cache', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([]) // sin deudas activas
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'X', nit: '900', telefono: null, ciudad: null },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockSinAplicaciones()

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    expect((prisma as any).carteraCache.deleteMany).toHaveBeenCalledWith({
      where: { integracionId: INT_ID, clienteApiId: 'api-c1' },
    })
    expect((prisma as any).carteraCache.upsert).not.toHaveBeenCalled()
  })

  it('cliente con 1 deuda, sin pagos nuestros → upsert con saldoTotal/saldoPendiente = valor completo', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ valor: 100, saldo: 80, abono: 20 }), // saldo crudo UpTres ya no se usa
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'Cliente X', nit: '900', telefono: '+57', ciudad: 'Ibagué' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([
      { apiId: 'emp-ext-1', nombre: 'Vendedor A' },
    ])
    mockSinAplicaciones()

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).carteraCache.upsert).mock.calls[0][0]
    expect(args.create.saldoTotal).toBe(100)
    expect(args.create.saldoPendiente).toBe(100) // nSaldo = valor - 0 pagos = 100
    expect(args.create.totalDeudas).toBe(1)
    expect(args.create.nombre).toBe('Cliente X')
    expect(args.create.empleadoNombre).toBe('Vendedor A')
  })

  it('FIX 26/06 — nSaldo = valor - pagos nuestros, ignora saldo crudo de UpTres', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ id: 'sd-1', valor: 100, saldo: 999 }), // saldo crudo deliberadamente distinto, no debe usarse
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'X', nit: '900' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockAplicaciones([{ syncDeudaId: 'sd-1', montoAplicado: 30 }])

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).carteraCache.upsert).mock.calls[0][0]
    // nSaldo = 100 - 30 = 70, NO 999 (saldo crudo) — confirma que ya no se usa d.saldo directo
    expect(args.create.saldoPendiente).toBe(70)
    expect(args.create.deudas[0].saldo).toBe(70)
    expect((prisma as any).pagoCarteraDeuda.findMany).toHaveBeenCalled()
  })

  it('pagos cubren el valor completo → nSaldo=0, cliente se elimina del cache', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ id: 'sd-1', valor: 100, saldo: 100 }),
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'X', nit: '900' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockAplicaciones([{ syncDeudaId: 'sd-1', montoAplicado: 100 }])

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    // saldoPendiente=0 → cliente se elimina del cache, no se upserta
    expect(vi.mocked((prisma as any).carteraCache.upsert)).not.toHaveBeenCalled()
    expect(vi.mocked((prisma as any).carteraCache.deleteMany)).toHaveBeenCalled()
  })

  it('pagos superan el valor → nSaldo nunca negativo (max 0), se elimina del cache', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ id: 'sd-1', valor: 100, saldo: 100 }),
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'X', nit: '900' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockAplicaciones([{ syncDeudaId: 'sd-1', montoAplicado: 150 }]) // pago mayor al valor

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    expect(vi.mocked((prisma as any).carteraCache.upsert)).not.toHaveBeenCalled()
    expect(vi.mocked((prisma as any).carteraCache.deleteMany)).toHaveBeenCalled()
  })

  it('descuento cuenta igual que un pago — reduce nSaldo', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ id: 'sd-1', valor: 100, saldo: 100 }),
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'X', nit: '900' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockAplicaciones([{ syncDeudaId: 'sd-1', montoAplicado: 60, descuento: 10 }])

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).carteraCache.upsert).mock.calls[0][0]
    // nSaldo = 100 - (60 + 10) = 30
    expect(args.create.saldoPendiente).toBe(30)
  })

  it('empleadoPrincipal = el más frecuente entre las deudas del cliente', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ id: 'sd-1', externalId: 'ext-1', empleadoExternalId: 'emp-X' }),
      baseDeuda({ id: 'sd-2', externalId: 'ext-2', empleadoExternalId: 'emp-X' }),
      baseDeuda({ id: 'sd-3', externalId: 'ext-3', empleadoExternalId: 'emp-Y' }), // Y solo 1 vez
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'X', nit: '900' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([
      { apiId: 'emp-X', nombre: 'Empleado X (mayoría)' },
      { apiId: 'emp-Y', nombre: 'Empleado Y' },
    ])
    mockSinAplicaciones()

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).carteraCache.upsert).mock.calls[0][0]
    expect(args.create.empleadoExternalId).toBe('emp-X')
    expect(args.create.empleadoNombre).toBe('Empleado X (mayoría)')
  })

  it('empleado externalId sin match en empleados → empleadoNombre null', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ empleadoExternalId: 'emp-huerfano' }),
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'X', nit: '900' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockSinAplicaciones()

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).carteraCache.upsert).mock.calls[0][0]
    expect(args.create.empleadoExternalId).toBe('emp-huerfano')
    expect(args.create.empleadoNombre).toBeNull()
  })

  it('deudas todas sin empleadoExternalId → empleadoPrincipal null', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ empleadoExternalId: null }),
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'X', nit: '900' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockSinAplicaciones()

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).carteraCache.upsert).mock.calls[0][0]
    expect(args.create.empleadoExternalId).toBeNull()
    expect(args.create.empleadoNombre).toBeNull()
  })

  it('porEstado agrupa saldos por estado de cartera (pendiente/vencida/mora/crítica/pagada)', async () => {
    const haceMucho = new Date(Date.now() - 100 * 86400000) // crítica (>90d)
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ id: 'sd-vigente', externalId: 'e1', saldo: 100, valor: 100,
        fechaVencimiento: new Date(Date.now() + 60 * 86400000) }), // vence en 60d → vigente
      baseDeuda({ id: 'sd-critica', externalId: 'e2', saldo: 200, valor: 200,
        fechaVencimiento: haceMucho }), // crítica
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'X', nit: '900' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockSinAplicaciones()

    await actualizarCache(new Set(['api-c1']), INT_ID, EMP_ID)

    const args = vi.mocked((prisma as any).carteraCache.upsert).mock.calls[0][0]
    expect(args.create.porEstado.critica).toBe(200)
    expect(args.create.porEstado.pendiente + args.create.porEstado.vigente || 0).toBeGreaterThanOrEqual(0)
    // saldoPendiente total = 300 (sin pagos nuestros, nSaldo = valor completo)
    expect(args.create.saldoPendiente).toBe(300)
  })

  it('múltiples clientes en el set → upsert por cada uno', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ id: 'sd-1', clienteApiId: 'api-c1' }),
      baseDeuda({ id: 'sd-2', clienteApiId: 'api-c2' }),
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
      { id: 'c1', apiId: 'api-c1', nombre: 'A', nit: '1' },
      { id: 'c2', apiId: 'api-c2', nombre: 'B', nit: '2' },
    ])
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockSinAplicaciones()

    await actualizarCache(new Set(['api-c1', 'api-c2']), INT_ID, EMP_ID)

    expect((prisma as any).carteraCache.upsert).toHaveBeenCalledTimes(2)
  })

  it('cliente del set sin match en BD → skip silencioso', async () => {
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
      baseDeuda({ clienteApiId: 'api-huerfano' }),
    ])
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([]) // sin clientes
    vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
    mockSinAplicaciones()

    await actualizarCache(new Set(['api-huerfano']), INT_ID, EMP_ID)

    expect((prisma as any).carteraCache.upsert).not.toHaveBeenCalled()
  })
})
