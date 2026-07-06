import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()
const mockCount = vi.fn()
const mockSyncDeudaFindMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncDeuda: { findMany: mockSyncDeudaFindMany },
    cliente: { findMany: mockFindMany, count: mockCount },
  },
  DB_SCHEMA: 'gestor_staging'
}))

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => ({ user: { id: 'u1', empresaId: 'emp1', rol: 'vendedor', subEmpresaId: null } }))
}))

vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: (u: any) => u.empresaId }))

const makeReq = (params: Record<string, string>) =>
  new Request(`http://localhost/api/clientes?${new URLSearchParams(params)}`)

describe('GET /api/clientes — conDeuda', () => {
  beforeEach(() => { vi.clearAllMocks(); mockFindMany.mockResolvedValue([]); mockCount.mockResolvedValue(0) })

  it('sin conDeuda: no llama syncDeuda', async () => {
    const { GET } = await import('@/app/api/clientes/route')
    await GET(makeReq({ q: 'Mar', page: '1', limit: '10' }))
    expect(mockSyncDeudaFindMany).not.toHaveBeenCalled()
  })

  it('conDeuda=true: filtra nSaldo>0 y condition=true', async () => {
    mockSyncDeudaFindMany.mockResolvedValue([{ clienteApiId: 'api1' }])
    const { GET } = await import('@/app/api/clientes/route')
    await GET(makeReq({ q: 'Mar', conDeuda: 'true', page: '1', limit: '10' }))
    expect(mockSyncDeudaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nSaldo: { gt: 0 }, condition: true } })
    )
  })

  it('conDeuda=true sin deudas: clientes vacío', async () => {
    mockSyncDeudaFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/clientes/route')
    const res = await GET(makeReq({ q: 'Mar', conDeuda: 'true', page: '1', limit: '10' }))
    const d = await res.json()
    expect(d.clientes).toEqual([])
  })
})

describe('GET /api/clientes — startsWith', () => {
  beforeEach(() => { vi.clearAllMocks(); mockFindMany.mockResolvedValue([]); mockCount.mockResolvedValue(0) })

  it('usa startsWith insensitive', async () => {
    const { GET } = await import('@/app/api/clientes/route')
    await GET(makeReq({ q: 'Ada', page: '1', limit: '10' }))
    expect(mockFindMany).toHaveBeenCalledWith(
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
