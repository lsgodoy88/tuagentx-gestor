import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    rutaCliente: { findUnique: vi.fn() },
    $transaction: vi.fn(),
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

function mockTx(overrides: { ordenUpdateMany?: any; rcDelete?: any } = {}) {
  const mockOrdenUpdateMany = overrides.ordenUpdateMany ?? vi.fn().mockResolvedValue({ count: 0 })
  const mockRcDelete = overrides.rcDelete ?? vi.fn().mockResolvedValue({})
  p.$transaction.mockImplementation(async (fn: any) => fn({
    ordenDespacho: { updateMany: mockOrdenUpdateMany },
    rutaCliente: { delete: mockRcDelete },
  }))
  return { mockOrdenUpdateMany, mockRcDelete }
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

  it('empresa diferente → 404', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue({ notas: null, ruta: { cerrada: false, empresaId: 'emp-otro' } })
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(404)
  })

  it('ruta cerrada → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue({ notas: null, ruta: { cerrada: true, empresaId: 'emp-01' } })
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(400)
  })

  it('sin nota Bodega → elimina sin tocar OrdenDespacho', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue({ notas: null, ruta: { cerrada: false, empresaId: 'emp-01' } })
    const { mockOrdenUpdateMany, mockRcDelete } = mockTx()
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(mockOrdenUpdateMany).not.toHaveBeenCalled()
    expect(mockRcDelete).toHaveBeenCalledWith({ where: { id: 'rc-1' } })
  })

  it('con nota Bodega/#N → revierte OrdenDespacho a alistado y elimina rc', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue({
      notas: 'Bodega/Lumeli #4340',
      ruta: { cerrada: false, empresaId: 'emp-01' },
    })
    const { mockOrdenUpdateMany, mockRcDelete } = mockTx()
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-2' }))
    expect(res.status).toBe(200)
    expect(mockOrdenUpdateMany).toHaveBeenCalledWith({
      where: { numeroFactura: '4340', estado: 'en_entrega' },
      data: { estado: 'alistado', repartidorId: null },
    })
    expect(mockRcDelete).toHaveBeenCalledWith({ where: { id: 'rc-2' } })
  })

  it('supervisor puede devolver a bodega', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'supervisor' } })
    p.rutaCliente.findUnique.mockResolvedValue({
      notas: 'Bodega/Lumeli #4341',
      ruta: { cerrada: false, empresaId: 'emp-01' },
    })
    const { mockOrdenUpdateMany } = mockTx()
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-3' }))
    expect(res.status).toBe(200)
    expect(mockOrdenUpdateMany).toHaveBeenCalledWith({
      where: { numeroFactura: '4341', estado: 'en_entrega' },
      data: { estado: 'alistado', repartidorId: null },
    })
  })

  it('todo corre dentro de una transacción', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue({
      notas: 'Bodega/Lumeli #4342',
      ruta: { cerrada: false, empresaId: 'emp-01' },
    })
    mockTx()
    await DELETE(makeReq({ rutaClienteId: 'rc-4' }))
    expect(p.$transaction).toHaveBeenCalledTimes(1)
  })
})
