import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { PATCH } from '@/app/api/clientes/[id]/gps/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

function makeReq(body: any): NextRequest {
  return new NextRequest('http://localhost/api/clientes/c1/gps', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
const params = (id = 'c1') => ({ params: Promise.resolve({ id }) })

const VENDEDOR = { user: { id: 'usr-1', role: 'vendedor', empresaId: 'emp-1' } } as any
const EMPRESA = { user: { id: 'emp-1', role: 'empresa' } } as any
const SUPERVISOR = { user: { id: 'usr-2', role: 'supervisor', empresaId: 'emp-1' } } as any

describe('PATCH /api/clientes/[id]/gps', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('autenticación', () => {
    it('sin sesión → 401', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await PATCH(makeReq({ lat: 4.4, lng: -75.2 }), params())
      expect(res.status).toBe(401)
    })
  })

  describe('validación de input', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    })

    it('sin lat → 400', async () => {
      const res = await PATCH(makeReq({ lng: -75.2 }), params())
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/lat y lng/i)
    })

    it('sin lng → 400', async () => {
      const res = await PATCH(makeReq({ lat: 4.4 }), params())
      expect(res.status).toBe(400)
    })

    it('lat=0 (caso edge: ecuador) actualmente RECHAZA por falsy', async () => {
      // OJO: el código usa `!lat || !lng` que considera 0 como false.
      // Esto es un bug latente — el ecuador (lat=0) o el meridiano (lng=0) fallarían.
      // Pero NO afecta Colombia (lat 4-12, lng -67 a -77). Documentado aquí.
      const res = await PATCH(makeReq({ lat: 0, lng: -75 }), params())
      expect(res.status).toBe(400)
    })
  })

  describe('cliente no pertenece a la empresa', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue(null)
    })

    it('cliente fuera de empresa → 404', async () => {
      const res = await PATCH(makeReq({ lat: 4.4, lng: -75.2 }), params('c-otra'))
      expect(res.status).toBe(404)
      // El filtro debe incluir empresaId
      expect(prisma.cliente.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c-otra', empresaId: 'emp-1' } })
      )
    })

    it('rol empresa: empresaId = user.id (no user.empresaId)', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      await PATCH(makeReq({ lat: 4.4, lng: -75.2 }), params())
      expect(prisma.cliente.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1', empresaId: 'emp-1' } })
      )
    })
  })

  describe('protección de GPS ya confirmado', () => {
    it('vendedor + cliente con ubicacionReal=true → skip sin actualizar', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        id: 'c1', empresaId: 'emp-1', ubicacionReal: true, lat: 4.4, lng: -75.2,
      } as any)
      const res = await PATCH(makeReq({ lat: 4.5, lng: -75.3 }), params())
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.skipped).toBe(true)
      expect(prisma.cliente.update).not.toHaveBeenCalled()
    })

    it('supervisor PUEDE sobrescribir ubicacionReal existente', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SUPERVISOR)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        id: 'c1', empresaId: 'emp-1', ubicacionReal: true,
      } as any)
      const res = await PATCH(makeReq({ lat: 4.5, lng: -75.3, ubicacionReal: true }), params())
      expect(res.status).toBe(200)
      expect(prisma.cliente.update).toHaveBeenCalled()
    })

    it('empresa PUEDE sobrescribir', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        id: 'c1', empresaId: 'emp-1', ubicacionReal: true,
      } as any)
      const res = await PATCH(makeReq({ lat: 4.5, lng: -75.3 }), params())
      expect(res.status).toBe(200)
      expect(prisma.cliente.update).toHaveBeenCalled()
    })

    it('vendedor con cliente ubicacionReal=false (optimista) → SÍ actualiza', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        id: 'c1', empresaId: 'emp-1', ubicacionReal: false,
      } as any)
      const res = await PATCH(makeReq({ lat: 4.4, lng: -75.2 }), params())
      expect(res.status).toBe(200)
      expect(prisma.cliente.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { lat: 4.4, lng: -75.2, ubicacionReal: false },
      })
    })
  })

  describe('marcado de ubicacionReal', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        id: 'c1', empresaId: 'emp-1', ubicacionReal: false,
      } as any)
    })

    it('ubicacionReal=true en payload → guarda true', async () => {
      await PATCH(makeReq({ lat: 4.4, lng: -75.2, ubicacionReal: true }), params())
      expect(prisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ubicacionReal: true }) })
      )
    })

    it('ubicacionReal omitido → guarda false (no es exactamente true)', async () => {
      await PATCH(makeReq({ lat: 4.4, lng: -75.2 }), params())
      expect(prisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ubicacionReal: false }) })
      )
    })

    it('ubicacionReal="true" string → guarda false (estricto === true)', async () => {
      await PATCH(makeReq({ lat: 4.4, lng: -75.2, ubicacionReal: 'true' }), params())
      expect(prisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ubicacionReal: false }) })
      )
    })
  })
})
