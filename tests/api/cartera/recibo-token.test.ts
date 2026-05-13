import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pagoCartera: { findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/recibos', async () => {
  const real = await vi.importActual<typeof import('@/lib/recibos')>('@/lib/recibos')
  return {
    ...real,
    generarReciboToken: vi.fn(() => ({
      reciboToken: 'tok_new',
      tokenExpira: new Date('2026-05-12T16:00:00Z'),
    })),
  }
})

import { POST } from '@/app/api/cartera/recibo-token/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const VENDEDOR = { user: { id: 'usr-1', role: 'vendedor', empresaId: 'emp-1' } } as any

const makeReq = (body: any) => new NextRequest('http://localhost/api/cartera/recibo-token', {
  method: 'POST', body: JSON.stringify(body),
})

describe('POST /api/cartera/recibo-token — renovar token de recibo (15min)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await POST(makeReq({ pagoId: 'p1' }))
    expect(res.status).toBe(401)
  })

  it('sin pagoId → 400', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('pago no encontrado → 404', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue(null)
    const res = await POST(makeReq({ pagoId: 'p-inexistente' }))
    expect(res.status).toBe(404)
  })

  it('filtra por empresaId via Cartera O Empleado (multitenant)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue(null)
    await POST(makeReq({ pagoId: 'p1' }))

    const where = vi.mocked((prisma as any).pagoCartera.findFirst).mock.calls[0][0].where
    expect(where.id).toBe('p1')
    expect(where.OR).toEqual([
      { Cartera: { empresaId: 'emp-1' } },
      { AND: [{ carteraId: null }, { Empleado: { empresaId: 'emp-1' } }] },
    ])
  })

  it('renueva token + escribe en BD + devuelve anchoPapel desde Cartera.Empresa', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
      id: 'p1',
      Cartera: { Empresa: { configRecibos: { anchoPapel: '58mm' } } },
      Empleado: null,
    })

    const res = await POST(makeReq({ pagoId: 'p1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reciboToken).toBe('tok_new')
    expect(body.tokenExpira).toBe('2026-05-12T16:00:00.000Z')
    expect(body.anchoPapel).toBe('58mm')

    // Verificar que escribió el nuevo token
    expect(prisma.pagoCartera.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { reciboToken: 'tok_new', tokenExpira: expect.any(Date) },
    })
  })

  it('pago sync (sin Cartera): anchoPapel desde Empleado.empresa.configRecibos', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
      id: 'p1',
      Cartera: null,
      Empleado: { empresa: { configRecibos: { anchoPapel: '80mm' } } },
    })

    const res = await POST(makeReq({ pagoId: 'p1' }))
    const body = await res.json()
    expect(body.anchoPapel).toBe('80mm')
  })

  it('sin configRecibos → default "80mm"', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
      id: 'p1',
      Cartera: null,
      Empleado: { empresa: { configRecibos: null } },
    })
    const res = await POST(makeReq({ pagoId: 'p1' }))
    const body = await res.json()
    expect(body.anchoPapel).toBe('80mm')
  })
})
