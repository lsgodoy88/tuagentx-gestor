import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    rutaCliente: { findUnique: vi.fn() },
    ordenDespacho: { findFirst: vi.fn() },
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

function setupTx() {
  const mockOrdenUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
  const mockRcDelete = vi.fn().mockResolvedValue({})
  p.$transaction.mockImplementation(async (fn: any) => fn({
    ordenDespacho: { updateMany: mockOrdenUpdateMany },
    rutaCliente: { delete: mockRcDelete },
  }))
  return { mockOrdenUpdateMany, mockRcDelete }
}

const RC_PROPIO = { notas: 'Bodega/Lumeli #4340', ruta: { cerrada: false, empresaId: 'emp-01' } }
const RC_VINCULADO = { notas: 'Bodega/Leche #10080', ruta: { cerrada: false, empresaId: 'emp-01' } }
const RC_MANUAL = { notas: null, ruta: { cerrada: false, empresaId: 'emp-01' } }

beforeEach(() => vi.clearAllMocks())

describe('autenticación y autorización', () => {
  it('sin sesión → 401', async () => {
    ;(getServerSession as any).mockResolvedValue(null)
    expect((await DELETE(makeReq({ rutaClienteId: 'rc-1' }))).status).toBe(401)
  })

  it('rol vendedor → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor' } })
    expect((await DELETE(makeReq({ rutaClienteId: 'rc-1' }))).status).toBe(403)
  })

  it('rol entregas → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'entregas' } })
    expect((await DELETE(makeReq({ rutaClienteId: 'rc-1' }))).status).toBe(403)
  })

  it('rol empresa → permitido', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue(RC_PROPIO)
    p.ordenDespacho.findFirst.mockResolvedValue({ empresaId: 'emp-01' })
    setupTx()
    expect((await DELETE(makeReq({ rutaClienteId: 'rc-1' }))).status).toBe(200)
  })

  it('rol supervisor → permitido', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'supervisor' } })
    p.rutaCliente.findUnique.mockResolvedValue(RC_PROPIO)
    p.ordenDespacho.findFirst.mockResolvedValue({ empresaId: 'emp-01' })
    setupTx()
    expect((await DELETE(makeReq({ rutaClienteId: 'rc-1' }))).status).toBe(200)
  })
})

describe('validaciones', () => {
  beforeEach(() => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
  })

  it('sin rutaClienteId → 400', async () => {
    expect((await DELETE(makeReq({}))).status).toBe(400)
  })

  it('rc no encontrado → 404', async () => {
    p.rutaCliente.findUnique.mockResolvedValue(null)
    expect((await DELETE(makeReq({ rutaClienteId: 'rc-999' }))).status).toBe(404)
  })

  it('rc de otra empresa → 404', async () => {
    p.rutaCliente.findUnique.mockResolvedValue({ notas: null, ruta: { cerrada: false, empresaId: 'emp-otro' } })
    expect((await DELETE(makeReq({ rutaClienteId: 'rc-1' }))).status).toBe(404)
  })

  it('ruta cerrada → 400', async () => {
    p.rutaCliente.findUnique.mockResolvedValue({ notas: null, ruta: { cerrada: true, empresaId: 'emp-01' } })
    expect((await DELETE(makeReq({ rutaClienteId: 'rc-1' }))).status).toBe(400)
  })
})

