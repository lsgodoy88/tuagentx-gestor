import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    empleado: { findMany: vi.fn() },
    rutaFija: { findMany: vi.fn() },
    cliente: { findMany: vi.fn() },
    syncDeuda: { findMany: vi.fn() },
    visita: { findMany: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET } from '@/app/api/impulso/pdf/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const EMPRESA_ID = 'empresa-1'
const FECHA = '2026-06-15'

const SNAPSHOT_RESULTADOS = {
  mes: 'junio de 2026',
  fecha: FECHA,
  impulsadoras: [
    { id: 'imp-1', nombre: 'Impulsadora A', vendedorId: 'vend-1', semana: [], totalMeta: 100, totalMes: 80, pctTotal: 80 },
    { id: 'imp-2', nombre: 'Impulsadora B', vendedorId: 'vend-2', semana: [], totalMeta: 100, totalMes: 50, pctTotal: 50 },
  ],
}

const makeReq = (qs: string) => new NextRequest(`http://localhost/api/impulso/pdf${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma as any).reporteImpulsoMes = { findUnique: vi.fn() }
  ;(prisma as any).rutaFija.findMany.mockResolvedValue([])
  ;(prisma as any).cliente.findMany.mockResolvedValue([])
  ;(prisma as any).syncDeuda.findMany.mockResolvedValue([])
  ;(prisma as any).visita.findMany.mockResolvedValue([])
})

describe('GET /api/impulso/pdf — snapshot vs en vivo, scope por rol', () => {
  it('mes con snapshot existente: vendedor solo ve las impulsadoras con su vendedorId', async () => {
    ;(getServerSession as any).mockResolvedValue({
      user: { id: 'vend-1', role: 'vendedor', empresaId: EMPRESA_ID },
    })
    ;(prisma as any).reporteImpulsoMes.findUnique.mockResolvedValue({ resultados: SNAPSHOT_RESULTADOS })

    const res = await GET(makeReq(`?fecha=${FECHA}`))
    const json = await res.json()

    expect(json.snapshot).toBe(true)
    expect(json.impulsadoras).toHaveLength(1)
    expect(json.impulsadoras[0].id).toBe('imp-1')
    expect((prisma as any).rutaFija.findMany).not.toHaveBeenCalled() // no recalcula
  })

  it('mes con snapshot: admin (empresa) ve todas las impulsadoras', async () => {
    ;(getServerSession as any).mockResolvedValue({
      user: { id: EMPRESA_ID, role: 'empresa' },
    })
    ;(prisma as any).reporteImpulsoMes.findUnique.mockResolvedValue({ resultados: SNAPSHOT_RESULTADOS })

    const res = await GET(makeReq(`?fecha=${FECHA}`))
    const json = await res.json()

    expect(json.snapshot).toBe(true)
    expect(json.impulsadoras).toHaveLength(2)
  })

  it('mes con snapshot: rol impulsadora solo ve su propia fila', async () => {
    ;(getServerSession as any).mockResolvedValue({
      user: { id: 'imp-2', role: 'impulsadora', empresaId: EMPRESA_ID },
    })
    ;(prisma as any).reporteImpulsoMes.findUnique.mockResolvedValue({ resultados: SNAPSHOT_RESULTADOS })

    const res = await GET(makeReq(`?fecha=${FECHA}`))
    const json = await res.json()

    expect(json.impulsadoras).toHaveLength(1)
    expect(json.impulsadoras[0].id).toBe('imp-2')
  })

  it('mes SIN snapshot (mes en curso): calcula en vivo, snapshot=false', async () => {
    ;(getServerSession as any).mockResolvedValue({
      user: { id: EMPRESA_ID, role: 'empresa' },
    })
    ;(prisma as any).reporteImpulsoMes.findUnique.mockResolvedValue(null)
    ;(prisma as any).empleado.findMany.mockResolvedValue([])

    const res = await GET(makeReq(`?fecha=${FECHA}`))
    const json = await res.json()

    expect(json.snapshot).toBe(false)
    expect((prisma as any).empleado.findMany).toHaveBeenCalled()
  })

  it('sin sesión → 401', async () => {
    ;(getServerSession as any).mockResolvedValue(null)
    const res = await GET(makeReq(`?fecha=${FECHA}`))
    expect(res.status).toBe(401)
  })
})
