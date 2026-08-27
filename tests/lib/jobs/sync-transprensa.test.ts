import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, DB_SCHEMA: 'gestor_staging' }))
vi.mock('@/lib/crypto-uptres', () => ({
  encrypt: vi.fn((text: string) => `enc:${text}`),
  decrypt: vi.fn((text: string) => text.replace('enc:', '')),
}))

import { prisma } from '@/lib/prisma'
import { runSyncTransprensa } from '@/lib/jobs/sync-transprensa'

const p = prisma as any

const INTEGRACION = {
  empresaId: 'emp-01',
  config: { usuario_login: 'LUMELI', usuario_password: 'enc:pass123' },
}

const ORDEN = { id: 'ord-01', guiaTransporte: '010604463379', numeroFactura: '4303' }

const REMESA_ENTREGADA = {
  numero_remesa: '010604463379',
  estado_remesa: 'FACTURADA',
  estado_atencioncliente: 'ENTREGADO',
  lista_estado_atencioncliente: [
    { estado_codigo: '401', estado_nombre: 'DIGITADA',    estado_fecha: '2026-08-01' },
    { estado_codigo: '73',  estado_nombre: 'ENTREGADO',   estado_fecha: '2026-08-13' },
  ],
  remesa_imagencumplido: 'https://transprensa.net/img/remesa/CE123.tif',
}

const REMESA_EN_TRANSITO = {
  numero_remesa: '010604463379',
  estado_remesa: 'PLANILLADA',
  estado_atencioncliente: 'EN BODEGA DESTINO',
  lista_estado_atencioncliente: [
    { estado_codigo: '401', estado_nombre: 'DIGITADA',          estado_fecha: '2026-08-01' },
    { estado_codigo: '77',  estado_nombre: 'EN BODEGA DESTINO', estado_fecha: '2026-08-12' },
  ],
  remesa_imagencumplido: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

describe('runSyncTransprensa', () => {

  it('retorna 0 empresas si no hay integraciones activas', async () => {
    p.integracion = { findMany: vi.fn().mockResolvedValue([]) }
    const r = await runSyncTransprensa()
    expect(r).toEqual({ ok: true, empresas: 0, actualizadas: 0, entregadas: 0, errores: 0 })
  })

  it('marca orden como entregada cuando Transprensa retorna ENTREGADO', async () => {
    p.integracion = {
      findMany: vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.ordenDespacho = {
      findMany: vi.fn().mockResolvedValue([ORDEN]),
      update:   vi.fn().mockResolvedValue({}),
    }
    p.transprensaRemesa = { upsert: vi.fn().mockResolvedValue({}) }

    // Login OK
    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok123' } }) })
      // Consulta remesa
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [REMESA_ENTREGADA] }) })

    const r = await runSyncTransprensa()

    expect(r.actualizadas).toBe(1)
    expect(r.entregadas).toBe(1)
    expect(r.errores).toBe(0)
    expect(p.ordenDespacho.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ord-01' },
      data:  expect.objectContaining({ estado: 'entregado' }),
    }))
  })

  it('no marca entregada cuando estado es EN BODEGA DESTINO', async () => {
    p.integracion = {
      findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.ordenDespacho = {
      findMany: vi.fn().mockResolvedValue([ORDEN]),
      update:   vi.fn().mockResolvedValue({}),
    }
    p.transprensaRemesa = { upsert: vi.fn().mockResolvedValue({}) }

    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok123' } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [REMESA_EN_TRANSITO] }) })

    const r = await runSyncTransprensa()

    expect(r.actualizadas).toBe(1)
    expect(r.entregadas).toBe(0)
    expect(p.ordenDespacho.update).not.toHaveBeenCalled()
  })

  it('cuenta error si login Transprensa falla', async () => {
    p.integracion = {
      findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.ordenDespacho = { findMany: vi.fn().mockResolvedValue([ORDEN]) }

    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: false, msg: 'Credenciales inválidas' }) })

    const r = await runSyncTransprensa()
    expect(r.errores).toBe(1)
    expect(r.actualizadas).toBe(0)
  })

  it('omite remesa sin resultados en Transprensa', async () => {
    p.integracion = {
      findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.ordenDespacho = {
      findMany: vi.fn().mockResolvedValue([ORDEN]),
      update:   vi.fn(),
    }
    p.transprensaRemesa = { upsert: vi.fn() }

    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok123' } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: false, data: [], msg: 'No encontrada' }) })

    const r = await runSyncTransprensa()
    expect(r.actualizadas).toBe(0)
    expect(p.transprensaRemesa.upsert).not.toHaveBeenCalled()
  })

  it('trim en guiaTransporte antes de consultar', async () => {
    const ordenConEspacio = { ...ORDEN, guiaTransporte: ' 010604463379' }
    p.integracion = {
      findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.ordenDespacho = {
      findMany: vi.fn().mockResolvedValue([ordenConEspacio]),
      update:   vi.fn().mockResolvedValue({}),
    }
    p.transprensaRemesa = { upsert: vi.fn().mockResolvedValue({}) }

    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok123' } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [REMESA_ENTREGADA] }) })

    await runSyncTransprensa()

    // Verifica que el body enviado a Transprensa usa la guía sin espacios
    const callBody = (global.fetch as any).mock.calls[1][1].body
    expect(callBody).toContain('010604463379')
    expect(callBody).not.toContain(' 010604463379')
  })

})