describe('empresa propia — Bodega/Lumeli #N', () => {
  beforeEach(() => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue(RC_PROPIO)
    p.ordenDespacho.findFirst.mockResolvedValue({ empresaId: 'emp-01' })
  })

  it('revierte OrdenDespacho a alistado con empresaId correcto', async () => {
    const { mockOrdenUpdateMany, mockRcDelete } = setupTx()
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(mockOrdenUpdateMany).toHaveBeenCalledWith({
      where: { numeroFactura: '4340', empresaId: 'emp-01', estado: 'en_entrega' },
      data: { estado: 'alistado', repartidorId: null, devuelta: true },
    })
    expect(mockRcDelete).toHaveBeenCalledWith({ where: { id: 'rc-1' } })
  })

  it('orden no en_entrega (findFirst retorna null) → no llama updateMany pero sí borra rc', async () => {
    p.ordenDespacho.findFirst.mockResolvedValue(null) // ya no está en_entrega
    const { mockOrdenUpdateMany, mockRcDelete } = setupTx()
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(res.status).toBe(200)
    expect(mockOrdenUpdateMany).not.toHaveBeenCalled()
    expect(mockRcDelete).toHaveBeenCalled()
  })

  it('todo ocurre en una sola transacción', async () => {
    setupTx()
    await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(p.$transaction).toHaveBeenCalledTimes(1)
  })

  it('extrae numeroFactura correctamente del patrón #N', async () => {
    p.rutaCliente.findUnique.mockResolvedValue({ ...RC_PROPIO, notas: 'Bodega/Lumeli #99999' })
    const { mockOrdenUpdateMany } = setupTx()
    await DELETE(makeReq({ rutaClienteId: 'rc-1' }))
    expect(p.ordenDespacho.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ numeroFactura: '99999' }) })
    )
    expect(mockOrdenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ numeroFactura: '99999' }) })
    )
  })
})

describe('empresa vinculada — Bodega/Leche #N', () => {
  beforeEach(() => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
    p.rutaCliente.findUnique.mockResolvedValue(RC_VINCULADO)
  })

  it('ruta de emp-01 con orden de emp-02 → autorizado, revierte con empresaId de la orden', async () => {
    p.ordenDespacho.findFirst.mockResolvedValue({ empresaId: 'emp-02' })
    const { mockOrdenUpdateMany, mockRcDelete } = setupTx()
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-2' }))
    expect(res.status).toBe(200)
    // Usa empresaId de la OrdenDespacho, no de la ruta — evita colisión entre empresas
    expect(mockOrdenUpdateMany).toHaveBeenCalledWith({
      where: { numeroFactura: '10080', empresaId: 'emp-02', estado: 'en_entrega' },
      data: { estado: 'alistado', repartidorId: null, devuelta: true },
    })
    expect(mockRcDelete).toHaveBeenCalledWith({ where: { id: 'rc-2' } })
  })

  it('dos empresas con mismo numeroFactura → solo revierte la de la empresa correcta', async () => {
    // emp-02 tiene factura #10080 en_entrega, emp-03 también tiene #10080 pero en otro estado
    p.ordenDespacho.findFirst.mockResolvedValue({ empresaId: 'emp-02' })
    const { mockOrdenUpdateMany } = setupTx()
    await DELETE(makeReq({ rutaClienteId: 'rc-2' }))
    // El where incluye empresaId → emp-03 no se toca
    expect(mockOrdenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: 'emp-02' }) })
    )
  })

  it('ruta de empresa vinculada diferente → 404', async () => {
    p.rutaCliente.findUnique.mockResolvedValue({
      notas: 'Bodega/Leche #10080',
      ruta: { cerrada: false, empresaId: 'emp-vinculada' },
    })
    expect((await DELETE(makeReq({ rutaClienteId: 'rc-2' }))).status).toBe(404)
  })
})

describe('cliente manual — sin nota Bodega', () => {
  beforeEach(() => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'empresa' } })
  })

  it('notas null → elimina rc sin consultar ni tocar OrdenDespacho', async () => {
    p.rutaCliente.findUnique.mockResolvedValue(RC_MANUAL)
    const { mockOrdenUpdateMany, mockRcDelete } = setupTx()
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-3' }))
    expect(res.status).toBe(200)
    expect(p.ordenDespacho.findFirst).not.toHaveBeenCalled()
    expect(mockOrdenUpdateMany).not.toHaveBeenCalled()
    expect(mockRcDelete).toHaveBeenCalledWith({ where: { id: 'rc-3' } })
  })

  it('nota sin patrón #N → elimina rc sin tocar OrdenDespacho', async () => {
    p.rutaCliente.findUnique.mockResolvedValue({ ...RC_MANUAL, notas: 'Visita especial' })
    const { mockOrdenUpdateMany, mockRcDelete } = setupTx()
    const res = await DELETE(makeReq({ rutaClienteId: 'rc-4' }))
    expect(res.status).toBe(200)
    expect(p.ordenDespacho.findFirst).not.toHaveBeenCalled()
    expect(mockOrdenUpdateMany).not.toHaveBeenCalled()
    expect(mockRcDelete).toHaveBeenCalled()
  })
})
