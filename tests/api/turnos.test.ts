import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    turno: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))

import { GET, POST } from '@/app/api/turnos/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const VENDEDOR = { user: { id: 'usr-1', role: 'vendedor', empresaId: 'emp-1', email: 'v@x.com' } } as any
const makeReq = (body: any) => new NextRequest('http://localhost/api/turnos', {
  method: 'POST', body: JSON.stringify(body),
})

describe('GET /api/turnos — devuelve turno activo del usuario', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('con sesión + turno activo → 200 con turno', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    const turno = { id: 't1', activo: true, visitas: [] }
    vi.mocked(prisma.turno.findFirst).mockResolvedValue(turno as any)
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.id).toBe('t1')
    expect(prisma.turno.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { empleadoId: 'usr-1', activo: true } })
    )
  })

  it('sin turno activo → null', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.turno.findFirst).mockResolvedValue(null)
    const res = await GET()
    const body = await res.json()
    expect(body).toBeNull()
  })
})

describe('POST /api/turnos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
  })

  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await POST(makeReq({ accion: 'iniciar' }))
    expect(res.status).toBe(401)
  })

  it('acción inválida → 400', async () => {
    const res = await POST(makeReq({ accion: 'pinchar' }))
    expect(res.status).toBe(400)
  })

  describe('iniciar', () => {
    it('cierra turno activo previo + crea uno nuevo', async () => {
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 1 } as any)
      vi.mocked(prisma.turno.create).mockResolvedValue({ id: 'new-t', activo: true } as any)

      const res = await POST(makeReq({ accion: 'iniciar', lat: 4.4, lng: -75.2 }))
      expect(res.status).toBe(200)
      // Primero cierra cualquier turno activo
      expect(prisma.turno.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empleadoId: 'usr-1', activo: true },
          data: expect.objectContaining({ activo: false }),
        })
      )
      // Luego crea con lat/lng inicio
      expect(prisma.turno.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            empleadoId: 'usr-1',
            latInicio: 4.4,
            lngInicio: -75.2,
            activo: true,
          })
        })
      )
    })

    it('sin lat/lng → guarda null', async () => {
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 0 } as any)
      vi.mocked(prisma.turno.create).mockResolvedValue({ id: 't1' } as any)
      await POST(makeReq({ accion: 'iniciar' }))
      expect(prisma.turno.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ latInicio: null, lngInicio: null })
        })
      )
    })
  })

  describe('cerrar', () => {
    it('marca activo=false con fin y lat/lng', async () => {
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 1 } as any)
      await POST(makeReq({ accion: 'cerrar', lat: 4.5, lng: -75.3 }))
      expect(prisma.turno.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empleadoId: 'usr-1', activo: true },
          data: expect.objectContaining({
            activo: false,
            latFin: 4.5,
            lngFin: -75.3,
          })
        })
      )
    })
  })

  describe('pausar', () => {
    it('guarda pausaInicio + motivo + duracionMin solicitado', async () => {
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 1 } as any)
      await POST(makeReq({ accion: 'pausar', motivo: 'Almuerzo', duracionMin: 60 }))
      const call = vi.mocked(prisma.turno.updateMany).mock.calls[0][0] as any
      expect(call.data.pausado).toBe(true)
      expect(call.data.pausaMotivo).toBe('Almuerzo')
      expect(call.data.pausaDuracionMin).toBe(60)
      expect(call.data.pausaInicio).toBeInstanceOf(Date)
    })

    it('sin motivo → null', async () => {
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 1 } as any)
      await POST(makeReq({ accion: 'pausar', duracionMin: 30 }))
      const call = vi.mocked(prisma.turno.updateMany).mock.calls[0][0] as any
      expect(call.data.pausaMotivo).toBeNull()
    })
  })

  describe('reanudar — calcula duración REAL (no la solicitada)', () => {
    it('si pausa real fue 45min pero se solicitó 60min → guarda 45 (verdad)', async () => {
      vi.useFakeTimers()
      const ahora = new Date('2026-05-12T15:00:00Z')
      vi.setSystemTime(ahora)

      const hace45min = new Date(ahora.getTime() - 45 * 60 * 1000)
      vi.mocked(prisma.turno.findFirst).mockResolvedValue({
        pausaInicio: hace45min,
        pausaDuracionMin: 60, // se solicitó 60
      } as any)
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 1 } as any)

      await POST(makeReq({ accion: 'reanudar' }))

      expect(prisma.turno.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pausado: false,
            pausaInicio: null,
            pausaDuracionMin: 45, // duración REAL, no la solicitada
          })
        })
      )
      vi.useRealTimers()
    })

    it('pausa real 90min cuando se solicitaron 30 → guarda 90 (el vendedor se demoró más)', async () => {
      vi.useFakeTimers()
      const ahora = new Date('2026-05-12T15:00:00Z')
      vi.setSystemTime(ahora)
      const hace90 = new Date(ahora.getTime() - 90 * 60 * 1000)
      vi.mocked(prisma.turno.findFirst).mockResolvedValue({
        pausaInicio: hace90,
        pausaDuracionMin: 30,
      } as any)
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 1 } as any)

      await POST(makeReq({ accion: 'reanudar' }))

      const call = vi.mocked(prisma.turno.updateMany).mock.calls[0][0] as any
      expect(call.data.pausaDuracionMin).toBe(90)
      vi.useRealTimers()
    })

    it('sin pausaInicio (estado raro) → conserva la duración solicitada', async () => {
      vi.mocked(prisma.turno.findFirst).mockResolvedValue({
        pausaInicio: null,
        pausaDuracionMin: 60,
      } as any)
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 1 } as any)
      await POST(makeReq({ accion: 'reanudar' }))
      const call = vi.mocked(prisma.turno.updateMany).mock.calls[0][0] as any
      expect(call.data.pausaDuracionMin).toBe(60)
    })

    it('pausa muy corta (30 segundos) → redondea a 1 min', async () => {
      vi.useFakeTimers()
      const ahora = new Date('2026-05-12T15:00:00Z')
      vi.setSystemTime(ahora)
      const hace30s = new Date(ahora.getTime() - 30 * 1000)
      vi.mocked(prisma.turno.findFirst).mockResolvedValue({
        pausaInicio: hace30s, pausaDuracionMin: 60,
      } as any)
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 1 } as any)
      await POST(makeReq({ accion: 'reanudar' }))
      const call = vi.mocked(prisma.turno.updateMany).mock.calls[0][0] as any
      // Math.round(30000 / 60000) = Math.round(0.5) = 1
      expect(call.data.pausaDuracionMin).toBe(1)
      vi.useRealTimers()
    })

    it('NO toca pausaMotivo (se conserva para historial)', async () => {
      vi.mocked(prisma.turno.findFirst).mockResolvedValue({
        pausaInicio: new Date(),
        pausaDuracionMin: 30,
      } as any)
      vi.mocked(prisma.turno.updateMany).mockResolvedValue({ count: 1 } as any)
      await POST(makeReq({ accion: 'reanudar' }))
      const call = vi.mocked(prisma.turno.updateMany).mock.calls[0][0] as any
      // pausaMotivo NO debe estar en el update data
      expect(Object.keys(call.data)).not.toContain('pausaMotivo')
    })
  })
})
