import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSyncDeudaFindMany    = vi.hoisted(() => vi.fn())
const mockPagoCDFindMany       = vi.hoisted(() => vi.fn())
const mockPagoCFindMany        = vi.hoisted(() => vi.fn())
const mockPagoCFindFirst       = vi.hoisted(() => vi.fn())
const mockIntegracionFindFirst = vi.hoisted(() => vi.fn())
const mockClienteFindFirst     = vi.hoisted(() => vi.fn())
const mockQueryRaw             = vi.hoisted(() => vi.fn())

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: (u: any) => u.empresaId }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    integracion:       { findFirst: mockIntegracionFindFirst },
    cliente:           { findFirst: mockClienteFindFirst },
    syncDeuda:         { findMany: mockSyncDeudaFindMany },
    pagoCarteraDeuda:  { findMany: mockPagoCDFindMany },
    pagoCartera:       { findMany: mockPagoCFindMany, findFirst: mockPagoCFindFirst },
    $queryRaw:         mockQueryRaw,
  },
  DB_SCHEMA: 'gestor',
  Prisma: { raw: (s: string) => s }
}))

import { GET } from '@/app/api/cartera/[clienteId]/route'
import { getServerSession } from 'next-auth'

const SESSION_LECHE = { user: { id: 'emp-1', role: 'vendedor', empresaId: 'cmojhfct40000znvfaos1jy1m' } }

function makeReq(clienteId: string) {
  return new NextRequest(`http://localhost/api/cartera/${clienteId}`, { method: 'GET' })
}

function mockDeuda(override: object = {}) {
  return {
    id: 'deuda-1', numeroFactura: '8948', valor: 362654, nSaldo: 82654,
    saldo: 82654, condition: true, empleadoExternalId: 'emp-ext-1',
    fechaVencimiento: '2026-02-03', clienteApiId: 'cli-1', ...override
  }
}

describe('GET /api/cartera/[clienteId]', () => {
  beforeEach(() => {
    mockSyncDeudaFindMany.mockReset()
    mockPagoCDFindMany.mockReset()
    mockPagoCFindMany.mockReset()
    mockPagoCFindFirst.mockReset()
    mockQueryRaw.mockReset()
    // Defaults
    mockIntegracionFindFirst.mockResolvedValue({ id: 'integ-1', empresaId: 'cmojhfct40000znvfaos1jy1m', tipo: 'uptres', activa: true })
    mockClienteFindFirst.mockResolvedValue({ id: 'cli-1', nombre: 'Test', apiId: 'cli-api-1', nit: null, telefono: null, ciudad: null, ubicacionReal: false, lat: null, lng: null })
    mockQueryRaw.mockResolvedValue([]) // sin saldos Lumeli
  })

  it('retorna 401 sin sesion', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await GET(makeReq('cli-1'), { params: Promise.resolve({ clienteId: 'cli-1' }) })
    expect(res.status).toBe(401)
  })

  it('empresa no-Lumeli sin pagos locales — usa nSaldo no valor bruto', async () => {
    vi.mocked(getServerSession).mockResolvedValue(SESSION_LECHE as any)
    mockSyncDeudaFindMany.mockResolvedValueOnce([mockDeuda()])
    mockPagoCDFindMany.mockResolvedValueOnce([])  // sin pagos
    mockPagoCFindMany.mockResolvedValueOnce([])

    const res = await GET(makeReq('cli-1'), { params: Promise.resolve({ clienteId: 'cli-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    const deuda = data.cartera.deudas[0]
    expect(deuda.saldoReal).toBe(82654)      // nSaldo — correcto
    expect(deuda.saldoReal).not.toBe(362654) // NO valor bruto
  })

  it('sin nSaldo ni saldo — fallback a valor', async () => {
    vi.mocked(getServerSession).mockResolvedValue(SESSION_LECHE as any)
    mockSyncDeudaFindMany.mockResolvedValueOnce([mockDeuda({ nSaldo: null, saldo: null })])
    mockPagoCDFindMany.mockResolvedValueOnce([])
    mockPagoCFindMany.mockResolvedValueOnce([])

    const res = await GET(makeReq('cli-1'), { params: Promise.resolve({ clienteId: 'cli-1' }) })
    const data = await res.json()

    expect(data.cartera.deudas[0].saldoReal).toBe(362654) // fallback valor
  })

  it('con pagos locales — usa ancla - pagos', async () => {
    vi.mocked(getServerSession).mockResolvedValue(SESSION_LECHE as any)
    mockSyncDeudaFindMany.mockResolvedValueOnce([mockDeuda({ valor: 500000, nSaldo: 400000 })])
    mockPagoCDFindMany.mockResolvedValueOnce([{
      montoAplicado: 100000, descuento: 0, createdAt: new Date('2026-07-01'), pagoId: 'p1'
    }])
    mockPagoCFindMany.mockResolvedValueOnce([])
    mockPagoCFindFirst.mockResolvedValueOnce({ saldoAnterior: 500000 })

    const res = await GET(makeReq('cli-1'), { params: Promise.resolve({ clienteId: 'cli-1' }) })
    const data = await res.json()

    expect(data.cartera.deudas[0].saldoReal).toBe(400000) // 500000 - 100000
  })
})
