import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({
  getEmpresaId: vi.fn().mockReturnValue('emp-01'),
  ROLES_ADMIN_BODEGA: ['empresa', 'supervisor', 'bodega'],
}))
vi.mock('@/lib/bodega/despachos', () => ({
  getDespachos: vi.fn().mockResolvedValue({ data: [], hayMas: false, nextCursor: null, controlFacturas: [] }),
}))
vi.mock('@/lib/bodega/despacho-patch', () => ({
  patchDespacho: vi.fn().mockResolvedValue({ ok: true }),
}))

import { getServerSession } from 'next-auth'
import { getDespachos } from '@/lib/bodega/despachos'
import { patchDespacho } from '@/lib/bodega/despacho-patch'
import { GET } from '@/app/api/bodega/despachos/route'
import { PATCH } from '@/app/api/bodega/despachos/[id]/route'

const sessionEmpresa = { user: { id: 'usr-01', role: 'empresa', empresaId: 'emp-01' } }
const sessionBodega  = { user: { id: 'usr-02', role: 'bodega',  empresaId: 'emp-01' } }
const sessionVendedor = { user: { id: 'usr-03', role: 'vendedor', empresaId: 'emp-01' } }

function makeGetReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/bodega/despachos')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

function makePatchReq(body: any) {
  return new NextRequest('http://localhost/api/bodega/despachos/orden-01', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/bodega/despachos — auth', () => {
  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  it('rol vendedor → 403', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionVendedor as any)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(403)
  })

  it('rol bodega → 200', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionBodega as any)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
  })

  it('rol empresa → 200', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionEmpresa as any)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
  })
})

describe('GET /api/bodega/despachos — parámetros', () => {
  it('pasa estado y cursor a getDespachos', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionEmpresa as any)
    await GET(makeGetReq({ estado: 'alistado', cursor: 'abc123' }))
    expect(getDespachos).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'alistado',
      cursor: 'abc123',
    }))
  })

  it('defaults: estado=pendiente, cursor=null', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionEmpresa as any)
    await GET(makeGetReq())
    expect(getDespachos).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'pendiente',
      cursor: null,
    }))
  })

  it('q trimmed → se pasa a getDespachos', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionEmpresa as any)
    await GET(makeGetReq({ q: '  factura  ' }))
    expect(getDespachos).toHaveBeenCalledWith(expect.objectContaining({ q: 'factura' }))
  })
})

describe('PATCH /api/bodega/despachos/[id]', () => {
  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await PATCH(makePatchReq({ estado: 'alistado' }), { params: Promise.resolve({ id: 'orden-01' }) })
    expect(res.status).toBe(401)
  })

  it('rol vendedor → 403', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionVendedor as any)
    const res = await PATCH(makePatchReq({}), { params: Promise.resolve({ id: 'orden-01' }) })
    expect(res.status).toBe(403)
  })

  it('rol bodega → llama patchDespacho con id y body', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionBodega as any)
    const res = await PATCH(makePatchReq({ estado: 'alistado' }), { params: Promise.resolve({ id: 'orden-01' }) })
    expect(res.status).toBe(200)
    expect(patchDespacho).toHaveBeenCalledWith(expect.objectContaining({
      id: 'orden-01',
      empresaId: 'emp-01',
      body: expect.objectContaining({ estado: 'alistado' }),
    }))
  })

  it('empleado rol bodega → empleadoId = user.id', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionBodega as any)
    await PATCH(makePatchReq({}), { params: Promise.resolve({ id: 'orden-01' }) })
    expect(patchDespacho).toHaveBeenCalledWith(expect.objectContaining({ empleadoId: 'usr-02' }))
  })

  it('rol empresa → empleadoId = null', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionEmpresa as any)
    await PATCH(makePatchReq({}), { params: Promise.resolve({ id: 'orden-01' }) })
    expect(patchDespacho).toHaveBeenCalledWith(expect.objectContaining({ empleadoId: null }))
  })

  it('patchDespacho lanza 422 → 422 con error', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionBodega as any)
    vi.mocked(patchDespacho).mockRejectedValue(Object.assign(new Error('Se requiere foto'), { status: 422 }))
    const res = await PATCH(makePatchReq({ estado: 'alistado' }), { params: Promise.resolve({ id: 'orden-01' }) })
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('Se requiere foto')
  })

  it('patchDespacho lanza 404 → 404', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sessionBodega as any)
    vi.mocked(patchDespacho).mockRejectedValue(Object.assign(new Error('No encontrada'), { status: 404 }))
    const res = await PATCH(makePatchReq({}), { params: Promise.resolve({ id: 'orden-01' }) })
    expect(res.status).toBe(404)
  })
})
