import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, DB_SCHEMA: 'gestor_staging' }))
vi.mock('@/lib/bodega', () => ({
  subirR2: vi.fn().mockResolvedValue('r2-key'),
  registrarDespachoLog: vi.fn().mockResolvedValue({}),
  esDespachado: vi.fn().mockReturnValue(false),
}))
vi.mock('@/lib/r2', () => ({ registrarStorage: vi.fn(), subirVoucher: vi.fn() }))
vi.mock('@/lib/rutas/getOrCreateRutaHoy', () => ({ getOrCreateRutaHoy: vi.fn() }))
vi.mock('@/lib/cache', () => ({ invalidatePattern: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({
  enviarPushEmpleados: vi.fn().mockResolvedValue({}),
  enviarPushAdmin: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/notificaciones/reglas', () => ({
  getRegla: vi.fn().mockResolvedValue({ activa: false, roles: [] }),
  resolverDestinatarios: vi.fn().mockResolvedValue([]),
}))

import { prisma } from '@/lib/prisma'
import { patchDespacho } from '@/lib/bodega/despacho-patch'

const p = prisma as any

const ORDEN_BASE = {
  id: 'orden-01', empresaId: 'emp-01',
  estado: 'pendiente', fotosAlistamiento: [], fotoAlistamiento: null,
  alistadoEl: null, alistadoPorId: null, entregadoEl: null,
  firmaEntrega: null,
}

const PARAMS_BASE = {
  id: 'orden-01', empresaId: 'emp-01',
  empleadoId: 'bod-01', userName: 'Bodeguero',
}

beforeEach(() => {
  vi.clearAllMocks()
  p.ordenDespacho = { findUnique: vi.fn().mockResolvedValue(ORDEN_BASE), update: vi.fn().mockResolvedValue({}) }
  p.$transaction = vi.fn((ops: any) => Array.isArray(ops) ? Promise.all(ops) : ops(p))
  p.empresaVinculada = { findFirst: vi.fn().mockResolvedValue(null) }
  p.empresa = { findFirst: vi.fn().mockResolvedValue({ nombre: 'Empresa Test' }) }
  p.repartidorOrden = { upsert: vi.fn().mockResolvedValue({}) }
  p.empleado = { findUnique: vi.fn().mockResolvedValue(null) }
})

describe('patchDespacho — autorización', () => {
  it('empresa propietaria → autorizado', async () => {
    const r = await patchDespacho({ ...PARAMS_BASE, body: {} })
    expect(r.orden).toBeDefined()
  })

  it('empresa diferente sin vínculo → 404', async () => {
    await expect(patchDespacho({ ...PARAMS_BASE, empresaId: 'otra-emp', body: {} }))
      .rejects.toMatchObject({ status: 404 })
  })

  it('empresa diferente con vínculo activo → autorizado (Lumeli → Leche)', async () => {
    p.ordenDespacho.findUnique.mockResolvedValue({ ...ORDEN_BASE, empresaId: 'leche-id' })
    p.empresaVinculada.findFirst.mockResolvedValue({ id: 'vinculo-01' })
    const r = await patchDespacho({ ...PARAMS_BASE, empresaId: 'lumeli-id', body: {} })
    expect(r.orden).toBeDefined()
  })

  it('orden no encontrada → 404', async () => {
    p.ordenDespacho.findUnique.mockResolvedValue(null)
    await expect(patchDespacho({ ...PARAMS_BASE, body: {} }))
      .rejects.toMatchObject({ status: 404 })
  })
})

describe('patchDespacho — estado alistado', () => {
  it('alistado sin fotos → 422', async () => {
    await expect(patchDespacho({ ...PARAMS_BASE, body: { estado: 'alistado' } }))
      .rejects.toMatchObject({ status: 422 })
  })

  it('alistado con fotos existentes en orden → OK', async () => {
    p.ordenDespacho.findUnique.mockResolvedValue({
      ...ORDEN_BASE, fotosAlistamiento: ['alistamiento/foto1.jpg'],
    })
    const r = await patchDespacho({ ...PARAMS_BASE, body: { estado: 'alistado' } })
    expect(r.orden).toBeDefined()
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.estado).toBe('alistado')
    expect(update.data.alistadoEl).toBeInstanceOf(Date)
    expect(update.data.alistadoPorId).toBe('bod-01')
  })

  it('alistado → registra empleadoPorId correctamente', async () => {
    p.ordenDespacho.findUnique.mockResolvedValue({ ...ORDEN_BASE, fotosAlistamiento: ['foto.jpg'] })
    await patchDespacho({ ...PARAMS_BASE, body: { estado: 'alistado' } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.alistadoPorId).toBe('bod-01')
  })
})

describe('patchDespacho — estado entregado', () => {
  it('estado entregado → entregadoEl seteado', async () => {
    const r = await patchDespacho({ ...PARAMS_BASE, body: { estado: 'entregado' } })
    expect(r.orden).toBeDefined()
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.entregadoEl).toBeInstanceOf(Date)
    expect(update.data.estado).toBe('entregado')
  })
})

describe('patchDespacho — firma', () => {
  it('firmaBase64 → sube a R2, setea firmaEntrega y estado=entregado', async () => {
    const { subirR2 } = await import('@/lib/bodega')
    const r = await patchDespacho({
      ...PARAMS_BASE,
      body: { firmaBase64: 'data:image/png;base64,abc123' },
    })
    expect(subirR2).toHaveBeenCalled()
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.estado).toBe('entregado')
    expect(update.data.firmaEntrega).toContain('firmas/')
    expect(update.data.entregadoEl).toBeInstanceOf(Date)
  })
})

