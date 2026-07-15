import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  DB_SCHEMA: 'gestor',
  prisma: {
    syncDeuda: { findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    cliente: { findMany: vi.fn() },
    empleado: { findMany: vi.fn() },
    pagoCarteraDeuda: { findMany: vi.fn() },
    carteraCache: { upsert: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

import { actualizarCache } from '@/lib/integracion/sync'
import { prisma } from '@/lib/prisma'

const INT_ID = 'intg-1'
const EMPRESA_LUMELI = 'cmn7oiutk0001vmega46373b4'
const EMPRESA_LECHE = 'cmojhfct40000znvfaos1jy1m'
const API_ID = 'cliente-api-1'
const BASE_AT = new Date('2026-06-02T05:00:00Z')

function mockClienteYEmpleado() {
  ;(prisma as any).cliente.findMany.mockResolvedValue([
    { id: 'cli-1', apiId: API_ID, nombre: 'Cliente Test', nit: '123', telefono: '300', ciudad: 'Bogotá' },
  ])
  ;(prisma as any).empleado.findMany.mockResolvedValue([])
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('lib/integracion/sync — actualizarCache (v3 Rama 0)', () => {
  it('Rama 0: nSaldoBase - pagos POST-nSaldoBaseAt (ignora pagos pre-corte)', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-1', clienteApiId: API_ID, numeroFactura: 3547, valor: 500000, saldo: 999999, nSaldo: 200000, nSaldoBase: 200000, nSaldoBaseAt: BASE_AT, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-1', numeroOrden: 'ord-1', empleadoExternalId: null },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([
      { syncDeudaId: 'sd-1', montoAplicado: 100000, createdAt: new Date('2026-05-01T00:00:00Z') }, // pre-corte → ignorado
      { syncDeudaId: 'sd-1', montoAplicado: 50000, createdAt: new Date('2026-06-10T00:00:00Z') },  // post-corte → resta
    ])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LUMELI)

    expect((prisma as any).carteraCache.upsert).toHaveBeenCalledTimes(1)
    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(150000) // 200000 - 50000
    expect(arg.create.deudas[0].saldo).toBe(150000)
  })

  it('Rama 0: sin pagos post-corte → nSaldo = nSaldoBase completo', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-2', clienteApiId: API_ID, numeroFactura: 9001, valor: 300000, saldo: 999999, nSaldo: 300000, nSaldoBase: 300000, nSaldoBaseAt: BASE_AT, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-2', numeroOrden: 'ord-2', empleadoExternalId: null },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LUMELI)

    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(300000)
  })

  it('Rama 2 (sin nSaldoBase): usa nSaldo persistido en BD', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-3', clienteApiId: API_ID, numeroFactura: 99999, valor: 100000, nSaldo: 70000, saldo: 70000, nSaldoBase: null, nSaldoBaseAt: null, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-3', numeroOrden: 'ord-3', empleadoExternalId: null },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([
      { syncDeudaId: 'sd-3', montoAplicado: 30000, createdAt: new Date('2026-06-15T00:00:00Z') },
    ])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LUMELI)

    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(70000)
  })

  it('nunca llama $queryRaw (LumeliSaldoInicial0206 eliminada)', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-4', clienteApiId: API_ID, numeroFactura: 1, valor: 80000, saldo: 50000, nSaldo: 50000, nSaldoBase: null, nSaldoBaseAt: null, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-4', numeroOrden: 'ord-4', empleadoExternalId: null },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LECHE)

    expect((prisma as any).$queryRaw).not.toHaveBeenCalled()
    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(50000)
  })

  it('Leche con pago nuestro: usa nSaldo persistido', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-5', clienteApiId: API_ID, numeroFactura: 2, valor: 100000, nSaldo: 60000, saldo: 60000, nSaldoBase: null, nSaldoBaseAt: null, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-5', numeroOrden: 'ord-5', empleadoExternalId: null },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([
      { syncDeudaId: 'sd-5', montoAplicado: 40000, createdAt: new Date('2026-06-20T00:00:00Z') },
    ])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LECHE)

    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(60000)
  })

  it('saldoPendiente llega a 0 → deleteMany en vez de upsert', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-6', clienteApiId: API_ID, numeroFactura: 3548, valor: 200000, saldo: 999999, nSaldo: 50000, nSaldoBase: 50000, nSaldoBaseAt: BASE_AT, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-6', numeroOrden: 'ord-6', empleadoExternalId: null },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([
      { syncDeudaId: 'sd-6', montoAplicado: 50000, createdAt: new Date('2026-06-10T00:00:00Z') },
    ])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LUMELI)

    expect((prisma as any).carteraCache.upsert).not.toHaveBeenCalled()
    expect((prisma as any).carteraCache.deleteMany).toHaveBeenCalledWith({
      where: { integracionId: INT_ID, clienteApiId: API_ID },
    })
  })
})
