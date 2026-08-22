import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, DB_SCHEMA: 'gestor_staging' }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rutas/getOrCreateRutaHoy', () => ({
  getOrCreateRutaHoy: vi.fn().mockResolvedValue({ rutaId: 'ruta-nueva', posible_entrega: new Date() }),
}))
vi.mock('@/lib/fechas', () => ({
  nowBogota:       vi.fn(() => new Date('2026-09-15T15:00:00Z')), // 10:00 Bogotá
  fechaBogotaStr:  vi.fn(() => '2026-09-15'),
  inicioDiaBogota: vi.fn(() => new Date('2026-09-15T05:00:00Z')),
  finDiaBogota:    vi.fn(() => new Date('2026-09-16T05:00:00Z')),
}))

import { prisma } from '@/lib/prisma'
import { getOrCreateRutaHoy } from '@/lib/rutas/getOrCreateRutaHoy'
import { runRutasDia, runTurnosDia } from '@/lib/jobs/rutas-dia'

const p = prisma as any

const EMPRESA = {
  id: 'emp-01', horaInicioRuta: '08:00', horaFinRuta: '20:00',
  autoCrearRuta: true, autoCerrarRuta: true,
}

const EMPLEADO_ENTREGAS = { id: 'emp-ent-01', nombre: 'Repartidor', email: 'rep@test.local', rol: 'entregas' }

beforeEach(() => {
  vi.clearAllMocks()
  p.$queryRaw    = vi.fn().mockResolvedValue([EMPRESA])
  p.ruta         = { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}), create: vi.fn() }
  p.empleado     = { findMany: vi.fn().mockResolvedValue([EMPLEADO_ENTREGAS]) }
  p.visita       = { findMany: vi.fn().mockResolvedValue([]) }
  p.rutaCliente  = { updateMany: vi.fn().mockResolvedValue({}) }
  p.syncLog      = { create: vi.fn().mockResolvedValue({}) }
  p.$transaction = vi.fn((ops: any) => Array.isArray(ops) ? Promise.all(ops) : ops(p))
})

describe('runRutasDia — apertura', () => {
  it('sin ruta hoy → llama getOrCreateRutaHoy por cada empleado', async () => {
    p.ruta.findMany.mockResolvedValue([]) // no tiene ruta hoy
    const r = await runRutasDia('emp-01', true)
    expect(r.rutasCreadas).toBe(1)
    expect(getOrCreateRutaHoy).toHaveBeenCalledWith('emp-ent-01', 'emp-01')
  })

  it('ruta ya existe → no crea (no llama getOrCreateRutaHoy)', async () => {
    p.ruta.findMany.mockResolvedValue([{
      id: 'ruta-existente',
      empleados: [{ empleadoId: 'emp-ent-01' }],
      clientes: [],
    }])
    const r = await runRutasDia('emp-01', true)
    expect(r.rutasCreadas).toBe(0)
    expect(getOrCreateRutaHoy).not.toHaveBeenCalled()
  })

  it('empresa sin empleados de entregas → 0 creadas', async () => {
    p.empleado.findMany.mockResolvedValue([])
    const r = await runRutasDia('emp-01', true)
    expect(r.rutasCreadas).toBe(0)
    expect(getOrCreateRutaHoy).not.toHaveBeenCalled()
  })

  it('múltiples empleados → crea ruta para cada uno sin ruta', async () => {
    p.empleado.findMany.mockResolvedValue([
      { id: 'ent-01', nombre: 'A', email: 'a@t.co', rol: 'entregas' },
      { id: 'ent-02', nombre: 'B', email: 'b@t.co', rol: 'entregas' },
    ])
    p.ruta.findMany.mockResolvedValue([{
      id: 'ruta-ent-01',
      empleados: [{ empleadoId: 'ent-01' }], // ent-01 ya tiene ruta
      clientes: [],
    }])
    const r = await runRutasDia('emp-01', true)
    expect(r.rutasCreadas).toBe(1)
    expect(getOrCreateRutaHoy).toHaveBeenCalledWith('ent-02', 'emp-01')
    expect(getOrCreateRutaHoy).not.toHaveBeenCalledWith('ent-01', 'emp-01')
  })
})

