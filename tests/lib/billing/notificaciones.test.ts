import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRawUnsafe: vi.fn() },
  DB_SCHEMA: 'gestor_staging',
}))
vi.mock('@/lib/admin/push', () => ({
  enviarPushAdmin: vi.fn().mockResolvedValue({ ok: true }),
}))

import { prisma } from '@/lib/prisma'
import { enviarPushAdmin } from '@/lib/admin/push'
import { enviarRecordatorioPago, activarBannerPago } from '@/lib/billing/notificaciones'

const p = prisma as any
const pushMock = enviarPushAdmin as any

const PLANES_PENDIENTES = [
  { empresaId: 'emp-01', monto: 125000 },
  { empresaId: 'emp-02', monto: 80000 },
]

beforeEach(() => {
  vi.clearAllMocks()
  p.planEmpresa = {
    findMany:    vi.fn().mockResolvedValue(PLANES_PENDIENTES),
    update:      vi.fn().mockResolvedValue({}),
    updateMany:  vi.fn().mockResolvedValue({ count: 2 }),
  }
})

describe('enviarRecordatorioPago', () => {
  it('dia=3 → envía push recordatorio a todos los pendientes', async () => {
    const r = await enviarRecordatorioPago(3)
    expect(r.ok).toBe(true)
    expect(r.total).toBe(2)
    expect(pushMock).toHaveBeenCalledTimes(2)
    // Verifica el título del push día 3
    const [, titulo] = pushMock.mock.calls[0]
    expect(titulo).toMatch(/recordatorio/i)
  })

  it('dia=6 → push vencido + actualiza estado a vencido', async () => {
    const r = await enviarRecordatorioPago(6)
    expect(r.ok).toBe(true)
    expect(pushMock).toHaveBeenCalledTimes(2)
    const [, titulo] = pushMock.mock.calls[0]
    expect(titulo).toMatch(/vencido/i)
    // Verifica que actualizó estado
    expect(p.planEmpresa.update).toHaveBeenCalledTimes(2)
    const updateData = p.planEmpresa.update.mock.calls[0][0].data
    expect(updateData.estado).toBe('vencido')
  })

  it('dia=7 → push seguimiento, no cambia estado', async () => {
    await enviarRecordatorioPago(7)
    expect(pushMock).toHaveBeenCalledTimes(2)
    expect(p.planEmpresa.update).not.toHaveBeenCalled()
  })

  it('dia desconocido (ej: 1) → no envía push (solo genera plan)', async () => {
    await enviarRecordatorioPago(1)
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('sin planes pendientes → ok true, total 0, no push', async () => {
    p.planEmpresa.findMany.mockResolvedValue([])
    const r = await enviarRecordatorioPago(3)
    expect(r.ok).toBe(true)
    expect(r.total).toBe(0)
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('push falla en una empresa → continúa con las demás (error en resultados)', async () => {
    pushMock
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('push timeout'))
    const r = await enviarRecordatorioPago(3)
    expect(r.ok).toBe(true)
    expect(r.resultados[0].ok).toBe(true)
    expect(r.resultados[1].error).toBe('push timeout')
  })

  it('resultados incluyen empresaId y dia', async () => {
    const r = await enviarRecordatorioPago(3)
    expect(r.resultados[0]).toMatchObject({ empresaId: 'emp-01', dia: 3, ok: true })
  })
})

describe('activarBannerPago', () => {
  it('retorna ok true + count de activados', async () => {
    const r = await activarBannerPago()
    expect(r.ok).toBe(true)
    expect(r.activados).toBe(2)
  })

  it('filtra solo pendiente/vencido con bannerActivo=false', async () => {
    await activarBannerPago()
    const where = p.planEmpresa.updateMany.mock.calls[0][0].where
    expect(where.estado).toEqual({ in: ['pendiente', 'vencido'] })
    expect(where.bannerActivo).toBe(false)
  })

  it('setea bannerActivo=true', async () => {
    await activarBannerPago()
    const data = p.planEmpresa.updateMany.mock.calls[0][0].data
    expect(data.bannerActivo).toBe(true)
  })

  it('sin planes que activar → activados=0', async () => {
    p.planEmpresa.updateMany.mockResolvedValue({ count: 0 })
    const r = await activarBannerPago()
    expect(r.activados).toBe(0)
  })
})
