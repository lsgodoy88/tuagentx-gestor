/**
 * Tests del Guardián — fechaInicioBodega y ventana de pendientes
 *
 * Lógica: desde = MAX(fechaInicioBodega, hoy - 30 días)
 * Si fechaInicioBodega es más reciente que 30 días → usa fechaInicioBodega
 * Si fechaInicioBodega es más antigua que 30 días → usa hoy - 30 días
 * Si fechaInicioBodega es null → usa hoy - 30 días
 */

import { describe, it, expect } from 'vitest'

const DIAS = 30

function calcularDesde(fechaInicioBodega: Date | null, hoy: Date): Date {
  // Si hay fechaInicioBodega → úsala directamente (reemplaza la ventana de 30 días)
  // Si no → usa hoy - 30 días
  if (fechaInicioBodega) return fechaInicioBodega
  const desdePorVentana = new Date(hoy)
  desdePorVentana.setDate(desdePorVentana.getDate() - DIAS)
  return desdePorVentana
}

function ordenEsVisible(fechaOrden: Date, desde: Date): boolean {
  return fechaOrden >= desde
}

const HOY = new Date('2026-08-31')

describe('GUARDIÁN: fechaInicioBodega — cálculo de ventana', () => {

  it('sin fechaInicioBodega → usa hoy - 30 días', () => {
    const desde = calcularDesde(null, HOY)
    expect(desde.toISOString().split('T')[0]).toBe('2026-08-01')
  })

  it('fechaInicioBodega más reciente que 30 días → usa fechaInicioBodega', () => {
    const inicio = new Date('2026-08-15')
    const desde = calcularDesde(inicio, HOY)
    expect(desde.toISOString().split('T')[0]).toBe('2026-08-15')
  })

  it('fechaInicioBodega más antigua que 30 días → usa fechaInicioBodega (reemplaza ventana)', () => {
    const inicio = new Date('2026-07-01')
    const desde = calcularDesde(inicio, HOY)
    expect(desde.toISOString().split('T')[0]).toBe('2026-07-01')
  })

  it('fechaInicioBodega exactamente hace 30 días → usa fechaInicioBodega', () => {
    const inicio = new Date('2026-08-01')
    const desde = calcularDesde(inicio, HOY)
    expect(desde.toISOString().split('T')[0]).toBe('2026-08-01')
  })

  it('fechaInicioBodega = hoy → usa hoy (solo ordenes de hoy)', () => {
    const inicio = new Date('2026-08-31')
    const desde = calcularDesde(inicio, HOY)
    expect(desde.toISOString().split('T')[0]).toBe('2026-08-31')
  })
})

describe('GUARDIÁN: visibilidad de órdenes según ventana', () => {

  it('orden de hoy → visible siempre', () => {
    const desde = calcularDesde(null, HOY)
    expect(ordenEsVisible(new Date('2026-08-31'), desde)).toBe(true)
  })

  it('orden de hace 29 días → visible', () => {
    const desde = calcularDesde(null, HOY)
    expect(ordenEsVisible(new Date('2026-08-02'), desde)).toBe(true)
  })

  it('orden de hace 31 días → no visible', () => {
    const desde = calcularDesde(null, HOY)
    expect(ordenEsVisible(new Date('2026-07-31'), desde)).toBe(false)
  })

  it('orden antes de fechaInicioBodega → no visible aunque esté en ventana 30 días', () => {
    const inicio = new Date('2026-08-15')
    const desde = calcularDesde(inicio, HOY)
    expect(ordenEsVisible(new Date('2026-08-10'), desde)).toBe(false)
  })

  it('orden después de fechaInicioBodega → visible', () => {
    const inicio = new Date('2026-08-15')
    const desde = calcularDesde(inicio, HOY)
    expect(ordenEsVisible(new Date('2026-08-20'), desde)).toBe(true)
  })

  it('orden del 30 julio con fechaInicioBodega 30 julio → visible (usa fecha inicio)', () => {
    const inicio = new Date('2026-07-30')
    const desde = calcularDesde(inicio, HOY)
    expect(desde.toISOString().split('T')[0]).toBe('2026-07-30')
    expect(ordenEsVisible(new Date('2026-07-30'), desde)).toBe(true)
  })
})

describe('GUARDIÁN: escenarios reales Lumeli y Leche', () => {

  const FECHA_INICIO_REAL = new Date('2026-07-30')

  it('Lumeli/Leche — orden de julio 29 → NO visible (cancelada)', () => {
    const desde = calcularDesde(FECHA_INICIO_REAL, HOY)
    expect(ordenEsVisible(new Date('2026-07-29'), desde)).toBe(false)
  })

  it('Lumeli/Leche — orden de julio 30 → visible (fecha inicio reemplaza ventana)', () => {
    const desde = calcularDesde(FECHA_INICIO_REAL, HOY)
    expect(desde.toISOString().split('T')[0]).toBe('2026-07-30')
    expect(ordenEsVisible(new Date('2026-07-30'), desde)).toBe(true)
  })

  it('Lumeli/Leche — orden de agosto → visible', () => {
    const desde = calcularDesde(FECHA_INICIO_REAL, HOY)
    expect(ordenEsVisible(new Date('2026-08-15'), desde)).toBe(true)
  })

  it('nueva bodega sin fechaInicioBodega — orden de hace 31 días → no visible', () => {
    const desde = calcularDesde(null, HOY)
    expect(ordenEsVisible(new Date('2026-07-29'), desde)).toBe(false)
  })
})

describe('GUARDIÁN: sincronización inicial — órdenes a cancelar', () => {

  // Simula la lógica del UPDATE: cancela pendientes anteriores a la fecha
  function ordenDebeSerCancelada(
    fechaOrden: Date,
    estado: string,
    fechaInicio: Date
  ): boolean {
    return estado === 'pendiente' && fechaOrden < fechaInicio
  }

  it('pendiente anterior a inicio → cancelar', () => {
    expect(ordenDebeSerCancelada(new Date('2026-07-15'), 'pendiente', new Date('2026-07-30'))).toBe(true)
  })

  it('pendiente posterior a inicio → NO cancelar', () => {
    expect(ordenDebeSerCancelada(new Date('2026-08-15'), 'pendiente', new Date('2026-07-30'))).toBe(false)
  })

  it('alistado anterior a inicio → NO cancelar (no es pendiente)', () => {
    expect(ordenDebeSerCancelada(new Date('2026-07-15'), 'alistado', new Date('2026-07-30'))).toBe(false)
  })

  it('entregado anterior a inicio → NO cancelar', () => {
    expect(ordenDebeSerCancelada(new Date('2026-07-15'), 'entregado', new Date('2026-07-30'))).toBe(false)
  })

  it('pendiente exactamente en la fecha inicio → NO cancelar (borde)', () => {
    expect(ordenDebeSerCancelada(new Date('2026-07-30'), 'pendiente', new Date('2026-07-30'))).toBe(false)
  })
})
