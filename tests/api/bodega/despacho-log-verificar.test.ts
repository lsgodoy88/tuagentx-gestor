import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/auth-helpers', () => ({ getEmpresaId: vi.fn().mockReturnValue('emp-01') }))
vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRawUnsafe: vi.fn() },
  DB_SCHEMA: 'gestor_staging',
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/bodega/despacho-log/verificar/route'
import { NextRequest } from 'next/server'

const mockSession = (role: string, apiId = 'api-123') => {
  ;(getServerSession as any).mockResolvedValue({ user: { role, apiId } })
}

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/bodega/despacho-log/verificar', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/bodega/despacho-log/verificar', () => {
  it('no-vendedor → deOtros vacío sin consultar BD', async () => {
    mockSession('empresa')
    const res = await POST(makeReq({ huecos: [100, 101] }))
    const data = await res.json()
    expect(data.deOtros).toEqual([])
    expect((prisma as any).$queryRawUnsafe).not.toHaveBeenCalled()
  })

  it('vendedor sin apiId → deOtros vacío', async () => {
    ;(getServerSession as any).mockResolvedValue({ user: { role: 'vendedor', apiId: null } })
    const res = await POST(makeReq({ huecos: [100] }))
    const data = await res.json()
    expect(data.deOtros).toEqual([])
  })

  it('vendedor con huecos vacíos → deOtros vacío sin consultar BD', async () => {
    mockSession('vendedor')
    const res = await POST(makeReq({ huecos: [] }))
    const data = await res.json()
    expect(data.deOtros).toEqual([])
    expect((prisma as any).$queryRawUnsafe).not.toHaveBeenCalled()
  })

  it('vendedor → retorna números de otros vendedores', async () => {
    mockSession('vendedor', 'api-123')
    ;(prisma as any).$queryRawUnsafe.mockResolvedValue([{ n: 100n }, { n: 102n }])
    const res = await POST(makeReq({ huecos: [100, 101, 102] }))
    const data = await res.json()
    expect(data.deOtros).toEqual([100, 102])
  })

  it('slice(0,500) — no procesa más de 500 huecos', async () => {
    mockSession('vendedor', 'api-123')
    ;(prisma as any).$queryRawUnsafe.mockResolvedValue([])
    const huecos = Array.from({ length: 600 }, (_, i) => i + 1)
    await POST(makeReq({ huecos }))
    const [, arr] = (prisma as any).$queryRawUnsafe.mock.calls[0]
    expect(arr.length).toBeLessThanOrEqual(500)
  })
})
