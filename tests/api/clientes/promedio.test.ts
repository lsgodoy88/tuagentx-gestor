import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mocks: el endpoint depende de prisma + next-auth. Los reemplazamos por mocks.
// vi.mock se "hoistea" arriba — antes de los imports reales.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findFirst: vi.fn() },
    visita: { findMany: vi.fn() },
    ventaMesCliente: { findMany: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET } from '@/app/api/clientes/[id]/promedio/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

// Helpers
function makeReq(url = 'http://localhost/api/clientes/c1/promedio'): NextRequest {
  return new NextRequest(url)
}
function makeParams(id = 'c1') {
  return { params: Promise.resolve({ id }) }
}
const SESSION_EMPRESA = { user: { id: 'emp-1', role: 'empresa' } } as any
const SESSION_VENDEDOR = { user: { id: 'usr-1', role: 'vendedor', empresaId: 'emp-1' } } as any

describe('/api/clientes/[id]/promedio — GET', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('autenticación', () => {
    it('sin sesión → 401', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await GET(makeReq(), makeParams())
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe('No autorizado')
    })
  })

  describe('cliente no encontrado', () => {
    it('cliente fuera de la empresa del usuario → 404', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SESSION_VENDEDOR)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue(null)
      const res = await GET(makeReq(), makeParams('c-otra-empresa'))
      expect(res.status).toBe(404)
      // Verificar que filtró por empresaId del usuario
      expect(prisma.cliente.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-otra-empresa', empresaId: 'emp-1' },
        })
      )
    })

    it('rol empresa: empresaId = user.id, no user.empresaId', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SESSION_EMPRESA)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue(null)
      await GET(makeReq(), makeParams('c1'))
      expect(prisma.cliente.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1', empresaId: 'emp-1' },
        })
      )
    })
  })

  describe('fuente=erp (cliente con apiId + VentaMesCliente data)', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(SESSION_EMPRESA)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        id: 'c1', nombre: 'Cliente 1', metaVenta: 100_000, apiId: 'erp-c1',
      } as any)
    })

    it('promedio = totalVentas / meses, redondeado', async () => {
      vi.mocked((prisma as any).ventaMesCliente.findMany).mockResolvedValue([
        { totalVenta: 100_000, cantidadVisitas: 4, mes: '2026-03' },
        { totalVenta: 80_000,  cantidadVisitas: 3, mes: '2026-04' },
        { totalVenta: 120_000, cantidadVisitas: 5, mes: '2026-05' },
      ])
      const res = await GET(makeReq(), makeParams('c1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.fuente).toBe('erp')
      expect(body.totalVentas).toBe(300_000)
      expect(body.meses).toBe(3)
      expect(body.promedio).toBe(100_000) // 300k/3
      expect(body.cantidadVisitas).toBe(12) // 4+3+5
      expect(body.metaActual).toBe(100_000)
    })

    it('sin filas en VentaMesCliente → cae al fallback de visitas', async () => {
      vi.mocked((prisma as any).ventaMesCliente.findMany).mockResolvedValue([])
      vi.mocked(prisma.visita.findMany).mockResolvedValue([
        { monto: 50_000, fechaBogota: new Date('2026-05-01') },
      ] as any)
      const res = await GET(makeReq(), makeParams('c1'))
      const body = await res.json()
      expect(body.fuente).toBe('app')
    })
  })

  describe('fuente=app (sin apiId)', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(SESSION_EMPRESA)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        id: 'c1', nombre: 'Cliente Manual', metaVenta: 80_000, apiId: null,
      } as any)
    })

    it('sin visitas → promedio=null, totalVentas=0, meses=0', async () => {
      vi.mocked(prisma.visita.findMany).mockResolvedValue([])
      const res = await GET(makeReq(), makeParams('c1'))
      const body = await res.json()
      expect(body.promedio).toBeNull()
      expect(body.totalVentas).toBe(0)
      expect(body.meses).toBe(0)
      expect(body.metaActual).toBe(80_000)
    })

    it('agrupa visitas por mes y promedia', async () => {
      vi.mocked(prisma.visita.findMany).mockResolvedValue([
        { monto: 30_000, fechaBogota: new Date('2026-03-15T05:00:00Z') },
        { monto: 20_000, fechaBogota: new Date('2026-03-28T05:00:00Z') },
        { monto: 50_000, fechaBogota: new Date('2026-04-10T05:00:00Z') },
        { monto: 100_000, fechaBogota: new Date('2026-05-05T05:00:00Z') },
      ] as any)
      const res = await GET(makeReq(), makeParams('c1'))
      const body = await res.json()
      expect(body.fuente).toBe('app')
      // marzo: 50k, abril: 50k, mayo: 100k → total 200k / 3 meses = 66.666 → 66667
      expect(body.totalVentas).toBe(200_000)
      expect(body.meses).toBe(3)
      expect(body.promedio).toBe(66_667)
      expect(body.cantidadVisitas).toBe(4)
    })

    it('visita sin fechaBogota → agrupa en "unknown"', async () => {
      vi.mocked(prisma.visita.findMany).mockResolvedValue([
        { monto: 10_000, fechaBogota: null },
        { monto: 20_000, fechaBogota: new Date('2026-05-05T05:00:00Z') },
      ] as any)
      const res = await GET(makeReq(), makeParams('c1'))
      const body = await res.json()
      // 2 "meses": 'unknown' + '2026-05' → total 30k / 2 = 15k
      expect(body.meses).toBe(2)
      expect(body.promedio).toBe(15_000)
    })
  })

  describe('filtro temporal', () => {
    it('busca solo desde hace 3 meses (no toda la historia)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T15:00:00Z'))
      vi.mocked(getServerSession).mockResolvedValue(SESSION_EMPRESA)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        id: 'c1', apiId: null, metaVenta: 0, nombre: 'X',
      } as any)
      vi.mocked(prisma.visita.findMany).mockResolvedValue([])

      await GET(makeReq(), makeParams('c1'))

      const call = vi.mocked(prisma.visita.findMany).mock.calls[0][0] as any
      const gteDate = call.where.fechaBogota.gte as Date
      // 12-may-2026 menos 3 meses = 12-feb-2026
      expect(gteDate.getUTCMonth()).toBe(1) // febrero (0-indexed)
      expect(gteDate.getUTCFullYear()).toBe(2026)
      vi.useRealTimers()
    })
  })
})
