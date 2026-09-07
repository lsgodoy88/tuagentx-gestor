import { describe, it, expect } from 'vitest'

/**
 * Tests unitarios para la lógica de filtrado de rutasHoy en /api/rutas/mi-ruta
 * Escenario: repartidor tiene rutas de días anteriores iniciadas pero no cerradas
 */

const HOY = new Date('2026-09-07T05:00:00.000Z') // hoyInicio Bogotá
const MAÑANA = new Date('2026-09-08T05:00:00.000Z')
const AYER = new Date('2026-09-06T05:00:00.000Z')
const SABADO = new Date('2026-09-04T05:00:00.000Z')

// Replica exacta del filtro en mi-ruta/route.ts
function filtrarRutasHoy(rutas: any[], hoyInicio: Date, mananaInicio: Date) {
  return rutas.filter((r: any) =>
    r.fecha && (
      (new Date(r.fecha) >= hoyInicio && new Date(r.fecha) < mananaInicio) ||
      (new Date(r.fecha) < hoyInicio && !r.cerrada && r.iniciada)
    )
  )
}

describe('mi-ruta — filtrarRutasHoy', () => {
  it('incluye ruta de hoy normal', () => {
    const rutas = [{ fecha: HOY, cerrada: false, iniciada: false }]
    expect(filtrarRutasHoy(rutas, HOY, MAÑANA)).toHaveLength(1)
  })

  it('incluye ruta de hoy cerrada (para mostrar entregados del día)', () => {
    const rutas = [{ fecha: HOY, cerrada: true, iniciada: true }]
    expect(filtrarRutasHoy(rutas, HOY, MAÑANA)).toHaveLength(1)
  })

  it('incluye ruta de ayer iniciada y no cerrada (rezagado)', () => {
    const rutas = [{ fecha: AYER, cerrada: false, iniciada: true }]
    expect(filtrarRutasHoy(rutas, HOY, MAÑANA)).toHaveLength(1)
  })

  it('incluye ruta del sábado iniciada y no cerrada (caso David)', () => {
    const rutas = [{ fecha: SABADO, cerrada: false, iniciada: true }]
    expect(filtrarRutasHoy(rutas, HOY, MAÑANA)).toHaveLength(1)
  })

  it('excluye ruta de ayer NO iniciada (el ajuste lazy la maneja)', () => {
    const rutas = [{ fecha: AYER, cerrada: false, iniciada: false }]
    expect(filtrarRutasHoy(rutas, HOY, MAÑANA)).toHaveLength(0)
  })

  it('excluye ruta de ayer cerrada (historial, no pendiente)', () => {
    const rutas = [{ fecha: AYER, cerrada: true, iniciada: true }]
    expect(filtrarRutasHoy(rutas, HOY, MAÑANA)).toHaveLength(0)
  })

  it('excluye ruta de mañana', () => {
    const rutas = [{ fecha: MAÑANA, cerrada: false, iniciada: false }]
    expect(filtrarRutasHoy(rutas, HOY, MAÑANA)).toHaveLength(0)
  })

  it('excluye ruta sin fecha', () => {
    const rutas = [{ fecha: null, cerrada: false, iniciada: true }]
    expect(filtrarRutasHoy(rutas, HOY, MAÑANA)).toHaveLength(0)
  })

  it('caso David — mezcla hoy + sábado rezagado + ayer cerrado', () => {
    const rutas = [
      { fecha: HOY,    cerrada: false, iniciada: false }, // hoy nueva
      { fecha: SABADO, cerrada: false, iniciada: true  }, // sábado pendiente ✅
      { fecha: AYER,   cerrada: true,  iniciada: true  }, // ayer cerrado → no
      { fecha: AYER,   cerrada: false, iniciada: false }, // ayer no iniciado → no (ajuste lazy)
    ]
    const resultado = filtrarRutasHoy(rutas, HOY, MAÑANA)
    expect(resultado).toHaveLength(2) // hoy + sábado
    expect(resultado.some(r => r.fecha === SABADO)).toBe(true)
    expect(resultado.some(r => r.fecha === HOY)).toBe(true)
  })
})
