import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
// Fechas fijas en UTC (Bogotá = UTC-5)
const HOY_INICIO    = new Date('2026-09-15T05:00:00Z') // 00:00 Bogotá
const MANANA_INICIO = new Date('2026-09-16T05:00:00Z') // 00:00 mañana Bogotá
const PASADO_INICIO = new Date('2026-09-17T05:00:00Z') // 00:00 pasado mañana

vi.mock('@/lib/fechas', () => ({
  nowBogota:       vi.fn(() => new Date('2026-09-15T10:00:00-05:00')),
  fechaBogotaStr:  vi.fn(() => '2026-09-15'),
  inicioDiaBogota: vi.fn(() => HOY_INICIO),
  // finDiaBogota se llama con ahoraBog (hoy) y ahoraBog+24h (mañana)
  // diferenciamos por el timestamp del argumento
  finDiaBogota: vi.fn((fecha: Date) => {
    const ts = fecha.getTime()
    const hoyTs = new Date('2026-09-15T10:00:00-05:00').getTime()
    return ts <= hoyTs ? MANANA_INICIO : PASADO_INICIO
  }),
}))

import { prisma } from '@/lib/prisma'
import { getOrCreateRutaHoy } from '@/lib/rutas/getOrCreateRutaHoy'

const p = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  p.rutaEmpleado = { findFirst: vi.fn() }
  p.ruta         = { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) }
  p.empleado     = { findUnique: vi.fn().mockResolvedValue({ nombre: 'Carlos' }) }
})

describe('getOrCreateRutaHoy — ruta hoy existe', () => {
  it('ruta hoy NO iniciada → retorna rutaId + posible_entrega = hoy', async () => {
    p.rutaEmpleado.findFirst.mockResolvedValue({ rutaId: 'ruta-hoy', ruta: { iniciada: false } })
    const r = await getOrCreateRutaHoy('emp-1', 'empresa-1')
    expect(r.rutaId).toBe('ruta-hoy')
    expect(r.posible_entrega).toEqual(HOY_INICIO)
    // No debe crear nada
    expect(p.ruta.create).not.toHaveBeenCalled()
  })

  it('ruta hoy iniciada + ruta mañana existe → retorna rutaId mañana', async () => {
    p.rutaEmpleado.findFirst
      .mockResolvedValueOnce({ rutaId: 'ruta-hoy', ruta: { iniciada: true } })
      .mockResolvedValueOnce({ rutaId: 'ruta-manana' })
    const r = await getOrCreateRutaHoy('emp-1', 'empresa-1')
    expect(r.rutaId).toBe('ruta-manana')
    expect(r.posible_entrega).toEqual(MANANA_INICIO)
    expect(p.ruta.create).not.toHaveBeenCalled()
  })

  it('ruta hoy iniciada + sin ruta mañana → crea ruta mañana', async () => {
    p.rutaEmpleado.findFirst
      .mockResolvedValueOnce({ rutaId: 'ruta-hoy', ruta: { iniciada: true } })
      .mockResolvedValueOnce(null) // no hay ruta mañana
    p.ruta.create.mockResolvedValue({ id: 'ruta-nueva-manana' })
    const r = await getOrCreateRutaHoy('emp-1', 'empresa-1')
    expect(r.rutaId).toBe('ruta-nueva-manana')
    expect(r.posible_entrega).toEqual(MANANA_INICIO) // 00:00 mañana Bogotá
    expect(p.ruta.create).toHaveBeenCalledTimes(1)
    const createData = p.ruta.create.mock.calls[0][0].data
    expect(createData.nombre).toContain('Carlos')
    expect(createData.fecha).toEqual(MANANA_INICIO) // ruta creada con fecha mañana
  })
})

describe('getOrCreateRutaHoy — sin ruta hoy', () => {
  it('crea ruta hoy con nombre del empleado', async () => {
    p.rutaEmpleado.findFirst.mockResolvedValue(null) // anti-race también null
    p.ruta.create.mockResolvedValue({ id: 'ruta-creada-hoy' })
    const r = await getOrCreateRutaHoy('emp-1', 'empresa-1')
    expect(r.rutaId).toBe('ruta-creada-hoy')
    expect(r.posible_entrega).toEqual(HOY_INICIO)
    const createData = p.ruta.create.mock.calls[0][0].data
    expect(createData.nombre).toContain('Carlos')
    expect(createData.empresaId).toBe('empresa-1')
  })

  it('anti-race: segundo findFirst retorna ruta → usa la existente, no crea', async () => {
    p.rutaEmpleado.findFirst
      .mockResolvedValueOnce(null)                       // primera búsqueda: no hay
      .mockResolvedValueOnce({ rutaId: 'ruta-race' })   // anti-race: ya existe
    const r = await getOrCreateRutaHoy('emp-1', 'empresa-1')
    expect(r.rutaId).toBe('ruta-race')
    expect(p.ruta.create).not.toHaveBeenCalled()
  })

  it('nombre duplicado → agrega sufijo (contador)', async () => {
    p.rutaEmpleado.findFirst.mockResolvedValue(null)
    p.ruta.findMany.mockResolvedValue([
      { nombre: 'Carlos-15-09-2026' },
      { nombre: 'Carlos-15-09-2026 (1)' },
    ])
    p.ruta.create.mockResolvedValue({ id: 'ruta-suf' })
    await getOrCreateRutaHoy('emp-1', 'empresa-1')
    const nombre = p.ruta.create.mock.calls[0][0].data.nombre
    expect(nombre).toBe('Carlos-15-09-2026 (2)')
  })

  it('empleado no encontrado → nombre = "Repartidor"', async () => {
    p.rutaEmpleado.findFirst.mockResolvedValue(null)
    p.empleado.findUnique.mockResolvedValue(null)
    p.ruta.create.mockResolvedValue({ id: 'ruta-sin-nombre' })
    await getOrCreateRutaHoy('emp-x', 'empresa-1')
    const nombre = p.ruta.create.mock.calls[0][0].data.nombre
    expect(nombre).toContain('Repartidor')
  })
})
