import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockTurnoFindFirst = vi.fn()
const mockClienteFindUnique = vi.fn()
const mockEmpleadoFindUnique = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    turno: { findFirst: mockTurnoFindFirst },
    cliente: { findUnique: mockClienteFindUnique },
    empleado: { findUnique: mockEmpleadoFindUnique },
    $transaction: mockTransaction,
  },
  DB_SCHEMA: 'gestor_staging'
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(() => ({ user: { id: 'u1', empresaId: 'emp1', rol: 'vendedor' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: (u: any) => u.empresaId }))
vi.mock('@/lib/r2', () => ({}))

const makeReq = (body: object) =>
  new Request('http://localhost/api/visitas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/visitas — prospecto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTurnoFindFirst.mockResolvedValue({ id: 't1' })
    mockClienteFindUnique.mockResolvedValue({ id: '__PROSPECTO__emp1', lat: null, ubicacionReal: false })
    mockEmpleadoFindUnique.mockResolvedValue({ id: 'u1' })
    const txMock = {
      visita: { create: vi.fn().mockResolvedValue({ id: 'v1', tipo: 'visita', clienteNombreLibre: 'Juan Perez' }) },
      cliente: { update: vi.fn() },
      ruta: { findFirst: vi.fn().mockResolvedValue(null) },
      ordenDespacho: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    }
    mockTransaction.mockImplementation(async (fn: any) => fn(txMock))
  })

  it('resuelve __PROSPECTO__ → __PROSPECTO__emp1', async () => {
    const { POST } = await import('@/app/api/visitas/route')
    const res = await POST(makeReq({ clienteId: '__PROSPECTO__', clienteNombreLibre: 'Juan Perez', tipo: 'visita' }))
    expect(res.status).not.toBe(400)
    expect(mockClienteFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '__PROSPECTO__emp1' } })
    )
  })

  it('sin clienteId: 400', async () => {
    const { POST } = await import('@/app/api/visitas/route')
    const res = await POST(makeReq({ tipo: 'visita' }))
    expect(res.status).toBe(400)
  })

  it('prospecto no actualiza GPS cliente', async () => {
    const mockUpdate = vi.fn()
    mockTransaction.mockImplementation(async (fn: any) => fn({
      visita: { create: vi.fn().mockResolvedValue({ id: 'v1' }) },
      cliente: { update: mockUpdate },
      ruta: { findFirst: vi.fn().mockResolvedValue(null) },
      ordenDespacho: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    }))
    const { POST } = await import('@/app/api/visitas/route')
    await POST(makeReq({ clienteId: '__PROSPECTO__', clienteNombreLibre: 'Maria Lopez', tipo: 'visita', lat: 4.5, lng: -74.1, capturarGps: true }))
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
