import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    empleado: { findUnique: vi.fn() },
    impulsoEvento: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
  DB_SCHEMA: 'gestor_staging',
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET, POST, DELETE } from '@/app/api/impulsar/evento/route'
import { NextRequest } from 'next/server'

const p = prisma as any

function makeGet(params = '') {
  return new NextRequest('http://localhost/api/impulsar/evento' + (params ? '?' + params : ''))
}
function makePost(body: object) {
  return new NextRequest('http://localhost/api/impulsar/evento', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}
function makeDel(id: string) {
  return new NextRequest('http://localhost/api/impulsar/evento?id=' + id, { method: 'DELETE' })
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/impulsar/evento', () => {
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

  it('vendedor → filtra por vendedorId', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor', id: 'v1' } })
    p.$queryRawUnsafe.mockResolvedValue([])
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.eventos).toEqual([])
  })

  it('impulsadora → filtra por empleadoId', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    p.$queryRawUnsafe.mockResolvedValue([{ id: 'ev1', clienteNombre: 'CLI', fotos: ['k1'] }])
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.eventos).toHaveLength(1)
  })
})

describe('POST /api/impulsar/evento', () => {
  it('sin sesión → 401', async () => {
    ;(getServerSession as any).mockResolvedValue(null)
    const res = await POST(makePost({}))
    expect(res.status).toBe(401)
  })

  it('rol vendedor → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor', id: 'v1' } })
    const res = await POST(makePost({ clienteId: 'c1', tipoEvento: 'Degustación', fecha: '2026-08-24', fotos: ['k1'] }))
    expect(res.status).toBe(403)
  })

  it('sin fotos → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    const res = await POST(makePost({ clienteId: 'c1', tipoEvento: 'Degustación', fecha: '2026-08-24', fotos: [] }))
    expect(res.status).toBe(400)
  })

  it('más de 4 fotos → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    const res = await POST(makePost({ clienteId: 'c1', tipoEvento: 'T', fecha: '2026-08-24', fotos: ['k1','k2','k3','k4','k5'] }))
    expect(res.status).toBe(400)
  })

  it('sin clienteId → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    const res = await POST(makePost({ tipoEvento: 'T', fecha: '2026-08-24', fotos: ['k1'] }))
    expect(res.status).toBe(400)
  })

  it('impulsadora sin vendedor → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    p.empleado.findUnique.mockResolvedValue({ vendedorId: null })
    const res = await POST(makePost({ clienteId: 'c1', tipoEvento: 'T', fecha: '2026-08-24', fotos: ['k1'] }))
    expect(res.status).toBe(400)
  })

  it('ok → crea evento y retorna { ok: true }', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'impulsadora', id: 'imp-1' } })
    p.empleado.findUnique.mockResolvedValue({ vendedorId: 'v1' })
    p.impulsoEvento.create.mockResolvedValue({ id: 'ev-1' })
    const res = await POST(makePost({ clienteId: 'c1', tipoEvento: 'Degustación', fecha: '2026-08-24', fotos: ['k1', 'k2'] }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(p.impulsoEvento.create).toHaveBeenCalledOnce()
  })
})

describe('DELETE /api/impulsar/evento', () => {
  it('sin sesión → 401', async () => {
    ;(getServerSession as any).mockResolvedValue(null)
    const res = await DELETE(makeDel('ev-1'))
    expect(res.status).toBe(401)
  })

  it('rol vendedor → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor', id: 'v1' } })
    const res = await DELETE(makeDel('ev-1'))
    expect(res.status).toBe(403)
  })

  it('sin id → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa', id: 'adm-1' } })
    const res = await DELETE(new NextRequest('http://localhost/api/impulsar/evento', { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })

  it('evento no encontrado → 404', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa', id: 'adm-1' } })
    p.impulsoEvento.findFirst.mockResolvedValue(null)
    const res = await DELETE(makeDel('ev-999'))
    expect(res.status).toBe(404)
  })

  it('ok → elimina y retorna { ok: true }', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa', id: 'adm-1' } })
    p.impulsoEvento.findFirst.mockResolvedValue({ id: 'ev-1', empresaId: 'emp-01' })
    p.impulsoEvento.delete.mockResolvedValue({})
    const res = await DELETE(makeDel('ev-1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(p.impulsoEvento.delete).toHaveBeenCalledWith({ where: { id: 'ev-1' } })
  })
})
