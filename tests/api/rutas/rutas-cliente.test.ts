import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    rutaCliente: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { DELETE } from '@/app/api/rutas/cliente/route'
import { NextRequest } from 'next/server'

const p = prisma as any

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/rutas/cliente', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('DELETE /api/rutas/cliente', () => {
  it('sin sesión → 401', async () => {
    ;(getServerSession as any).mockResolvedValue(null)
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(401)
  })

  it('rol vendedor → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor' } })
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(403)
  })

  it('sin rutaClienteId → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    const res = await DELETE(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('rc no encontrado → 404', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue(null)
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-999' }))
    expect(res.status).toBe(404)
  })

  it('ruta cerrada → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue({ ruta: { cerrada: true, empresaId: 'emp-01' } })
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(400)
  })

  it('empresa diferente → 404', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue({ ruta: { cerrada: false, empresaId: 'emp-otro' } })
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(404)
  })

  it('ok → elimina y retorna { ok: true }', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue({ ruta: { cerrada: false, empresaId: 'emp-01' } })
    p.rutaCliente.delete.mockResolvedValue({})
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(p.rutaCliente.delete).toHaveBeenCalledWith({ where: { id: 'rc-1' } })
  })
})
