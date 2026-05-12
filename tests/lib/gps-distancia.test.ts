import { describe, it, expect } from 'vitest'
import { distanciaMetros } from '@/lib/gps'

describe('lib/gps — distanciaMetros (fórmula Haversine)', () => {
  it('mismo punto → 0 metros', () => {
    expect(distanciaMetros(4.4389, -75.2322, 4.4389, -75.2322)).toBe(0)
  })

  it('Ibagué centro → ~100m al norte', () => {
    // 1° latitud ≈ 111km → 0.001° ≈ 111m
    const d = distanciaMetros(4.4389, -75.2322, 4.4399, -75.2322)
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(115)
  })

  it('Ibagué → Bogotá ≈ 120km (rango razonable)', () => {
    const d = distanciaMetros(4.4389, -75.2322, 4.7110, -74.0721)
    // Distancia real Ibagué-Bogotá ~128km en línea recta
    expect(d).toBeGreaterThan(120_000)
    expect(d).toBeLessThan(135_000)
  })

  it('orden de los puntos no importa (función simétrica)', () => {
    const a = distanciaMetros(4.4389, -75.2322, 4.7110, -74.0721)
    const b = distanciaMetros(4.7110, -74.0721, 4.4389, -75.2322)
    expect(a).toBeCloseTo(b, 5)
  })

  it('puntos antípodas → ~20.000 km (medio planeta)', () => {
    const d = distanciaMetros(0, 0, 0, 180)
    expect(d).toBeGreaterThan(19_500_000)
    expect(d).toBeLessThan(20_100_000)
  })

  it('distancia ecuatorial 1°longitud ≈ 111km', () => {
    const d = distanciaMetros(0, 0, 0, 1)
    expect(d).toBeGreaterThan(111_000)
    expect(d).toBeLessThan(111_500)
  })

  it('distancia polar 1°longitud → mucho menor (cos(80°))', () => {
    // En latitud 80°: 1° lon ≈ 19.4km
    const d = distanciaMetros(80, 0, 80, 1)
    expect(d).toBeGreaterThan(18_000)
    expect(d).toBeLessThan(20_000)
  })

  it('caso real: vendedor a 50m del cliente (umbral típico de "está en el lugar")', () => {
    // ~50m hacia el norte
    const d = distanciaMetros(4.4389, -75.2322, 4.43935, -75.2322)
    expect(d).toBeGreaterThan(45)
    expect(d).toBeLessThan(55)
  })
})