describe('patchDespacho — clearFotos', () => {
  it('clearFotos=true → resetea fotos a []', async () => {
    await patchDespacho({ ...PARAMS_BASE, body: { clearFotos: true } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.fotosAlistamiento).toEqual([])
    expect(update.data.fotoAlistamiento).toBeNull()
  })
})

describe('patchDespacho — estado en_transito', () => {
  it('en_transito → modo_despacho=transporte (sin repartidorId)', async () => {
    const r = await patchDespacho({ ...PARAMS_BASE, body: { estado: 'en_transito' } })
    expect(r.orden).toBeDefined()
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.estado).toBe('en_transito')
    expect(update.data.modo_despacho).toBe('transporte')
  })

  it('en_transito con repartidorId → modo_despacho=local', async () => {
    await patchDespacho({ ...PARAMS_BASE, body: { estado: 'en_transito', repartidorId: 'rep-01' } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.modo_despacho).toBe('local')
  })

  it('guiaTransporte → genera urlSeguimiento si configDespachos tiene urlBase', async () => {
    p.empresa.findFirst.mockResolvedValue({ nombre: 'Test SA' })
    p.empresa.findUnique = vi.fn().mockResolvedValue({ configDespachos: { urlBase: 'https://track.co/' } })
    await patchDespacho({ ...PARAMS_BASE, body: { estado: 'en_transito', guiaTransporte: '123456' } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.urlSeguimiento).toBe('https://track.co/123456')
    expect(update.data.guiaTransporte).toBe('123456')
  })

  it('guiaTransporte sin urlBase → urlSeguimiento no se setea', async () => {
    p.empresa.findUnique = vi.fn().mockResolvedValue({ configDespachos: {} })
    await patchDespacho({ ...PARAMS_BASE, body: { guiaTransporte: '123456' } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.urlSeguimiento).toBeUndefined()
  })
})

describe('patchDespacho — estado en_entrega', () => {
  beforeEach(() => {
    p.cliente = { findFirst: vi.fn().mockResolvedValue({ id: 'cli-01' }) }
    p.rutaCliente = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) }
    p.empleado = { findUnique: vi.fn().mockResolvedValue({ nombre: 'Repartidor' }) }
  })

  it('en_entrega → modo_despacho=local (con repartidorId)', async () => {
    await patchDespacho({ ...PARAMS_BASE, body: { estado: 'en_entrega', repartidorId: 'rep-01' } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.modo_despacho).toBe('local')
  })

  it('en_entrega → rutaAsignada=true, repartidorNombre cargado', async () => {
    const r = await patchDespacho({ ...PARAMS_BASE, body: { estado: 'en_entrega', repartidorId: 'rep-01' } })
    expect(r.rutaAsignada).toBe(true)
    expect(r.repartidorNombre).toBe('Repartidor')
  })

  it('en_entrega sin repartidorId → rutaAsignada=false', async () => {
    const r = await patchDespacho({ ...PARAMS_BASE, body: { estado: 'en_entrega' } })
    expect(r.rutaAsignada).toBe(false)
    expect(r.repartidorNombre).toBeNull()
  })
})

describe('patchDespacho — num_cajas y observacion', () => {
  it('num_cajas válido → se setea en update', async () => {
    await patchDespacho({ ...PARAMS_BASE, body: { num_cajas: 3 } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.num_cajas).toBe(3)
  })

  it('num_cajas 0 → no se setea (< 1)', async () => {
    await patchDespacho({ ...PARAMS_BASE, body: { num_cajas: 0 } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.num_cajas).toBeUndefined()
  })

  it('num_cajas decimal → no se setea (no entero)', async () => {
    await patchDespacho({ ...PARAMS_BASE, body: { num_cajas: 1.5 } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.num_cajas).toBeUndefined()
  })

  it('observacion string → se setea', async () => {
    await patchDespacho({ ...PARAMS_BASE, body: { observacion: 'fragil' } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.observacion).toBe('fragil')
  })

  it('observacion string vacío → null', async () => {
    await patchDespacho({ ...PARAMS_BASE, body: { observacion: '' } })
    const update = p.ordenDespacho.update.mock.calls[0][0]
    expect(update.data.observacion).toBeNull()
  })
})
