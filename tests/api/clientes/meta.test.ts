import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { PATCH } from '@/app/api/clientes/[id]/meta/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const makeReq = (body: any) => new NextRequest(
  'http://localhost/api/clientes/c1/meta',
  { method: 'PATCH', body: JSON.stringify(body) }
)
const params = (id = 'c1') => ({ params: Promise.resolve({ id }) })
const VENDEDOR = { user: { id: 'u1', role: 'vendedor', empresaId: 'emp-1' } } as any

describe('PATCH /api/clientes/[id]/meta', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await PATCH(makeReq({ metaVenta: 100_000 }), params())
    expect(res.status).toBe(401)
  })

  it('cliente fuera de empresa → 404', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.cliente.findFirst).mockResolvedValue(null)
    const res = await PATCH(makeReq({ metaVenta: 100_000 }), params('c-otra'))
    expect(res.status).toBe(404)
    expect(prisma.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-otra', empresaId: 'emp-1' } })
    )
  })

  it('metaVenta numérico → guarda como Number', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: 'c1' } as any)
    await PATCH(makeReq({ metaVenta: 250_000 }), params())
    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { metaVenta: 250_000 },
    })
  })

  it('metaVenta string numérico → convierte a Number', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: 'c1' } as any)
    await PATCH(makeReq({ metaVenta: '500000' }), params())
    expect(prisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metaVenta: 500000 } })
    )
  })

  it('metaVenta=0 → guarda null (es falsy)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: 'c1' } as any)
    await PATCH(makeReq({ metaVenta: 0 }), params())
    expect(prisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metaVenta: null } })
    )
  })

  it('metaVenta null → guarda null (limpia meta)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: 'c1' } as any)
    await PATCH(makeReq({ metaVenta: null }), params())
    expect(prisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metaVenta: null } })
    )
  })

  it('payload sin metaVenta → guarda null', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: 'c1' } as any)
    await PATCH(makeReq({}), params())
    expect(prisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metaVenta: null } })
    )
  })
})
