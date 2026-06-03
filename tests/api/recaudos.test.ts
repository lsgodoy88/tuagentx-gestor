import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pagoCartera: { findMany: vi.fn(), count: vi.fn() },
    pagoCarteraDeuda: { findMany: vi.fn() },
    syncDeuda: { findMany: vi.fn() },
    cliente: { findMany: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET } from '@/app/api/recaudos/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const EMPRESA = { user: { id: 'emp-1', role: 'empresa', empresaId: 'emp-1' } } as any
const SUPERVISOR = { user: { id: 'sup-1', role: 'supervisor', empresaId: 'emp-1' } } as any
const VENDEDOR = { user: { id: 'v-1', role: 'vendedor', empresaId: 'emp-1' } } as any

const makeReq = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/recaudos')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

function setupHappyPath() {
  vi.mocked(prisma.pagoCartera.findMany).mockResolvedValue([])
  vi.mocked(prisma.pagoCartera.count).mockResolvedValue(0)
  vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValue([])
  vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
  vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([])
}

describe('GET /api/recaudos — lista de pagos (admin only)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('auth + autorización', () => {
    it('sin sesión → 401', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await GET(makeReq())
      expect(res.status).toBe(401)
    })

    it('rol vendedor → 200 (ve solo sus propios pagos)', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      setupHappyPath()
      const res = await GET(makeReq())
      expect(res.status).toBe(200)
    })

    it('rol empresa → pasa el guard', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      setupHappyPath()
      const res = await GET(makeReq())
      expect(res.status).toBe(200)
    })

    it('rol supervisor → pasa el guard', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SUPERVISOR)
      setupHappyPath()
      const res = await GET(makeReq())
      expect(res.status).toBe(200)
    })
  })

  describe('filtro multitenant', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      setupHappyPath()
    })

    it('WHERE filtra Cartera.empresaId OR (Carrera=null AND Empleado.empresaId)', async () => {
      await GET(makeReq())
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any
      expect(args.where.OR).toEqual([
        { Cartera: { empresaId: 'emp-1' } },
        { AND: [{ carteraId: null }, { Empleado: { empresaId: 'emp-1' } }] },
      ])
    })

    it('vendedorId opcional → agrega empleadoId al WHERE', async () => {
      await GET(makeReq({ vendedorId: 'v-99' }))
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any
      expect(args.where.empleadoId).toBe('v-99')
    })

    it('estado != "todos" → agrega envioEstado al WHERE', async () => {
      await GET(makeReq({ estado: 'enviado' }))
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any
      expect(args.where.envioEstado).toBe('enviado')
    })

    it('estado="todos" → no filtra por envioEstado', async () => {
      await GET(makeReq({ estado: 'todos' }))
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any
      expect(args.where.envioEstado).toBeUndefined()
    })

    it('fecha → rango UTC midnight Colombia (UTC-5)', async () => {
      await GET(makeReq({ fecha: '2026-05-12' }))
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any
      // 00:00 Colombia = 05:00 UTC
      expect(args.where.createdAt.gte.toISOString()).toBe('2026-05-12T05:00:00.000Z')
      // +24h = next day 05:00 UTC
      expect(args.where.createdAt.lt.toISOString()).toBe('2026-05-13T05:00:00.000Z')
    })
  })

  describe('paginación', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      setupHappyPath()
    })

    it('default: page 1, limit 500 (sin paginación), sin cursor → response con {pagos, total, page, pages}', async () => {
      vi.mocked(prisma.pagoCartera.count).mockResolvedValue(50)
      const res = await GET(makeReq())
      const body = await res.json()
      expect(body.page).toBe(1)
      expect(body.pages).toBe(1) // ceil(50/500) = 1
      expect(body.total).toBe(50)
      expect(body.nextCursor).toBeUndefined() // modo offset
    })

    it('page=3 → skip = (3-1)*500 = 1000', async () => {
      await GET(makeReq({ page: '3' }))
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any
      expect(args.skip).toBe(1000)
      expect(args.take).toBe(500)
    })

    it('page inválido (string no numérico o 0) → page=1', async () => {
      await GET(makeReq({ page: '0' }))
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any
      expect(args.skip).toBe(0) // (1-1)*15
    })

    it('cursor presente → modo cursor (take=limit+1, no skip offset)', async () => {
      // Mock con 501 items para simular hasMore (limit=500, take=501)
      vi.mocked(prisma.pagoCartera.findMany).mockResolvedValue([
        ...Array(501).fill(0).map((_, i) => ({ id: `p${i}` })),
      ] as any)

      const res = await GET(makeReq({ cursor: 'p-cursor' }))
      const body = await res.json()
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any

      expect(args.take).toBe(501) // limit + 1 para detectar hasMore
      expect(args.cursor).toEqual({ id: 'p-cursor' })
      expect(args.skip).toBe(1) // skip el cursor mismo
      expect(body.hasMore).toBe(true)
      expect(body.nextCursor).toBe('p499') // último de los primeros 500
      expect(body.pagos).toHaveLength(500) // se descartó el extra
    })

    it('cursor presente + menos resultados que limit → hasMore=false, nextCursor=null', async () => {
      vi.mocked(prisma.pagoCartera.findMany).mockResolvedValue([
        { id: 'p1' }, { id: 'p2' },
      ] as any)
      const res = await GET(makeReq({ cursor: 'p-c' }))
      const body = await res.json()
      expect(body.hasMore).toBe(false)
      expect(body.nextCursor).toBeNull()
      expect(body.pagos).toHaveLength(2)
    })

    it('cursor empty string ("") → modo cursor desde el principio (sin skip cursor)', async () => {
      vi.mocked(prisma.pagoCartera.findMany).mockResolvedValue([])
      await GET(makeReq({ cursor: '' }))
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any
      expect(args.cursor).toBeUndefined()
      expect(args.skip).toBeUndefined()
      expect(args.take).toBe(501)
    })
  })

  describe('hidratación de cliente en pagos sync', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    })

    it('pago con Cartera (no-sync) → no toca queries de hidratación', async () => {
      vi.mocked(prisma.pagoCartera.findMany).mockResolvedValue([
        { id: 'p1', carteraId: 'c1', Cartera: { Cliente: { nombre: 'X' } }, Empleado: {} },
      ] as any)
      vi.mocked(prisma.pagoCartera.count).mockResolvedValue(1)

      await GET(makeReq())

      // No se llamó porque syncPagos.length === 0
      expect((prisma as any).pagoCarteraDeuda.findMany).not.toHaveBeenCalled()
    })

    it('pago sync con clienteApiId congelado → lookup cliente por apiId', async () => {
      vi.mocked(prisma.pagoCartera.findMany).mockResolvedValue([
        { id: 'p1', carteraId: null, clienteApiId: 'api-c1', clienteNombre: 'Congelado' },
      ] as any)
      vi.mocked(prisma.pagoCartera.count).mockResolvedValue(1)
      vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValue([])
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
      vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
        { id: 'c-lookup', apiId: 'api-c1', nombre: 'Cliente Real', nit: '900', telefono: '+57' },
      ])

      const res = await GET(makeReq())
      const body = await res.json()
      expect(body.pagos[0].cliente).toEqual({
        id: 'c-lookup', nombre: 'Cliente Real', nit: '900', telefono: '+57',
      })
    })

    it('pago sync con clienteApiId pero cliente NO en BD → usa clienteNombre congelado', async () => {
      vi.mocked(prisma.pagoCartera.findMany).mockResolvedValue([
        { id: 'p1', carteraId: null, clienteApiId: 'api-borrado', clienteNombre: 'Cliente Histórico' },
      ] as any)
      vi.mocked(prisma.pagoCartera.count).mockResolvedValue(1)
      vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValue([])
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
      vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([]) // cliente borrado

      const res = await GET(makeReq())
      const body = await res.json()
      expect(body.pagos[0].cliente).toEqual({ nombre: 'Cliente Histórico' })
    })

    it('pago sync viejo (sin congelar) → fallback via Aplicaciones → SyncDeuda → Cliente', async () => {
      vi.mocked(prisma.pagoCartera.findMany).mockResolvedValue([
        { id: 'p1', carteraId: null, clienteApiId: null, clienteNombre: null },
      ] as any)
      vi.mocked(prisma.pagoCartera.count).mockResolvedValue(1)
      vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValue([
        { pagoId: 'p1', syncDeudaId: 'sd-1', createdAt: new Date('2026-05-01') },
      ])
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', clienteApiId: 'api-via-sd' },
      ])
      vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([
        { id: 'c-via-sd', apiId: 'api-via-sd', nombre: 'Recuperado', nit: '800', telefono: '+58' },
      ])

      const res = await GET(makeReq())
      const body = await res.json()
      expect(body.pagos[0].cliente.nombre).toBe('Recuperado')
    })

    it('lookup de cliente filtra por empresaId (multitenant en hidratación)', async () => {
      vi.mocked(prisma.pagoCartera.findMany).mockResolvedValue([
        { id: 'p1', carteraId: null, clienteApiId: 'api-c1' },
      ] as any)
      vi.mocked(prisma.pagoCartera.count).mockResolvedValue(1)
      vi.mocked((prisma as any).pagoCarteraDeuda.findMany).mockResolvedValue([])
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])

      await GET(makeReq())

      expect((prisma as any).cliente.findMany).toHaveBeenCalledWith({
        where: { apiId: { in: expect.arrayContaining(['api-c1']) }, empresaId: 'emp-1' },
      })
    })
  })

  describe('orderBy', () => {
    it('ordena por createdAt desc (más recientes primero)', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      setupHappyPath()
      await GET(makeReq())
      const args = vi.mocked(prisma.pagoCartera.findMany).mock.calls[0][0] as any
      expect(args.orderBy).toEqual({ createdAt: 'desc' })
    })
  })
})
