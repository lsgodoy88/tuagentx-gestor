import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pagoCartera: { findUnique: vi.fn() },
    empleado: { findUnique: vi.fn() },
    cliente: { findFirst: vi.fn() },
    empresa: { findUnique: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET } from '@/app/api/cartera/recibo/[pagoId]/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const VENDEDOR = { user: { id: 'usr-1', role: 'vendedor', empresaId: 'emp-1' } } as any

const makeReq = () => new NextRequest('http://localhost/api/cartera/recibo/p1')
const params = (id = 'p1') => ({ params: Promise.resolve({ pagoId: id }) })

describe('GET /api/cartera/recibo/[pagoId] — recibo autenticado', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await GET(makeReq(), params())
    expect(res.status).toBe(401)
  })

  it('pago no existe → 404', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.pagoCartera.findUnique).mockResolvedValue(null)
    const res = await GET(makeReq(), params())
    expect(res.status).toBe(404)
  })

  describe('modo Cartera: validación de empresa', () => {
    it('Cartera.empresaId distinto del usuario → 403', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.pagoCartera.findUnique).mockResolvedValue({
        id: 'p1',
        Cartera: { empresaId: 'OTRA-emp', Cliente: {}, Empresa: {}, DetalleCartera: [] },
        Empleado: {},
      } as any)
      const res = await GET(makeReq(), params())
      expect(res.status).toBe(403)
    })

    it('Cartera.empresaId match → 200 con datos de Cartera', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.pagoCartera.findUnique).mockResolvedValue({
        id: 'p1',
        metodopago: 'efectivo',
        Cartera: {
          empresaId: 'emp-1',
          Cliente: { id: 'c1', nombre: 'X' },
          Empresa: { id: 'emp-1' },
          DetalleCartera: [{ id: 'd1' }],
        },
        Empleado: { nombre: 'V' },
        Aplicaciones: [],
      } as any)
      const res = await GET(makeReq(), params())
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.pago.cartera.cliente.nombre).toBe('X')
      expect(body.pago.cartera.detalles).toEqual([{ id: 'd1' }])
      expect(body.pago.metodoPago).toBe('efectivo')
    })
  })

  describe('modo sync (Cartera=null): validación via empleado', () => {
    it('empleado de OTRA empresa → 403', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.pagoCartera.findUnique).mockResolvedValue({
        id: 'p1', Cartera: null,
        empleadoId: 'e-otra', Aplicaciones: [],
      } as any)
      vi.mocked(prisma.empleado.findUnique).mockResolvedValue({ empresaId: 'OTRA' } as any)
      const res = await GET(makeReq(), params())
      expect(res.status).toBe(403)
    })

    it('empleado no encontrado → 403', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.pagoCartera.findUnique).mockResolvedValue({
        id: 'p1', Cartera: null, empleadoId: 'e-x', Aplicaciones: [],
      } as any)
      vi.mocked(prisma.empleado.findUnique).mockResolvedValue(null)
      const res = await GET(makeReq(), params())
      expect(res.status).toBe(403)
    })

    it('empleado de la misma empresa → 200', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.pagoCartera.findUnique).mockResolvedValue({
        id: 'p1', metodopago: 'nequi',
        Cartera: null,
        empleadoId: 'e1',
        clienteApiId: 'api-c1',
        clienteNombre: 'Cliente Frío',
        Aplicaciones: [],
        Empleado: { nombre: 'V' },
      } as any)
      vi.mocked(prisma.empleado.findUnique).mockResolvedValue({ empresaId: 'emp-1' } as any)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: 'c1', nombre: 'Cliente Real' } as any)
      vi.mocked(prisma.empresa.findUnique).mockResolvedValue({ id: 'emp-1', nombre: 'Lumeli' } as any)

      const res = await GET(makeReq(), params())
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.pago.cartera.cliente.nombre).toBe('Cliente Real') // del lookup
      expect(body.pago.cartera.empresa.nombre).toBe('Lumeli')
    })
  })

  describe('hidratación de cliente (cascada)', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.empleado.findUnique).mockResolvedValue({ empresaId: 'emp-1' } as any)
      vi.mocked(prisma.empresa.findUnique).mockResolvedValue({} as any)
    })

    it('prioridad 1: Cartera.Cliente directo', async () => {
      vi.mocked(prisma.pagoCartera.findUnique).mockResolvedValue({
        id: 'p1',
        Cartera: { empresaId: 'emp-1', Cliente: { nombre: 'Desde Cartera' }, Empresa: {}, DetalleCartera: [] },
        empleadoId: 'e1', clienteApiId: 'api-c1', clienteNombre: 'Congelado',
        Aplicaciones: [],
      } as any)
      const res = await GET(makeReq(), params())
      const body = await res.json()
      expect(body.pago.cartera.cliente.nombre).toBe('Desde Cartera')
    })

    it('prioridad 2: lookup por clienteApiId (sin Cartera)', async () => {
      vi.mocked(prisma.pagoCartera.findUnique).mockResolvedValue({
        id: 'p1', Cartera: null, empleadoId: 'e1',
        clienteApiId: 'api-c1', clienteNombre: 'Congelado',
        Aplicaciones: [],
      } as any)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ nombre: 'Lookup BD' } as any)

      const res = await GET(makeReq(), params())
      const body = await res.json()
      expect(body.pago.cartera.cliente.nombre).toBe('Lookup BD')
    })

    it('prioridad 3 (fallback final): clienteNombre congelado del pago', async () => {
      vi.mocked(prisma.pagoCartera.findUnique).mockResolvedValue({
        id: 'p1', Cartera: null, empleadoId: 'e1',
        clienteApiId: 'api-c1', clienteNombre: 'Congelado',
        Aplicaciones: [],
      } as any)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue(null) // cliente borrado de BD

      const res = await GET(makeReq(), params())
      const body = await res.json()
      expect(body.pago.cartera.cliente).toEqual({ nombre: 'Congelado' })
    })
  })
})
