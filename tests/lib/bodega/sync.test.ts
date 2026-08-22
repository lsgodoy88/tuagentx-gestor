import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/fechas', () => ({ haceNDiasBogota: vi.fn(() => new Date('2026-08-16T05:00:00Z')) }))
vi.mock('@/lib/crypto-uptres', () => ({ decrypt: vi.fn().mockReturnValue('secret-decrypted') }))
vi.mock('@/lib/integracion/adapters/uptres', () => ({
  UpTresAdapter: vi.fn().mockImplementation(function() {
    return {
      login: vi.fn().mockResolvedValue(undefined),
      fetchVentas: vi.fn().mockResolvedValue([]),
    }
  }),
  parseFechaUptresBogota: vi.fn((s: string) => new Date(s)),
}))
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { syncBodega } from '@/lib/bodega/sync'

const p = prisma as any

const INTEGRACION = {
  id: 'integ-01', tipo: 'uptres', activa: true,
  config: { apiKey: 'key-123', apiSecret: 'enc-secret' },
}

const ORDEN_UPTRES = {
  uid: 'order-001', numeroOrden: '5001', numeroFacturado: '1001',
  clienteNombreApi: 'Cliente Test', clienteNit: '900123456', fCreado: '2026-09-01T10:00:00Z',
  cityId: '123', direccion: 'Cra 1 #2-3', telefono: '3001234567',
  cliente: { uid: 'cli-api-01' }, empleado: { uid: 'vend-api-01' }, vTotal: '500000',
}

let adapterInstance: any

beforeEach(() => {
  vi.clearAllMocks()
  p.integracion      = { findFirst: vi.fn().mockResolvedValue(INTEGRACION) }
  p.empresa          = { findUnique: vi.fn().mockResolvedValue({ diasHistorialBodega: 30 }), update: vi.fn() }
  p.ordenDespacho    = { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({ count: 0 }) }
  p.cliente          = { findMany: vi.fn().mockResolvedValue([]) }
  p.empresaVinculada = { findFirst: vi.fn() }
  p.$transaction = vi.fn((fn: any) => fn(p))

  adapterInstance = { login: vi.fn(), fetchVentas: vi.fn().mockResolvedValue([]) }
  vi.mocked(UpTresAdapter).mockImplementation(function() { return adapterInstance } as any)
})

describe('syncBodega — validaciones iniciales', () => {
  it('sin integración activa → lanza error', async () => {
    p.integracion.findFirst.mockResolvedValue(null)
    await expect(syncBodega({ empresaId: 'emp-01' })).rejects.toThrow('Sin integración activa')
  })

  it('vinculadaId inválido → lanza error', async () => {
    p.empresaVinculada.findFirst.mockResolvedValue(null)
    await expect(syncBodega({ empresaId: 'emp-01', vinculadaId: 'bad-id' })).rejects.toThrow('Empresa vinculada no encontrada')
  })

  it('sin órdenes → retorna 0 sincronizados, actualiza ultimaSyncBodega', async () => {
    adapterInstance.fetchVentas.mockResolvedValue([])
    const r = await syncBodega({ empresaId: 'emp-01' })
    expect(r.sincronizados).toBe(0)
    expect(r.nuevas).toBe(0)
    expect(p.empresa.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'emp-01' },
      data: expect.objectContaining({ ultimaSyncBodega: expect.any(Date) }),
    }))
  })
})

describe('syncBodega — filtros de órdenes', () => {
  it('orden sin numeroFacturado → descartada', async () => {
    adapterInstance.fetchVentas.mockResolvedValue([{ ...ORDEN_UPTRES, numeroFacturado: null }])
    const r = await syncBodega({ empresaId: 'emp-01' })
    expect(r.nuevas).toBe(0)
  })

  it('orden sin clienteNombre → descartada', async () => {
    adapterInstance.fetchVentas.mockResolvedValue([{ ...ORDEN_UPTRES, clienteNombreApi: null }])
    const r = await syncBodega({ empresaId: 'emp-01' })
    expect(r.nuevas).toBe(0)
  })

  it('orden con fCreado antes de desde → filtrada', async () => {
    adapterInstance.fetchVentas.mockResolvedValue([{
      ...ORDEN_UPTRES,
      fCreado: '2026-08-01T00:00:00Z', // anterior a desde (2026-08-16)
    }])
    const r = await syncBodega({ empresaId: 'emp-01' })
    expect(r.nuevas).toBe(0)
  })

  it('orden ya existente en BD → no se crea', async () => {
    adapterInstance.fetchVentas.mockResolvedValue([ORDEN_UPTRES])
    p.ordenDespacho.findMany.mockResolvedValue([{ origenId: 'order-001' }]) // ya existe
    const r = await syncBodega({ empresaId: 'emp-01' })
    expect(r.nuevas).toBe(0)
    expect(p.ordenDespacho.createMany).not.toHaveBeenCalled()
  })
})