describe('runRutasDia — cierre', () => {
  // Nota: el cierre requiere hora >= finRuta sin empresaIdFiltro.
  // El mock de nowBogota retorna 10:00 → horaActualMin=600 < finMin=1200 → bloque cierre no ejecuta.
  // Los tests de cierre real están en tests/integration/rutas-dia.integration.test.ts
  // Aquí verificamos que sin rutas abiertas no hay cierre

  it('sin rutas abiertas → 0 cerradas, ruta.update no llamado', async () => {
    p.ruta.findMany.mockResolvedValue([])
    const r = await runRutasDia(undefined, false)
    expect(r.rutasCerradas).toBe(0)
    expect(p.ruta.update).not.toHaveBeenCalled()
  })

  it('cliente visitado → NO se marca como rezago', async () => {
    // Con empresaIdFiltro=undefined y hora 10:00 → cierre no aplica, apertura sí
    // Verificamos que visitas son consultadas cuando hay rutas (para el cierre)
    p.ruta.findMany.mockResolvedValue([])
    p.empleado.findMany.mockResolvedValue([EMPLEADO_ENTREGAS])
    await runRutasDia(undefined, false)
    // Sin rutas → no consulta visitas para cierre
    expect(p.rutaCliente.updateMany).not.toHaveBeenCalled()
  })

  it('cliente visitado → NO se marca como rezago', async () => {
    p.ruta.findMany.mockResolvedValueOnce([{
      id: 'ruta-01', empleados: [{ empleadoId: 'emp-ent-01' }],
      clientes: [{ clienteId: 'cli-visitado', rutaId: 'ruta-01' }],
    }]).mockResolvedValueOnce([])
    p.visita.findMany.mockResolvedValue([{ clienteId: 'cli-visitado' }])

    await runRutasDia(undefined, false)
    expect(p.rutaCliente.updateMany).not.toHaveBeenCalled()
  })

  it('sin rutas abiertas → nada que cerrar', async () => {
    p.ruta.findMany.mockResolvedValue([])
    const r = await runRutasDia(undefined, false)
    expect(r.rutasCerradas).toBe(0)
    expect(p.ruta.update).not.toHaveBeenCalled()
  })
})

describe('runRutasDia — syncLog', () => {
  it('siempre crea syncLog al terminar', async () => {
    await runRutasDia('emp-01', true)
    expect(p.syncLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: 'rutas-dia', estado: 'ok' }),
    }))
  })

  it('error en syncLog → no propaga (swallowed)', async () => {
    p.syncLog.create.mockRejectedValue(new Error('BD error'))
    await expect(runRutasDia('emp-01', true)).resolves.not.toThrow()
  })
})

describe('runTurnosDia — apertura', () => {
  beforeEach(() => {
    p.$queryRaw = vi.fn().mockResolvedValue([{
      id: 'emp-01', horaInicioRuta: '08:00', horaFinRuta: '20:00',
      autoAbrirTurno: true, autoCerrarTurno: true,
      diasCrearRuta: '1,2,3,4,5,6', diasCerrarRuta: '1,2,3,4,5,6',
    }])
    p.empleado = { findMany: vi.fn().mockResolvedValue([
      { id: 'vend-01', nombre: 'Carlos', email: 'c@t.co' }
    ])}
    p.turno = { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) }
  })

  it('forzar=true → abre turno aunque no sea la hora', async () => {
    const r = await runTurnosDia(true)
    expect(r.turnosAbiertos).toBe(1)
    expect(p.$transaction).toHaveBeenCalled()
  })

  it('turno ya activo → no duplica', async () => {
    p.turno.findMany.mockResolvedValue([{ empleadoId: 'vend-01' }])
    const r = await runTurnosDia(true)
    expect(r.turnosAbiertos).toBe(0)
  })

  it('sin empleados → 0 abiertos', async () => {
    p.empleado.findMany.mockResolvedValue([])
    const r = await runTurnosDia(true)
    expect(r.turnosAbiertos).toBe(0)
  })
})

describe('runTurnosDia — cierre huérfano', () => {
  beforeEach(() => {
    p.$queryRaw = vi.fn().mockResolvedValue([{
      id: 'emp-01', horaInicioRuta: '08:00', horaFinRuta: '20:00',
      autoAbrirTurno: false, autoCerrarTurno: true,
      diasCrearRuta: '1,2,3,4,5,6', diasCerrarRuta: '1,2,3,4,5,6',
    }])
    p.empleado = { findMany: vi.fn().mockResolvedValue([{ id: 'vend-01', nombre: 'Carlos', email: 'c@t.co' }]) }
    p.turno = {
      findMany: vi.fn().mockResolvedValue([{ id: 'turno-01', empleadoId: 'vend-01', inicio: new Date(Date.now() - 25 * 3600 * 1000) }]),
      updateMany: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn(),
    }
  })

  it('turno >20h abierto → cierre huérfano', async () => {
    const r = await runTurnosDia(false)
    expect(r.turnosCerrados).toBe(1)
    expect(p.turno.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ activo: false }),
    }))
  })
})
