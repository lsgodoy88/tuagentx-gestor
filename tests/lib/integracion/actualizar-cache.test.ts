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

function mockClienteYEmpleado() {
  ;(prisma as any).cliente.findMany.mockResolvedValue([
    { id: 'cli-1', apiId: API_ID, nombre: 'Cliente Test', nit: '123', telefono: '300', ciudad: 'Bogotá' },
  ])
  ;(prisma as any).empleado.findMany.mockResolvedValue([])
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('lib/integracion/sync — actualizarCache (v3)', () => {
  it('Lumeli + factura en LumeliSaldoInicial0206: nSaldo = saldoInicial - pagos POST-corte (ignora pagos pre-corte)', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-1', clienteApiId: API_ID, numeroFactura: 3547, valor: 500000, saldo: 999999, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-1', numeroOrden: 'ord-1', empleadoExternalId: null },
    ])
    ;(prisma as any).$queryRaw.mockResolvedValue([
      { numerofactura: 3547, saldoinicial: 200000 },
    ])
    // Un pago ANTES del corte (debe ignorarse, ya reflejado en saldoInicial) y uno DESPUÉS (debe restarse)
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([
      { syncDeudaId: 'sd-1', montoAplicado: 100000, descuento: 0, createdAt: new Date('2026-05-01T00:00:00-05:00'), PagoCartera: { saldoAnterior: 500000 } },
      { syncDeudaId: 'sd-1', montoAplicado: 50000, descuento: 0, createdAt: new Date('2026-06-10T00:00:00-05:00'), PagoCartera: { saldoAnterior: 200000 } },
    ])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LUMELI)

    expect((prisma as any).carteraCache.upsert).toHaveBeenCalledTimes(1)
    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(150000) // 200000 - 50000 (solo post-corte)
    expect(arg.create.deudas[0].saldo).toBe(150000)
  })

  it('Lumeli, factura en LumeliSaldoInicial0206, sin pagos post-corte: nSaldo = saldoInicial completo', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-2', clienteApiId: API_ID, numeroFactura: 9001, valor: 300000, saldo: 999999, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-2', numeroOrden: 'ord-2', empleadoExternalId: null },
    ])
    ;(prisma as any).$queryRaw.mockResolvedValue([
      { numerofactura: 9001, saldoinicial: 300000 },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LUMELI)

    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(300000)
  })

  it('Lumeli, factura NUEVA (no en LumeliSaldoInicial0206): usa nSaldo persistido en BD', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-3', clienteApiId: API_ID, numeroFactura: 99999, valor: 100000, nSaldo: 70000, saldo: 70000, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-3', numeroOrden: 'ord-3', empleadoExternalId: null },
    ])
    ;(prisma as any).$queryRaw.mockResolvedValue([
      { numerofactura: 3547, saldoinicial: 200000 }, // no incluye 99999
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([
      { syncDeudaId: 'sd-3', montoAplicado: 30000, descuento: 0, createdAt: new Date('2026-06-15T00:00:00-05:00'), PagoCartera: { saldoAnterior: 100000 } },
    ])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LUMELI)

    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(70000) // nSaldo persistido en BD por aplicarPagoEnCache
  })

  it('Leche (sin tabla LumeliSaldoInicial0206 aplicable): nunca llama $queryRaw, usa v2/v1', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-4', clienteApiId: API_ID, numeroFactura: 1, valor: 80000, saldo: 50000, abono: 30000, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-4', numeroOrden: 'ord-4', empleadoExternalId: null },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LECHE)

    expect((prisma as any).$queryRaw).not.toHaveBeenCalled()
    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(50000) // sin pago nuestro y sin archivo → saldo crudo (v1 fallback)
  })

  it('Leche con pago nuestro: usa nSaldo persistido (aplicarPagoEnCache ya lo actualizó)', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-5', clienteApiId: API_ID, numeroFactura: 2, valor: 100000, nSaldo: 60000, saldo: 60000, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-5', numeroOrden: 'ord-5', empleadoExternalId: null },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([
      { syncDeudaId: 'sd-5', montoAplicado: 40000, descuento: 0, createdAt: new Date('2026-06-20T00:00:00-05:00'), PagoCartera: { saldoAnterior: 100000 } },
    ])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LECHE)

    const arg = (prisma as any).carteraCache.upsert.mock.calls[0][0]
    expect(arg.create.saldoPendiente).toBe(60000) // nSaldo ya actualizado por aplicarPagoEnCache
  })

  it('saldoPendiente llega a 0 → deleteMany explícito en vez de upsert (evita huérfanos)', async () => {
    mockClienteYEmpleado()
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-6', clienteApiId: API_ID, numeroFactura: 3548, valor: 200000, saldo: 999999, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'ext-6', numeroOrden: 'ord-6', empleadoExternalId: null },
    ])
    ;(prisma as any).$queryRaw.mockResolvedValue([
      { numerofactura: 3548, saldoinicial: 50000 },
    ])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([
      { syncDeudaId: 'sd-6', montoAplicado: 50000, descuento: 0, createdAt: new Date('2026-06-10T00:00:00-05:00'), PagoCartera: { saldoAnterior: 200000 } },
    ])

    await actualizarCache(new Set([API_ID]), INT_ID, EMPRESA_LUMELI)

    expect((prisma as any).carteraCache.upsert).not.toHaveBeenCalled()
    expect((prisma as any).carteraCache.deleteMany).toHaveBeenCalledWith({
      where: { integracionId: INT_ID, clienteApiId: API_ID },
    })
  })

  it('consulta LumeliSaldoInicial0206 UNA sola vez aunque haya múltiples clientes Lumeli (no por cliente en el loop)', async () => {
    ;(prisma as any).cliente.findMany.mockResolvedValue([
      { id: 'cli-1', apiId: 'api-1', nombre: 'A', nit: '1', telefono: '1', ciudad: 'X' },
      { id: 'cli-2', apiId: 'api-2', nombre: 'B', nit: '2', telefono: '2', ciudad: 'X' },
    ])
    ;(prisma as any).empleado.findMany.mockResolvedValue([])
    ;(prisma as any).syncDeuda.findMany.mockResolvedValue([
      { id: 'sd-a', clienteApiId: 'api-1', numeroFactura: 1, valor: 10000, saldo: 10000, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'e1', numeroOrden: 'o1', empleadoExternalId: null },
      { id: 'sd-b', clienteApiId: 'api-2', numeroFactura: 2, valor: 10000, saldo: 10000, abono: 0, fechaVencimiento: null, diasCredito: 30, externalId: 'e2', numeroOrden: 'o2', empleadoExternalId: null },
    ])
    ;(prisma as any).$queryRaw.mockResolvedValue([])
    ;(prisma as any).pagoCarteraDeuda.findMany.mockResolvedValue([])

    await actualizarCache(new Set(['api-1', 'api-2']), INT_ID, EMPRESA_LUMELI)

    expect((prisma as any).$queryRaw).toHaveBeenCalledTimes(1)
  })
})