describe('syncBodega — creación de órdenes', () => {
  beforeEach(() => {
    adapterInstance.fetchVentas.mockResolvedValue([ORDEN_UPTRES])
    p.ordenDespacho.createMany.mockResolvedValue({ count: 1 })
  })

  it('orden válida nueva → createMany llamado', async () => {
    const r = await syncBodega({ empresaId: 'emp-01' })
    expect(r.nuevas).toBe(1)
    expect(p.ordenDespacho.createMany).toHaveBeenCalledTimes(1)
  })

  it('mapea cityId a nombre municipio via municipiosDANE', async () => {
    // cityId=5282 existe en el archivo real → FREDONIA
    adapterInstance.fetchVentas.mockResolvedValue([{ ...ORDEN_UPTRES, cityId: '5282' }])
    await syncBodega({ empresaId: 'emp-01' })
    const data = p.ordenDespacho.createMany.mock.calls[0][0].data[0]
    expect(data.ciudad).toBe('FREDONIA')
  })

  it('cityId sin match → usa ciudad cruda del API', async () => {
    adapterInstance.fetchVentas.mockResolvedValue([{ ...ORDEN_UPTRES, cityId: '999', ciudad: 'Medellín' }])
    await syncBodega({ empresaId: 'emp-01' })
    const data = p.ordenDespacho.createMany.mock.calls[0][0].data[0]
    expect(data.ciudad).toBe('Medellín')
  })

  it('ciudad con / → usa la última parte', async () => {
    adapterInstance.fetchVentas.mockResolvedValue([{ ...ORDEN_UPTRES, cityId: null, ciudad: 'Colombia/Antioquia/Medellín' }])
    await syncBodega({ empresaId: 'emp-01' })
    const data = p.ordenDespacho.createMany.mock.calls[0][0].data[0]
    expect(data.ciudad).toBe('Medellín')
  })

  it('cliente local encontrado por apiId → completa dirección vacía', async () => {
    adapterInstance.fetchVentas.mockResolvedValue([{ ...ORDEN_UPTRES, direccion: '', telefono: '' }])
    p.cliente.findMany.mockResolvedValue([{
      apiId: 'cli-api-01', nit: '900123456',
      ciudad: 'Ibagué', direccion: 'Cra 5 #1-2', telefono: '3009999999',
    }])
    await syncBodega({ empresaId: 'emp-01' })
    const data = p.ordenDespacho.createMany.mock.calls[0][0].data[0]
    expect(data.direccion).toBe('Cra 5 #1-2')
    expect(data.telefono).toBe('3009999999')
  })

  it('múltiples órdenes en un batch → createMany con todas', async () => {
    const orden2 = { ...ORDEN_UPTRES, uid: 'order-002', numeroFacturado: '1002' }
    adapterInstance.fetchVentas.mockResolvedValue([ORDEN_UPTRES, orden2])
    p.ordenDespacho.createMany.mockResolvedValue({ count: 2 })
    const r = await syncBodega({ empresaId: 'emp-01' })
    expect(r.nuevas).toBe(2)
    expect(p.ordenDespacho.createMany.mock.calls[0][0].data).toHaveLength(2)
  })

  it('mapea vendedorApiId y clienteApiId correctamente', async () => {
    await syncBodega({ empresaId: 'emp-01' })
    const data = p.ordenDespacho.createMany.mock.calls[0][0].data[0]
    expect(data.vendedorApiId).toBe('vend-api-01')
    expect(data.clienteApiId).toBe('cli-api-01')
  })

  it('totalOrden parseado como float', async () => {
    await syncBodega({ empresaId: 'emp-01' })
    const data = p.ordenDespacho.createMany.mock.calls[0][0].data[0]
    expect(data.totalOrden).toBe(500000)
  })
})

describe('syncBodega — vinculadaId (Lumeli → Leche)', () => {
  it('vinculadaId válido → usa empresaClienteId para buscar integración', async () => {
    p.empresaVinculada.findFirst.mockResolvedValue({ id: 'vinc-01', empresaClienteId: 'leche-id' })
    p.integracion.findFirst.mockResolvedValue(INTEGRACION)
    adapterInstance.fetchVentas.mockResolvedValue([])
    await syncBodega({ empresaId: 'lumeli-id', vinculadaId: 'vinc-01' })
    expect(p.integracion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ empresaId: 'leche-id' }),
    }))
  })
})
