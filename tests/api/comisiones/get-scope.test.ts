import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    empleado: { findMany: vi.fn() },
    pagoCartera: { groupBy: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

vi.mock('@prisma/client', () => ({}))

// comisionConfig / comisionCalculo se acceden vía (prisma as any), no están
// en el mock tipado — se agregan dinámicamente abajo.

import { GET } from '@/app/api/comisiones/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const EMPRESA_ID = 'empresa-1'

const makeReq = (qs = '') => new NextRequest(`http://localhost/api/comisiones${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma as any).comisionConfig = { findMany: vi.fn().mockResolvedValue([]) }
  ;(prisma as any).comisionCalculo = { findFirst: vi.fn().mockResolvedValue(null) }
  ;(prisma as any).pagoCartera.groupBy.mockResolvedValue([])
})

describe('GET /api/comisiones — scope por rol', () => {
  it('vendedor: solo recibe su propia fila, nunca la de otros vendedores', async () => {
    ;(getServerSession as any).mockResolvedValue({
      user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID },
    })
    ;(prisma as any).empleado.findMany.mockImplementation(({ where }: any) => {
      // Verifica que el filtro de scope llegó hasta la query real
      expect(where.id).toBe('vend-1')
      return Promise.resolve([{ id: 'vend-1', nombre: 'Vendedor Uno' }])
    })

    const res = await GET(makeReq())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.vendedores).toHaveLength(1)
    expect(json.vendedores[0].id).toBe('vend-1')
  })

  it('admin (empresa): ve todos los vendedores, sin filtro de id', async () => {
    ;(getServerSession as any).mockResolvedValue({
      user: { id: EMPRESA_ID, role: 'empresa' },
    })
    ;(prisma as any).empleado.findMany.mockImplementation(({ where }: any) => {
      expect(where.id).toBeUndefined()
      return Promise.resolve([
        { id: 'vend-1', nombre: 'A' },
        { id: 'vend-2', nombre: 'B' },
      ])
    })

    const res = await GET(makeReq())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.vendedores).toHaveLength(2)
  })

  it('supervisor: ve todos los vendedores, sin filtro de id', async () => {
    ;(getServerSession as any).mockResolvedValue({
      user: { id: 'sup-1', role: 'supervisor', empresaId: EMPRESA_ID },
    })
    ;(prisma as any).empleado.findMany.mockImplementation(({ where }: any) => {
      expect(where.id).toBeUndefined()
      return Promise.resolve([{ id: 'vend-1', nombre: 'A' }])
    })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
  })

  it('rol sin permiso (ej. bodega) → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({
      user: { id: 'bod-1', role: 'bodega', empresaId: EMPRESA_ID },
    })

    const res = await GET(makeReq())
    expect(res.status).toBe(403)
    expect((prisma as any).empleado.findMany).not.toHaveBeenCalled()
  })

  it('sin sesión → 401', async () => {
    ;(getServerSession as any).mockResolvedValue(null)

    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('vendedor sin config guardada: default porcentaje=3 (no 0)', async () => {
    ;(getServerSession as any).mockResolvedValue({
      user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID },
    })
    ;(prisma as any).empleado.findMany.mockResolvedValue([{ id: 'vend-1', nombre: 'Vendedor Uno' }])

    const res = await GET(makeReq())
    const json = await res.json()

    expect(json.vendedores[0].porcentaje).toBe(3)
  })
})
