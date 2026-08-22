import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/prisma', () => ({ prisma: {}, DB_SCHEMA: 'gestor_staging' }))
vi.mock('@/lib/cartera/index', () => ({ calcularEstado: vi.fn().mockReturnValue('pendiente') }))
vi.mock('@/lib/integracion/sync', () => ({
  calcularNSaldoPorDeuda: vi.fn().mockResolvedValue({}),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { calcularNSaldoPorDeuda } from '@/lib/integracion/sync'
import { GET } from '@/app/api/cartera/[clienteId]/route'

const p = prisma as any
const SESSION = { user: { id: 'usr-01', role: 'vendedor', empresaId: 'emp-01' } }

const INTEGRACION = { id: 'integ-01', nombre: 'UpTres', tipo: 'uptres', activa: true }
const CLIENTE = { id: 'cli-01', nombre: 'Cliente Test', nit: '123', telefono: null, ciudad: null, apiId: 'api-cli-01', ubicacionReal: true, lat: null, lng: null }
const DEUDA = { id: 'sd-01', integracionId: 'integ-01', clienteApiId: 'api-cli-01', condition: true, valor: 100000, nSaldo: 100000, saldo: 100000, nSaldoBase: null, nSaldoBaseAt: null, numeroFactura: 1001, fechaVencimiento: null, data: null }

function makeReq(clienteId = 'cli-01') {
  return new NextRequest(`http://localhost/api/cartera/${clienteId}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue(SESSION as any)
  p.integracion  = { findFirst: vi.fn().mockResolvedValue(INTEGRACION) }
  p.cliente      = { findFirst: vi.fn().mockResolvedValue(CLIENTE) }
  p.syncDeuda    = { findMany: vi.fn().mockResolvedValue([DEUDA]) }
  p.pagoCartera  = { findMany: vi.fn().mockResolvedValue([]) }
  vi.mocked(calcularNSaldoPorDeuda).mockResolvedValue({ 'sd-01': 100000 })
})

describe('GET /api/cartera/[clienteId] — auth', () => {
  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/cartera/[clienteId] — sin integración', () => {
  it('sin integración activa → cartera null, motivo sin integracion activa', async () => {
    p.integracion.findFirst.mockResolvedValue(null)
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    expect(json.cartera).toBeNull()
    expect(json._motivo).toBe('sin integracion activa')
  })
})

describe('GET /api/cartera/[clienteId] — con integración', () => {
  it('cliente sin apiId → cartera null, motivo cliente sin apiId', async () => {
    p.cliente.findFirst.mockResolvedValue({ ...CLIENTE, apiId: null })
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    expect(json.cartera).toBeNull()
    expect(json._motivo).toBe('cliente sin apiId')
  })

  it('cliente no encontrado → cartera null', async () => {
    p.cliente.findFirst.mockResolvedValue(null)
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    expect(json.cartera).toBeNull()
  })

  it('retorna deudas con saldoReal calculado', async () => {
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    expect(json._modo).toBe('sync')
    expect(json.cartera.deudas).toHaveLength(1)
    expect(json.cartera.deudas[0].saldoReal).toBe(100000)
    expect(json.cartera.saldoTotal).toBe(100000)
  })

  it('nSaldo no en map → fallback a nSaldo de BD', async () => {
    vi.mocked(calcularNSaldoPorDeuda).mockResolvedValue({}) // sd-01 no en map
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    expect(json.cartera.deudas[0].saldoReal).toBe(100000) // fallback nSaldo
  })

  it('retorna electronicInvoiceNumber de data', async () => {
    p.syncDeuda.findMany.mockResolvedValue([{ ...DEUDA, data: { electronicInvoiceNumber: 68899 } }])
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    expect(json.cartera.deudas[0].electronicInvoiceNumber).toBe(68899)
  })

  it('data null → electronicInvoiceNumber null', async () => {
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    expect(json.cartera.deudas[0].electronicInvoiceNumber).toBeNull()
  })

  it('pagos locales se agrupan por deuda correctamente', async () => {
    p.pagoCartera.findMany.mockResolvedValue([{
      id: 'pago-01', syncDeudaId: 'sd-01', monto: 30000, createdAt: new Date(),
      Empleado: { id: 'emp-01', nombre: 'Carlos' },
    }])
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    const deuda = json.cartera.deudas[0]
    expect(deuda.pagosLocales).toHaveLength(1)
    expect(deuda.totalPagosLocales).toBe(30000)
  })

  it('sin deudas → saldoTotal 0, totalDeudas 0', async () => {
    p.syncDeuda.findMany.mockResolvedValue([])
    vi.mocked(calcularNSaldoPorDeuda).mockResolvedValue({})
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    expect(json.cartera.saldoTotal).toBe(0)
    expect(json.cartera.totalDeudas).toBe(0)
  })

  it('retorna datos de integración en _integracion', async () => {
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    const json = await res.json()
    expect(json.cartera._integracion.id).toBe('integ-01')
  })

  it('error interno → 500 con error en json', async () => {
    p.integracion.findFirst.mockRejectedValue(new Error('DB timeout'))
    const res = await GET(makeReq(), { params: Promise.resolve({ clienteId: 'cli-01' }) })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBeDefined()
  })
})
