import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Redis cache — bypass para tests unitarios
vi.mock('@/lib/cache', () => ({
  withCache: vi.fn((_key: string, _ttl: number, fn: () => any) => fn()),
  invalidateKeys: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { syncDeuda: { findMany: vi.fn() } },
}))

vi.mock('@/lib/integracion/sync', () => ({
  calcularNSaldoPorDeuda: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { calcularNSaldoPorDeuda } from '@/lib/integracion/sync'
import { invalidateKeys } from '@/lib/cache'
import {
  getSaldoCliente,
  invalidarCacheCliente,
  invalidarCacheClientes,
} from '@/lib/cartera/saldoCliente'

const p = prisma as any
const calcMock = calcularNSaldoPorDeuda as any

function deudaRow(id: string, valor: number, nSaldo: number, data?: any) {
  return {
    id, externalId: `ext-${id}`, numeroFactura: 1001,
    valor, nSaldo, saldo: valor, condition: true,
    fechaVencimiento: '2026-10-01T00:00:00Z', diasCredito: 30,
    empleadoExternalId: null,
    nSaldoBase: null, nSaldoBaseAt: null, ajusteManual: null,
    data: data ?? null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getSaldoCliente', () => {
  it('cliente sin deudas → saldoTotal 0, deudas []', async () => {
    p.syncDeuda.findMany.mockResolvedValue([])
    const r = await getSaldoCliente('emp-01', 'cli-01', 'integ-01')
    expect(r.saldoTotal).toBe(0)
    expect(r.deudas).toHaveLength(0)
  })

  it('suma nSaldo calculado de múltiples deudas', async () => {
    p.syncDeuda.findMany.mockResolvedValue([
      deudaRow('d1', 100000, 100000),
      deudaRow('d2', 200000, 150000),
    ])
    calcMock.mockResolvedValue({ d1: 100000, d2: 150000 })
    const r = await getSaldoCliente('emp-01', 'cli-01', 'integ-01')
    expect(r.saldoTotal).toBe(250000)
    expect(r.deudas).toHaveLength(2)
  })

  it('extrae electronicInvoiceNumber de SyncDeuda.data', async () => {
    p.syncDeuda.findMany.mockResolvedValue([
      deudaRow('d1', 100000, 100000, { electronicInvoiceNumber: 68899 }),
    ])
    calcMock.mockResolvedValue({ d1: 100000 })
    const r = await getSaldoCliente('emp-01', 'cli-01', 'integ-01')
    expect((r.deudas[0] as any).electronicInvoiceNumber).toBe(68899)
  })

  it('data null → electronicInvoiceNumber null (no lanza error)', async () => {
    p.syncDeuda.findMany.mockResolvedValue([deudaRow('d1', 100000, 100000, null)])
    calcMock.mockResolvedValue({ d1: 100000 })
    const r = await getSaldoCliente('emp-01', 'cli-01', 'integ-01')
    expect((r.deudas[0] as any).electronicInvoiceNumber).toBeNull()
  })

  it('nSaldo ausente en map → fallback a nSaldo/saldo/valor', async () => {
    p.syncDeuda.findMany.mockResolvedValue([deudaRow('d1', 300000, 200000)])
    calcMock.mockResolvedValue({}) // d1 no en el map
    const r = await getSaldoCliente('emp-01', 'cli-01', 'integ-01')
    // fallback: Math.max(0, nSaldo=200000)
    expect(r.deudas[0].nSaldo).toBe(200000)
  })

  it('fechaVencimiento se convierte a ISO string', async () => {
    p.syncDeuda.findMany.mockResolvedValue([deudaRow('d1', 100000, 100000)])
    calcMock.mockResolvedValue({ d1: 100000 })
    const r = await getSaldoCliente('emp-01', 'cli-01', 'integ-01')
    expect(r.deudas[0].fechaVencimiento).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('invalidarCacheCliente / invalidarCacheClientes', () => {
  it('invalida key correcta para un cliente', async () => {
    await invalidarCacheCliente('emp-01', 'cli-01')
    expect(invalidateKeys).toHaveBeenCalledWith('g:emp-01:sc:cli-01')
  })

  it('invalida múltiples clientes en un solo llamado', async () => {
    await invalidarCacheClientes('emp-01', ['cli-01', 'cli-02'])
    expect(invalidateKeys).toHaveBeenCalledWith('g:emp-01:sc:cli-01', 'g:emp-01:sc:cli-02')
  })

  it('lista vacía → no llama invalidateKeys', async () => {
    await invalidarCacheClientes('emp-01', [])
    expect(invalidateKeys).not.toHaveBeenCalled()
  })
})
