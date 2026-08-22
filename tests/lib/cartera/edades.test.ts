import { describe, it, expect } from 'vitest'
import { calcularDiasV, calcularEdadCartera } from '@/lib/cartera'

// diasv = días hasta vencimiento (positivo=futuro, negativo=vencido)

describe('calcularEdadCartera — buckets', () => {
  it('diasv null → 0-30 (sin fecha)', () => {
    expect(calcularEdadCartera(null)).toBe('0-30')
  })

  it('diasv >= 0 → 0-30 (vigente)', () => {
    expect(calcularEdadCartera(0)).toBe('0-30')
    expect(calcularEdadCartera(15)).toBe('0-30')
    expect(calcularEdadCartera(90)).toBe('0-30')
  })

  it('diasv -1 → 31-60 (1 día vencido)', () => {
    expect(calcularEdadCartera(-1)).toBe('31-60')
  })

  it('diasv -30 → 31-60 (límite bucket)', () => {
    expect(calcularEdadCartera(-30)).toBe('31-60')
  })

  it('diasv -31 → 61-90', () => {
    expect(calcularEdadCartera(-31)).toBe('61-90')
  })

  it('diasv -60 → 61-90 (límite bucket)', () => {
    expect(calcularEdadCartera(-60)).toBe('61-90')
  })

  it('diasv -61 → 91-120', () => {
    expect(calcularEdadCartera(-61)).toBe('91-120')
  })

  it('diasv -90 → 91-120 (límite bucket)', () => {
    expect(calcularEdadCartera(-90)).toBe('91-120')
  })

  it('diasv -91 → +120', () => {
    expect(calcularEdadCartera(-91)).toBe('+120')
  })

  it('diasv -365 → +120 (muy vencida)', () => {
    expect(calcularEdadCartera(-365)).toBe('+120')
  })
})

describe('calcularDiasV', () => {
  it('fecha null → null', () => {
    expect(calcularDiasV(null)).toBeNull()
    expect(calcularDiasV(undefined)).toBeNull()
  })

  it('fecha futura → positivo', () => {
    const futura = new Date()
    futura.setDate(futura.getDate() + 10)
    const dias = calcularDiasV(futura)
    expect(dias).toBeGreaterThan(0)
  })

  it('fecha pasada → negativo', () => {
    const pasada = new Date()
    pasada.setDate(pasada.getDate() - 10)
    const dias = calcularDiasV(pasada)
    expect(dias).toBeLessThan(0)
  })

  it('fecha hoy → 0', () => {
    const hoy = new Date()
    hoy.setHours(12, 0, 0, 0) // mediodía
    const dias = calcularDiasV(hoy)
    expect(dias).toBe(0)
  })
})
