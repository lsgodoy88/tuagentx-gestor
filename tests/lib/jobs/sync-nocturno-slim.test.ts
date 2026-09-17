/**
 * tests/lib/jobs/sync-nocturno-slim.test.ts
 * Tests de orquestación del flujo slim (2026-09-17).
 * Mockea BD + UpTres HTTP. No mockea reconciliarDeuda/reconstruirCartera
 * (tienen sus propios tests) — los deja correr sobre BD mockeada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockLogin, mockFetchDeudasDesde, mockActualizarDeudasInactivas,
  mockInvalidarCacheClientes, mockPrisma,
} = vi.hoisted(() => {
  const mockLogin = vi.fn().mockResolvedValue(undefined)
  const mockFetchDeudasDesde = vi.fn().mockResolvedValue([])
  const mockActualizarDeudasInactivas = vi.fn().mockResolvedValue(0)
  const mockInvalidarCacheClientes = vi.fn().mockResolvedValue(undefined)
  const mockPrisma = {
    integracion: { findMany: vi.fn() },
    syncDeuda: {
      aggregate: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    pagoCarteraDeuda: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn().mockResolvedValue({ _max: { envioFecha: null } }),
    },
    pagoCartera: { update: vi.fn().mockResolvedValue({}) },
    carteraCache: {
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    cliente: {
      count: vi.fn().mockResolvedValue(10),
      findMany: vi.fn().mockResolvedValue([]),
    },
    empleado: {
      count: vi.fn().mockResolvedValue(5),
      findMany: vi.fn().mockResolvedValue([]),
    },
    listaClientes: { count: vi.fn().mockResolvedValue(2) },
    syncLog: { create: vi.fn().mockResolvedValue({}) },
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  }
  return {
    mockLogin, mockFetchDeudasDesde, mockActualizarDeudasInactivas,
    mockInvalidarCacheClientes, mockPrisma,
  }
})

vi.mock('@/lib/integracion/adapters/uptres', () => {
  const UpTresAdapter = vi.fn()
  UpTresAdapter.prototype.login = mockLogin
  UpTresAdapter.prototype.fetchDeudasDesde = mockFetchDeudasDesde
  return { UpTresAdapter }
})
vi.mock('@/lib/integracion/sync', () => ({
  actualizarDeudasInactivas: mockActualizarDeudasInactivas,
}))
vi.mock('@/lib/cartera/saldoCliente', () => ({
  invalidarCacheClientes: mockInvalidarCacheClientes,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/cache', () => ({ invalidatePattern: vi.fn() }))
vi.mock('@/lib/redis', () => ({ redis: {} }))
vi.mock('@/lib/crypto-uptres', () => ({ decrypt: vi.fn().mockReturnValue('secret') }))
vi.mock('@/lib/fechas', () => ({ nowBogota: vi.fn().mockReturnValue(new Date()) }))
vi.mock('@/lib/cartera/calcularSaldo', () => ({
  calcularNSaldoBatch: vi.fn().mockReturnValue({}),
}))
vi.mock('@/lib/cartera/index', () => ({
  calcularEstado: vi.fn().mockReturnValue({ estado: 'vigente' }),
}))

process.env.UPTRES_SECRET = 'test-secret'
process.env.DB_SCHEMA = 'gestor_staging'

import { runSyncNocturno } from '@/lib/jobs/sync-nocturno'

const INTG = {
  id: 'intg-1', empresaId: 'emp-1',
  config: { apiKey: 'pk_test', apiSecret: 'enc' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLogin.mockResolvedValue(undefined)
  mockFetchDeudasDesde.mockResolvedValue([])
  mockActualizarDeudasInactivas.mockResolvedValue(0)
  mockPrisma.integracion.findMany.mockResolvedValue([INTG])
  mockPrisma.syncDeuda.aggregate.mockResolvedValue({ _max: { receivableAt: null } })
  mockPrisma.syncDeuda.findMany.mockResolvedValue([])
  mockPrisma.pagoCarteraDeuda.findMany.mockResolvedValue([])
  mockPrisma.syncLog.create.mockResolvedValue({})
})

// ── Sin actividad ─────────────────────────────────────────────────────────────
describe('runSyncNocturno slim — sin actividad', () => {
  it('login se llama siempre', async () => {
    await runSyncNocturno()
    expect(mockLogin).toHaveBeenCalledTimes(1)
  })

  it('fetchDeudasDesde se llama siempre', async () => {
    await runSyncNocturno()
    expect(mockFetchDeudasDesde).toHaveBeenCalledTimes(1)
  })

  it('actualizarDeudasInactivas se llama siempre', async () => {
    await runSyncNocturno()
    expect(mockActualizarDeudasInactivas).toHaveBeenCalledTimes(1)
  })

  it('invalidarCacheClientes se llama con array vacío', async () => {
    await runSyncNocturno()
    expect(mockInvalidarCacheClientes).toHaveBeenCalledWith('emp-1', [])
  })

  it('resultado sin error', async () => {
    const result = await runSyncNocturno()
    expect(result[0].error).toBeUndefined()
    expect(result[0].clientesCache).toBe(0)
  })
})

// ── Cursor receivableAt ───────────────────────────────────────────────────────
describe('runSyncNocturno slim — cursor receivableAt', () => {
  it('con max receivableAt → desde = max - 5min', async () => {
    const maxDate = new Date('2026-09-16T10:00:00Z')
    mockPrisma.syncDeuda.aggregate.mockResolvedValue({ _max: { receivableAt: maxDate } })
    await runSyncNocturno()
    const desde = mockFetchDeudasDesde.mock.calls[0][0] as Date
    expect(desde.getTime()).toBe(maxDate.getTime() - 5 * 60 * 1000)
  })

  it('sin receivableAt → desde ≈ 2 días atrás', async () => {
    mockPrisma.syncDeuda.aggregate.mockResolvedValue({ _max: { receivableAt: null } })
    const antes = Date.now() - 2 * 24 * 60 * 60 * 1000
    await runSyncNocturno()
    const desde = mockFetchDeudasDesde.mock.calls[0][0] as Date
    expect(Math.abs(desde.getTime() - antes)).toBeLessThan(2000)
  })
})

// ── Con deuda existente afectada ──────────────────────────────────────────────
describe('runSyncNocturno slim — deuda existente afectada', () => {
  const sdLocal = {
    id: 'sd-1', externalId: 'ext-1',
    saldo: 150000, saldoUptresOriginal: 150000,
    clienteApiId: 'cli-1', fechaVencimiento: null,
  }
  const deudaUpTres = {
    uid: 'ext-1', _id: 'ext-1',
    vSaldo: '100000', vTotal: '500000',
    condicionUpTres: true,
    fModificado: '2026-09-16T10:00:00Z',
    receivableAt: '2026-09-16',
    cliente: { uid: 'cli-1' },
  }

  beforeEach(() => {
    mockFetchDeudasDesde.mockResolvedValue([deudaUpTres])
    mockPrisma.syncDeuda.findMany.mockResolvedValue([sdLocal])
  })

  it('SyncDeuda.update llamado (reconciliarDeuda actualiza metadata)', async () => {
    await runSyncNocturno()
    expect(mockPrisma.syncDeuda.update).toHaveBeenCalled()
  })

  it('invalidarCacheClientes con cliente afectado', async () => {
    await runSyncNocturno()
    expect(mockInvalidarCacheClientes).toHaveBeenCalledWith('emp-1', ['cli-1'])
  })
})

// ── Deuda nueva en fetchDeudasDesde ──────────────────────────────────────────
describe('runSyncNocturno slim — deuda nueva (no existe en BD)', () => {
  it('deuda sin registro local → no llama syncDeuda.update (skip)', async () => {
    mockFetchDeudasDesde.mockResolvedValue([{
      uid: 'ext-nueva', _id: 'ext-nueva', vSaldo: '200000', vTotal: '200000',
      condicionUpTres: true, fModificado: null, receivableAt: null,
      cliente: { uid: 'cli-nueva' },
    }])
    mockPrisma.syncDeuda.findMany.mockResolvedValue([]) // no existe en BD
    await runSyncNocturno()
    expect(mockPrisma.syncDeuda.update).not.toHaveBeenCalled()
    // invalidar con array vacío — deuda nueva no genera afectados
    expect(mockInvalidarCacheClientes).toHaveBeenCalledWith('emp-1', [])
  })
})

// ── Resiliencia ───────────────────────────────────────────────────────────────
describe('runSyncNocturno slim — resiliencia', () => {
  it('actualizarDeudasInactivas falla → resultado sin error', async () => {
    mockActualizarDeudasInactivas.mockRejectedValue(new Error('timeout'))
    const result = await runSyncNocturno()
    expect(result[0].error).toBeUndefined()
  })

  it('login falla → resultado con error', async () => {
    mockLogin.mockRejectedValue(new Error('login fallo'))
    const result = await runSyncNocturno()
    expect(result[0].error).toBe('login fallo')
  })

  it('error empresa 1 → empresa 2 sigue', async () => {
    mockPrisma.integracion.findMany.mockResolvedValue([
      INTG,
      { id: 'intg-2', empresaId: 'emp-2', config: { apiKey: 'pk_2', apiSecret: 'enc' } },
    ])
    mockLogin
      .mockRejectedValueOnce(new Error('fallo'))
      .mockResolvedValueOnce(undefined)
    const result = await runSyncNocturno()
    expect(result).toHaveLength(2)
    expect(result.filter(r => r.error)).toHaveLength(1)
    expect(result.filter(r => !r.error)).toHaveLength(1)
  })

  it('múltiples empresas → login por cada una', async () => {
    mockPrisma.integracion.findMany.mockResolvedValue([
      INTG,
      { id: 'intg-2', empresaId: 'emp-2', config: { apiKey: 'pk_2', apiSecret: 'enc' } },
    ])
    await runSyncNocturno()
    expect(mockLogin).toHaveBeenCalledTimes(2)
  })
})

// ── SyncLog ───────────────────────────────────────────────────────────────────
describe('runSyncNocturno slim — SyncLog', () => {
  it('crea SyncLog tipo nocturno estado ok', async () => {
    await runSyncNocturno()
    expect(mockPrisma.syncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'nocturno', estado: 'ok' }),
      })
    )
  })

  it('error → SyncLog estado error', async () => {
    mockLogin.mockRejectedValue(new Error('fallo'))
    await runSyncNocturno()
    expect(mockPrisma.syncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'nocturno', estado: 'error' }),
      })
    )
  })
})
