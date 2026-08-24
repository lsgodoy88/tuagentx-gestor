import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    empleado: { findFirst: vi.fn() },
    visita: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/visitas/todas/route'
import { NextRequest } from 'next/server'

const p = prisma as any

function makeGet(params = '') {
  return new NextRequest('http://localhost/api/visitas/todas' + (params ? '?' + params : ''))
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/visitas/todas — scope vendedor con impulsadoras', () => {
  it('sin sesión → array vacío', async () => {
    ;(getServerSession as any).mockResolvedValue(null)
    p.visita.findMany.mockResolvedValue([])
    p.visita.count.mockResolvedValue(0)
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
  })

  it('vendedor sin empleadoId → filtra por su propio id', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor', id: 'v1' } })
    p.visita.findMany.mockResolvedValue([])
    p.visita.count.mockResolvedValue(0)
    await GET(makeGet('page=1&limit=15'))
    expect(p.visita.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empleadoId: 'v1' }) })
    )
  })

  it('vendedor con empleadoId de su impulsadora → usa ese id', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor', id: 'v1' } })
    p.empleado.findFirst.mockResolvedValue({ id: 'imp-1' })
    p.visita.findMany.mockResolvedValue([])
    p.visita.count.mockResolvedValue(0)
    await GET(makeGet('empleadoId=imp-1&page=1&limit=15'))
    expect(p.empleado.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'imp-1', vendedorId: 'v1', rol: 'impulsadora' }) })
    )
    expect(p.visita.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empleadoId: 'imp-1' }) })
    )
  })

  it('vendedor con empleadoId de impulsadora ajena → usa su propio id', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor', id: 'v1' } })
    p.empleado.findFirst.mockResolvedValue(null) // no es su impulsadora
    p.visita.findMany.mockResolvedValue([])
    p.visita.count.mockResolvedValue(0)
    await GET(makeGet('empleadoId=imp-ajena&page=1&limit=15'))
    expect(p.visita.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empleadoId: 'v1' }) })
    )
  })

  it('admin con empleadoId → filtra por ese empleadoId', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa', id: 'adm-1', empresaId: 'emp-01' } })
    p.visita.findMany.mockResolvedValue([])
    p.visita.count.mockResolvedValue(0)
    await GET(makeGet('empleadoId=v2&page=1&limit=15'))
    expect(p.visita.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empleadoId: 'v2' }) })
    )
  })

  it('retorna paginación correcta', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor', id: 'v1' } })
    p.visita.findMany.mockResolvedValue([{ id: 'vis-1' }])
    p.visita.count.mockResolvedValue(1)
    const res = await GET(makeGet('page=1&limit=15'))
    const data = await res.json()
    expect(data.visitas).toHaveLength(1)
    expect(data.total).toBe(1)
  })
})
