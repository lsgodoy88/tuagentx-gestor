import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSession = vi.hoisted(() => vi.fn(() => ({ user: { id: 'u1', empresaId: 'emp1', role: 'vendedor', subEmpresaId: null } })))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncDeuda: { findMany: vi.fn() },
    cliente: { findMany: vi.fn(), count: vi.fn() },
    empleado: { findUnique: vi.fn() },
    empleadoLista: { findMany: vi.fn() },
    clienteLista: { findMany: vi.fn() },
    supervisorVendedor: { findMany: vi.fn() },
    empresaVinculada: { count: vi.fn() },
  },
  DB_SCHEMA: 'gestor_staging'
}))
vi.mock('next-auth', () => ({ getServerSession: mockSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: (u: any) => u.empresaId }))
vi.mock('@/lib/permisos', () => ({ checkPermiso: vi.fn().mockReturnValue(true) }))
vi.mock('@/lib/maps', () => ({ expandirDireccion: vi.fn() }))

import { GET } from '@/app/api/clientes/route'
import { prisma } from '@/lib/prisma'

const p = prisma as any
const makeReq = (params: Record<string, string>) =>
  new Request(`http://localhost/api/clientes?${new URLSearchParams(params)}`)

describe('GET /api/clientes — conDeuda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSession.mockReturnValue({ user: { id: 'u1', empresaId: 'emp1', role: 'vendedor', subEmpresaId: null } })
    p.empresaVinculada.count.mockResolvedValue(0)
    p.cliente.findMany.mockResolvedValue([])
    p.cliente.count.mockResolvedValue(0)
    p.empleado.findUnique.mockResolvedValue({ apiId: 'api-u1' })
    p.empleadoLista.findMany.mockResolvedValue([])
    p.clienteLista.findMany.mockResolvedValue([])
    p.supervisorVendedor.findMany.mockResolvedValue([])
    p.syncDeuda.findMany.mockResolvedValue([])
  })

  it('sin conDeuda: no llama syncDeuda', async () => {
    await GET(makeReq({ q: 'Mar', page: '1', limit: '10' }))
    expect(p.syncDeuda.findMany).not.toHaveBeenCalled()
  })

  it('conDeuda=true: filtra nSaldo>0 y condition=true', async () => {
    p.syncDeuda.findMany.mockResolvedValue([{ clienteApiId: 'api1' }])
    await GET(makeReq({ q: 'Mar', conDeuda: 'true', page: '1', limit: '10' }))
    expect(p.syncDeuda.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nSaldo: { gt: 0 }, condition: true })
      })
    )
  })

  it('conDeuda=true sin deudas: clientes vacío', async () => {
    p.syncDeuda.findMany.mockResolvedValue([])
    const res = await GET(makeReq({ q: 'Mar', conDeuda: 'true', page: '1', limit: '10' }))
    const d = await res.json()
    expect(d.clientes).toEqual([])
  })
})

describe('GET /api/clientes — startsWith', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // rol empresa: no hay early-return por listas de vendedor
    mockSession.mockReturnValue({ user: { id: 'u1', empresaId: 'emp1', role: 'empresa', subEmpresaId: null } })
    p.empresaVinculada.count.mockResolvedValue(0)
    p.cliente.findMany.mockResolvedValue([])
    p.cliente.count.mockResolvedValue(0)
    p.empleado.findUnique.mockResolvedValue({ apiId: 'api-u1' })
    p.empleadoLista.findMany.mockResolvedValue([])
    p.clienteLista.findMany.mockResolvedValue([])
    p.supervisorVendedor.findMany.mockResolvedValue([])
    p.syncDeuda.findMany.mockResolvedValue([])
  })

  it('usa startsWith insensitive', async () => {
    await GET(makeReq({ q: 'Ada', page: '1', limit: '10' }))
    expect(p.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ nombre: { startsWith: 'Ada', mode: 'insensitive' } })
          ])
        })
      })
    )
  })
})
