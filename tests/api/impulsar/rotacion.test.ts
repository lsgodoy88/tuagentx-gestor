import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    empleado: { findUnique: vi.fn() },
    impulsoRotacion: { createMany: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
  DB_SCHEMA: 'gestor_staging',
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/impulsar/rotacion/route'
import { NextRequest } from 'next/server'

const p = prisma as any

function makeGet(params = '') {
  return new NextRequest('http://localhost/api/impulsar/rotacion' + (params ? '?' + params : ''))
}
function makePost(body: object) {
  return new NextRequest('http://localhost/api/impulsar/rotacion', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/impulsar/rotacion', () => {
  it('sin sesión → 401', async () => {
    ;(getServerSession as any).mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('rol no permitido → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'bodega' } })
    const res = await GET(makeGet())
    expect(res.status).toBe(403)
  })

  it('impulsadora → 200 con productos', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    p.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'p1', nombre: 'Prod A', linea: 'L1', marca: 'M1', precio: 5000 }])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ linea: 'L1' }])
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.productos).toHaveLength(1)
    expect(data.total).toBe(1)
  })
})

describe('POST /api/impulsar/rotacion', () => {
  it('sin sesión → 401', async () => {
    ;(getServerSession as any).mockResolvedValue(null)
    const res = await POST(makePost({}))
    expect(res.status).toBe(401)
  })

  it('rol vendedor → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor', id: 'v1' } })
    const res = await POST(makePost({ clienteId: 'c1', filas: [] }))
    expect(res.status).toBe(403)
  })

  it('sin clienteId → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    const res = await POST(makePost({ filas: [{ productoId: 'p1', cantidad: 2, precioVenta: 5000 }] }))
    expect(res.status).toBe(400)
  })

  it('filas vacías → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    const res = await POST(makePost({ clienteId: 'c1', filas: [] }))
    expect(res.status).toBe(400)
  })

  it('impulsadora sin vendedor asignado → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    p.empleado.findUnique.mockResolvedValue({ vendedorId: null })
    const res = await POST(makePost({ clienteId: 'c1', filas: [{ productoId: 'p1', cantidad: 2, precioVenta: 5000 }] }))
    expect(res.status).toBe(400)
  })

  it('filas sin cantidad ni precioVenta → 400 (sin filas válidas)', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    p.empleado.findUnique.mockResolvedValue({ vendedorId: 'v1' })
    const res = await POST(makePost({ clienteId: 'c1', filas: [{ productoId: 'p1' }] }))
    expect(res.status).toBe(400)
  })

  it('ok → guarda y retorna { ok: true }', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    p.empleado.findUnique.mockResolvedValue({ vendedorId: 'v1' })
    p.impulsoRotacion.createMany.mockResolvedValue({ count: 1 })
    const res = await POST(makePost({
      clienteId: 'c1',
      filas: [{ productoId: 'p1', cantidad: 3, precioVenta: 10000 }],
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.guardados).toBe(1)
  })
})
