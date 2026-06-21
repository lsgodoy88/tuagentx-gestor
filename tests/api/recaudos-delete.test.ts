import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pagoCartera: { findUnique: vi.fn(), delete: vi.fn() },
    syncDeuda: { findUnique: vi.fn(), update: vi.fn() },
    empleado: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: any) => {
      const { prisma: p } = await import('@/lib/prisma')
      return fn(p)
    }),
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/cache', () => ({ invalidateKeys: vi.fn() }))
vi.mock('@/lib/fechas', () => ({ fechaHoyBogota: () => '2026-06-21' }))
vi.mock('@/lib/auth-helpers', () => ({
  getEmpresaId: (user: any) => user.empresaId,
  ROLES_ADMIN: ['empresa', 'supervisor'],
}))

import { DELETE } from '@/app/api/recaudos/[pagoId]/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const ADMIN = { user: { id: 'adm-1', role: 'empresa', empresaId: 'emp-1' } } as any

const makeReq = () => new NextRequest('http://localhost/api/recaudos/pago-1', { method: 'DELETE' })
const makeParams = (pagoId = 'pago-1') => ({ params: Promise.resolve({ pagoId }) })

describe('DELETE /api/recaudos/[pagoId] — reversion de saldo', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('pago pendiente con syncDeudaId → revierte saldo, sin advertencia', async () => {
    vi.mocked(getServerSession).mockResolvedValue(ADMIN)
    vi.mocked((prisma as any).pagoCartera.findUnique).mockResolvedValue({
      id: 'pago-1', numeroRecibo: 'REC001', empleadoId: 'e1', monto: 100000,
      envioEstado: 'pendiente', syncDeudaId: 'sd-1',
      Cartera: { empresaId: 'emp-1' }, Empleado: { empresaId: 'emp-1' },
    })
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue({ saldo: 0, valor: 300000 })
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})
    vi.mocked((prisma as any).pagoCartera.delete).mockResolvedValue({})
    vi.mocked((prisma as any).empleado.findUnique).mockResolvedValue({ configRecibos: {} })

    const res = await DELETE(makeReq(), makeParams())
    const data = await res.json()

    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-1' },
      data: { saldo: 100000, condition: true },
    })
    expect(data.ok).toBe(true)
    expect(data.advertencia).toBeUndefined()
  })

  it('pago ya recibido → revierte saldo igual, pero incluye advertencia', async () => {
    vi.mocked(getServerSession).mockResolvedValue(ADMIN)
    vi.mocked((prisma as any).pagoCartera.findUnique).mockResolvedValue({
      id: 'pago-1', numeroRecibo: 'REC002', empleadoId: 'e1', monto: 100000,
      envioEstado: 'recibido', syncDeudaId: 'sd-1',
      Cartera: { empresaId: 'emp-1' }, Empleado: { empresaId: 'emp-1' },
    })
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue({ saldo: 0, valor: 300000 })
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})
    vi.mocked((prisma as any).pagoCartera.delete).mockResolvedValue({})
    vi.mocked((prisma as any).empleado.findUnique).mockResolvedValue({ configRecibos: {} })

    const res = await DELETE(makeReq(), makeParams())
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.advertencia).toBeDefined()
    expect(data.advertencia).toContain('UpTres')
  })

  it('reversion nunca supera el valor original de la factura (Math.min)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(ADMIN)
    vi.mocked((prisma as any).pagoCartera.findUnique).mockResolvedValue({
      id: 'pago-1', numeroRecibo: 'REC003', empleadoId: 'e1', monto: 500000,
      envioEstado: 'pendiente', syncDeudaId: 'sd-1',
      Cartera: { empresaId: 'emp-1' }, Empleado: { empresaId: 'emp-1' },
    })
    // saldo actual 100000 + monto 500000 = 600000, pero valor de la factura es solo 300000
    vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue({ saldo: 100000, valor: 300000 })
    vi.mocked((prisma as any).syncDeuda.update).mockResolvedValue({})
    vi.mocked((prisma as any).pagoCartera.delete).mockResolvedValue({})
    vi.mocked((prisma as any).empleado.findUnique).mockResolvedValue({ configRecibos: {} })

    await DELETE(makeReq(), makeParams())

    expect((prisma as any).syncDeuda.update).toHaveBeenCalledWith({
      where: { id: 'sd-1' },
      data: { saldo: 300000, condition: true }, // acotado al valor, no 600000
    })
  })

  it('pago sin syncDeudaId (manual, sin ERP) → no intenta tocar SyncDeuda', async () => {
    vi.mocked(getServerSession).mockResolvedValue(ADMIN)
    vi.mocked((prisma as any).pagoCartera.findUnique).mockResolvedValue({
      id: 'pago-1', numeroRecibo: 'REC004', empleadoId: 'e1', monto: 50000,
      envioEstado: 'pendiente', syncDeudaId: null,
      Cartera: { empresaId: 'emp-1' }, Empleado: { empresaId: 'emp-1' },
    })
    vi.mocked((prisma as any).pagoCartera.delete).mockResolvedValue({})
    vi.mocked((prisma as any).empleado.findUnique).mockResolvedValue({ configRecibos: {} })

    const res = await DELETE(makeReq(), makeParams())
    const data = await res.json()

    expect((prisma as any).syncDeuda.findUnique).not.toHaveBeenCalled()
    expect((prisma as any).syncDeuda.update).not.toHaveBeenCalled()
    expect(data.ok).toBe(true)
  })
})
