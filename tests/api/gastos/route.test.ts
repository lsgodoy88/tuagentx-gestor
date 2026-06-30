import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gasto: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET, POST, PUT, DELETE } from '@/app/api/gastos/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const EMPRESA_ID = 'empresa-1'

const makeReq = (method: string, qs = '', body?: any) => new NextRequest(`http://localhost/api/gastos${qs}`, {
  method, ...(body ? { body: JSON.stringify(body) } : {}),
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/gastos — scope por rol', () => {
  it('vendedor: solo ve sus propios gastos (filtro empleadoId forzado)', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID } })
    ;(prisma as any).gasto.findMany.mockImplementation(({ where }: any) => {
      expect(where.empleadoId).toBe('vend-1')
      return Promise.resolve([{ id: 'g1', empleadoId: 'vend-1' }])
    })

    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(200)
  })

  it('impulsadora: solo ve sus propios gastos', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'imp-1', role: 'impulsadora', empresaId: EMPRESA_ID } })
    ;(prisma as any).gasto.findMany.mockImplementation(({ where }: any) => {
      expect(where.empleadoId).toBe('imp-1')
      return Promise.resolve([])
    })

    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(200)
  })

  it('admin: ve todos los gastos de la empresa, sin filtro de empleadoId', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: EMPRESA_ID, role: 'empresa' } })
    ;(prisma as any).gasto.findMany.mockImplementation(({ where }: any) => {
      expect(where.empleadoId).toBeUndefined()
      return Promise.resolve([{ id: 'g1' }, { id: 'g2' }])
    })

    const res = await GET(makeReq('GET'))
    const json = await res.json()
    expect(json.gastos).toHaveLength(2)
  })

  it('rol bodega (sin permiso) → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'b1', role: 'bodega', empresaId: EMPRESA_ID } })
    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/gastos — creación con empleadoId forzado', () => {
  it('vendedor: el gasto se crea con SU id, ignora empleadoId del body (anti-suplantación)', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID } })
    ;(prisma as any).gasto.create.mockImplementation(({ data }: any) => {
      expect(data.empleadoId).toBe('vend-1') // NO 'otro-vendedor' del body
      return Promise.resolve({ id: 'g1', ...data })
    })

    const res = await POST(makeReq('POST', '', {
      concepto: 'Gasolina', valor: 50000, tipo: 'Viaticos', evidenciaKey: 'gastos/x.jpg', empleadoId: 'otro-vendedor',
    }))
    expect(res.status).toBe(200)
  })

  it('sin concepto/valor/evidenciaKey → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID } })
    const res = await POST(makeReq('POST', '', { concepto: 'Gasolina' }))
    expect(res.status).toBe(400)
    expect((prisma as any).gasto.create).not.toHaveBeenCalled()
  })

  it('sin tipo → 400, no crea (campo obligado)', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID } })
    const res = await POST(makeReq('POST', '', {
      concepto: 'Gasolina', valor: 50000, evidenciaKey: 'gastos/x.jpg',
    }))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toMatch(/tipo/i)
    expect((prisma as any).gasto.create).not.toHaveBeenCalled()
  })

  it('tipo inválido (no está en la lista permitida) → 400', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID } })
    const res = await POST(makeReq('POST', '', {
      concepto: 'Gasolina', valor: 50000, tipo: 'Inventado', evidenciaKey: 'gastos/x.jpg',
    }))
    expect(res.status).toBe(400)
    expect((prisma as any).gasto.create).not.toHaveBeenCalled()
  })

  it('cada uno de los 4 tipos válidos es aceptado', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID } })
    ;(prisma as any).gasto.create.mockResolvedValue({ id: 'g1' })

    for (const tipo of ['Viaticos', 'Eventos', 'Papeleria', 'Otros']) {
      const res = await POST(makeReq('POST', '', {
        concepto: 'X', valor: 1000, tipo, evidenciaKey: 'gastos/x.jpg',
      }))
      expect(res.status).toBe(200)
    }
  })
})

describe('PUT /api/gastos — solo admin puede editar', () => {
  it('vendedor intenta editar su propio gasto → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID } })
    const res = await PUT(makeReq('PUT', '', { id: 'g1', concepto: 'Editado' }))
    expect(res.status).toBe(403)
    expect((prisma as any).gasto.update).not.toHaveBeenCalled()
  })

  it('admin edita gasto de su empresa → 200', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: EMPRESA_ID, role: 'empresa' } })
    ;(prisma as any).gasto.findUnique.mockResolvedValue({ id: 'g1', empresaId: EMPRESA_ID })
    ;(prisma as any).gasto.update.mockResolvedValue({ id: 'g1', concepto: 'Editado' })

    const res = await PUT(makeReq('PUT', '', { id: 'g1', concepto: 'Editado' }))
    expect(res.status).toBe(200)
  })

  it('admin intenta editar gasto de OTRA empresa → 404 (no filtra por empresa, no expone)', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: EMPRESA_ID, role: 'empresa' } })
    ;(prisma as any).gasto.findUnique.mockResolvedValue({ id: 'g1', empresaId: 'otra-empresa' })

    const res = await PUT(makeReq('PUT', '', { id: 'g1', concepto: 'Hack' }))
    expect(res.status).toBe(404)
    expect((prisma as any).gasto.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/gastos — solo admin puede eliminar', () => {
  it('impulsadora intenta eliminar su propio gasto → 403', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: 'imp-1', role: 'impulsadora', empresaId: EMPRESA_ID } })
    const res = await DELETE(makeReq('DELETE', '?id=g1'))
    expect(res.status).toBe(403)
    expect((prisma as any).gasto.delete).not.toHaveBeenCalled()
  })

  it('admin elimina gasto de su empresa → 200', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { id: EMPRESA_ID, role: 'empresa' } })
    ;(prisma as any).gasto.findUnique.mockResolvedValue({ id: 'g1', empresaId: EMPRESA_ID })

    const res = await DELETE(makeReq('DELETE', '?id=g1'))
    expect(res.status).toBe(200)
    expect((prisma as any).gasto.delete).toHaveBeenCalledWith({ where: { id: 'g1' } })
  })
})
