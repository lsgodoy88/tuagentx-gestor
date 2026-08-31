/**
 * Tests del Guardián — ventasMesActualMap derivado del batch
 * Verifica que el mapa se construye correctamente desde cumplimiento
 */

import { describe, it, expect } from 'vitest'

interface PuntoMetrica {
  clienteId: string
  montoMes: number
  meta: number
  pct: number | null
}

interface DiaSemana {
  dia: number
  puntos: PuntoMetrica[]
  totalMeta: number
  totalMes: number
}

interface CumplimientoEmp {
  semana: DiaSemana[]
  totalMeta: number
  totalMes: number
  nombre: string
}

// Lógica pura extraída del useMemo
function buildVentasMesActualMap(cumplimiento: Record<string, CumplimientoEmp>): Record<string, number> {
  const mapa: Record<string, number> = {}
  for (const empData of Object.values(cumplimiento)) {
    for (const dia of empData?.semana || []) {
      for (const punto of dia?.puntos || []) {
        if (punto.clienteId && punto.montoMes > 0) {
          mapa[punto.clienteId] = punto.montoMes
        }
      }
    }
  }
  return mapa
}

describe('GUARDIÁN: ventasMesActualMap desde batch', () => {

  it('cumplimiento vacío → mapa vacío', () => {
    const mapa = buildVentasMesActualMap({})
    expect(Object.keys(mapa)).toHaveLength(0)
  })

  it('una impulsadora, un cliente → mapa con ese cliente', () => {
    const mapa = buildVentasMesActualMap({
      'emp1': {
        nombre: 'Laura',
        totalMeta: 1500000,
        totalMes: 1666745,
        semana: [{
          dia: 6,
          totalMeta: 1500000,
          totalMes: 1666745,
          puntos: [{ clienteId: 'cmonwwxeu000nira11vrgs1by', montoMes: 1666745, meta: 1500000, pct: 111 }]
        }]
      }
    })
    expect(mapa['cmonwwxeu000nira11vrgs1by']).toBe(1666745)
  })

  it('cliente con montoMes = 0 → no incluido en mapa', () => {
    const mapa = buildVentasMesActualMap({
      'emp1': {
        nombre: 'Laura',
        totalMeta: 1500000,
        totalMes: 0,
        semana: [{
          dia: 5,
          totalMeta: 1500000,
          totalMes: 0,
          puntos: [{ clienteId: 'cliente-sin-ventas', montoMes: 0, meta: 1500000, pct: 0 }]
        }]
      }
    })
    expect(mapa['cliente-sin-ventas']).toBeUndefined()
  })

  it('múltiples impulsadoras → todos los clientes en el mapa', () => {
    const mapa = buildVentasMesActualMap({
      'emp1': {
        nombre: 'Laura',
        totalMeta: 1500000, totalMes: 1666745,
        semana: [{ dia: 6, totalMeta: 1500000, totalMes: 1666745,
          puntos: [{ clienteId: 'cli-1', montoMes: 1666745, meta: 1500000, pct: 111 }] }]
      },
      'emp2': {
        nombre: 'Cindy',
        totalMeta: 2000000, totalMes: 5451270,
        semana: [{ dia: 1, totalMeta: 2000000, totalMes: 5451270,
          puntos: [{ clienteId: 'cli-2', montoMes: 5451270, meta: 2000000, pct: 272 }] }]
      }
    })
    expect(mapa['cli-1']).toBe(1666745)
    expect(mapa['cli-2']).toBe(5451270)
  })

  it('mismo cliente en múltiples días → último valor gana', () => {
    const mapa = buildVentasMesActualMap({
      'emp1': {
        nombre: 'Laura',
        totalMeta: 3000000, totalMes: 3000000,
        semana: [
          { dia: 1, totalMeta: 1500000, totalMes: 1500000,
            puntos: [{ clienteId: 'cli-rep', montoMes: 1500000, meta: 1500000, pct: 100 }] },
          { dia: 3, totalMeta: 1500000, totalMes: 1500000,
            puntos: [{ clienteId: 'cli-rep', montoMes: 0, meta: 1500000, pct: 0 }] },
        ]
      }
    })
    // montoMes=0 no se incluye, por lo que conserva el valor anterior
    expect(mapa['cli-rep']).toBe(1500000)
  })

  it('Oswaldo Benavides — escenario real', () => {
    const mapa = buildVentasMesActualMap({
      'laura-jaime-id': {
        nombre: 'LAURA JAIME',
        totalMeta: 10000000, totalMes: 1666745,
        semana: [
          { dia: 6, totalMeta: 1500000, totalMes: 1666745,
            puntos: [{ clienteId: 'cmonwwxeu000nira11vrgs1by', montoMes: 1666745, meta: 1500000, pct: 111 }] }
        ]
      }
    })
    expect(mapa['cmonwwxeu000nira11vrgs1by']).toBe(1666745)
    expect(mapa['cmonwwxeu000nira11vrgs1by']).not.toBe(142000)
  })
})
