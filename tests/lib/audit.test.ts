import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { create: vi.fn() },
  },
}))

import { audit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

describe('lib/audit — audit() logger', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('llamada mínima (solo accion) → crea log con resto undefined', async () => {
    await audit('LOGIN')
    expect((prisma as any).auditLog.create).toHaveBeenCalledWith({
      data: {
        accion: 'LOGIN',
        usuario: undefined,
        detalle: undefined,
        empleadoId: undefined,
        empresaId: undefined,
      },
    })
  })

  it('llamada completa: accion + usuario + detalle + empleadoId + empresaId', async () => {
    await audit('VISITA_REGISTRADA', 'v@x.com', 'Cliente: c1', 'emp-1', 'empresa-1')
    expect((prisma as any).auditLog.create).toHaveBeenCalledWith({
      data: {
        accion: 'VISITA_REGISTRADA',
        usuario: 'v@x.com',
        detalle: 'Cliente: c1',
        empleadoId: 'emp-1',
        empresaId: 'empresa-1',
      },
    })
  })

  it('error en prisma.create → SWALLOWED (no throws, no rompe el flujo del caller)', async () => {
    vi.mocked((prisma as any).auditLog.create).mockRejectedValue(new Error('DB caída'))
    // No debe tirar
    await expect(audit('FALLA')).resolves.toBeUndefined()
  })

  it('error logueado a console pero no propagado', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked((prisma as any).auditLog.create).mockRejectedValue(new Error('boom'))
    await audit('X')
    expect(spy).toHaveBeenCalledWith('Audit error:', expect.any(Error))
    spy.mockRestore()
  })

  it('siempre devuelve undefined (fire-and-forget pattern)', async () => {
    vi.mocked((prisma as any).auditLog.create).mockResolvedValue({ id: 'log-1' })
    const r = await audit('OK')
    expect(r).toBeUndefined()
  })
})
