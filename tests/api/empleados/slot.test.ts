import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    empresa: { findUnique: vi.fn(), update: vi.fn() },
    empleado: { count: vi.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { DELETE } from '@/app/api/empleados/slot/route'

const sessionMock = getServerSession as any
const p = prisma as any

function makeReq(body: any) {
  return new NextRequest('http://localhost/api/empleados/slot', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.mockResolvedValue({ user: { role: 'empresa', id: 'usr-01' } })
  p.empresa.update.mockResolvedValue({})
})

describe('DELETE /api/empleados/slot — auth', () => {
  it('sin sesión → 401', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await DELETE(makeReq({ rol: 'vendedor' }))
    expect(res.status).toBe(401)
  })

  it('rol supervisor → 403', async () => {
    sessionMock.mockResolvedValue({ user: { role: 'supervisor', id: 'usr-01' } })
    const res = await DELETE(makeReq({ rol: 'vendedor' }))
    expect(res.status).toBe(403)
  })

  it('rol inválido → 400', async () => {
    p.empresa.findUnique.mockResolvedValue({ maxVendedores: 2 })
    p.empleado.count.mockResolvedValue(0)
    const res = await DELETE(makeReq({ rol: 'superheroe' }))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/empleados/slot — lógica slots', () => {
  it('slot vacío disponible → elimina y retorna maxVendedores decrementado', async () => {
    p.empresa.findUnique.mockResolvedValue({ maxVendedores: 3 })
    p.empleado.count.mockResolvedValue(2) // 2 empleados < 3 slots → hay vacante
    const res = await DELETE(makeReq({ rol: 'vendedor' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.maxVendedores).toBe(2)
    expect(p.empresa.update.mock.calls[0][0].data.maxVendedores).toBe(2)
  })

  it('todos los slots ocupados → 400 no puede eliminar', async () => {
    p.empresa.findUnique.mockResolvedValue({ maxVendedores: 2 })
    p.empleado.count.mockResolvedValue(2) // empleados == slots → lleno
    const res = await DELETE(makeReq({ rol: 'vendedor' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/asignados/i)
  })

  it('maxVendedores = 0 → 400 sin slots para eliminar', async () => {
    p.empresa.findUnique.mockResolvedValue({ maxVendedores: 0 })
    p.empleado.count.mockResolvedValue(0)
    const res = await DELETE(makeReq({ rol: 'vendedor' }))
    expect(res.status).toBe(400)
    expect(p.empresa.update).not.toHaveBeenCalled()
  })

  it('slot bodega → usa maxBodega', async () => {
    p.empresa.findUnique.mockResolvedValue({ maxBodega: 2 })
    p.empleado.count.mockResolvedValue(1)
    const res = await DELETE(makeReq({ rol: 'bodega' }))
    expect(res.status).toBe(200)
    expect(p.empresa.update.mock.calls[0][0].data.maxBodega).toBe(1)
  })
})
