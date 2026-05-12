import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { calcularEstado, estadoMasCritico, colorEstado } from '@/lib/cartera'

// Fijamos "hoy" en 2026-05-12 (jueves) para cálculos determinísticos
const HOY = '2026-05-12T15:00:00Z'

function diasDesdeHoy(d: number): Date {
  // d > 0 = en el pasado (vencida hace d días), d < 0 = en el futuro
  const hoy = new Date(HOY); hoy.setHours(0, 0, 0, 0)
  return new Date(hoy.getTime() - d * 86400000)
}

describe('lib/cartera', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(HOY)) })
  afterEach(() => { vi.useRealTimers() })

  describe('calcularEstado — sin fechaVencimiento', () => {
    it('saldo 0 → pagada (color emerald)', () => {
      const r = calcularEstado(0, 100, 100, null)
      expect(r.estado).toBe('pagada')
      expect(r.color).toBe('emerald')
    })

    it('saldo negativo → pagada (sobrepago se trata como pagada)', () => {
      expect(calcularEstado(-10, 100, 110, null).estado).toBe('pagada')
    })

    it('saldo pendiente sin abonos ni fecha → pendiente (amarillo)', () => {
      const r = calcularEstado(100, 100, 0, null)
      expect(r.estado).toBe('pendiente')
      expect(r.color).toBe('yellow')
    })

    it('saldo pendiente con abonos sin fecha → abonada (azul)', () => {
      const r = calcularEstado(50, 100, 50, null)
      expect(r.estado).toBe('abonada')
      expect(r.color).toBe('blue')
    })
  })

  describe('calcularEstado — vencidas (fecha pasada)', () => {
    it('1 día vencida → vencida (naranja)', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(1))
      expect(r.estado).toBe('vencida')
      expect(r.label).toContain('1d')
    })

    it('30 días → todavía vencida (límite exacto, no entra a mora)', () => {
      // El código: `if (dias > 30) mora; if (dias > 0) vencida`
      // dias=30 NO es > 30 → cae a vencida
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(30))
      expect(r.estado).toBe('vencida')
    })

    it('31 días → mora (rose)', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(31))
      expect(r.estado).toBe('mora')
      expect(r.color).toBe('rose')
    })

    it('90 días → todavía mora (límite)', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(90))
      expect(r.estado).toBe('mora')
    })

    it('91 días → crítica (rojo)', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(91))
      expect(r.estado).toBe('critica')
      expect(r.color).toBe('red')
    })

    it('365 días → crítica (sin overflow)', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(365))
      expect(r.estado).toBe('critica')
      expect(r.label).toContain('365d')
    })
  })

  describe('calcularEstado — por vencer (fecha futura)', () => {
    it('hoy mismo (dias=0, no vencida aún) → próxima', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(0))
      expect(r.estado).toBe('proxima')
    })

    it('vence en 7 días → próxima (ámbar)', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(-7))
      expect(r.estado).toBe('proxima')
      expect(r.color).toBe('amber')
      expect(r.label).toContain('7d')
    })

    it('vence en 8 días → pendiente (amarillo)', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(-8))
      expect(r.estado).toBe('pendiente')
    })

    it('vence en 30 días → pendiente (límite)', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(-29))
      expect(r.estado).toBe('pendiente')
    })

    it('vence en 31+ días → vigente (azul)', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(-30))
      expect(r.estado).toBe('vigente')
      expect(r.color).toBe('blue')
    })

    it('vence en 365 días → vigente', () => {
      const r = calcularEstado(100, 100, 0, diasDesdeHoy(-365))
      expect(r.estado).toBe('vigente')
    })
  })

  describe('calcularEstado — pagada gana sobre todo', () => {
    it('saldo 0 con fecha 200 días vencida → sigue pagada (no crítica)', () => {
      expect(calcularEstado(0, 100, 100, diasDesdeHoy(200)).estado).toBe('pagada')
    })
  })

  describe('estadoMasCritico — devuelve el peor de un set', () => {
    it('set con vigente + crítica → crítica', () => {
      const r = estadoMasCritico([
        { valor: 100, valorFactura: 100, abonos: 0, fechaVencimiento: diasDesdeHoy(-100) }, // vigente
        { valor: 100, valorFactura: 100, abonos: 0, fechaVencimiento: diasDesdeHoy(100) },  // crítica
        { valor: 100, valorFactura: 100, abonos: 50, fechaVencimiento: null },              // abonada
      ])
      expect(r).toBe('critica')
    })

    it('todas pagadas → pagada', () => {
      const r = estadoMasCritico([
        { estado: 'pagada', valor: 100, valorFactura: 100, abonos: 100 },
        { estado: 'pagada', valor: 50,  valorFactura: 50,  abonos: 50  },
      ])
      expect(r).toBe('pagada')
    })

    it('ignora las pagadas y mira el resto', () => {
      const r = estadoMasCritico([
        { estado: 'pagada', valor: 100, valorFactura: 100, abonos: 100 },
        { valor: 100, valorFactura: 100, abonos: 0, fechaVencimiento: diasDesdeHoy(35) }, // mora
      ])
      expect(r).toBe('mora')
    })

    it('set vacío → pagada (default)', () => {
      expect(estadoMasCritico([])).toBe('pagada')
    })

    it('usa valorFactura - abonos para calcular saldo', () => {
      const r = estadoMasCritico([
        { valor: 999, valorFactura: 100, abonos: 100, fechaVencimiento: diasDesdeHoy(50) },
      ])
      // saldo = max(0, 100-100) = 0 → pagada
      expect(r).toBe('pagada')
    })
  })

  describe('colorEstado', () => {
    it.each([
      ['pagada',   'emerald'],
      ['vigente',  'blue'],
      ['abonada',  'blue'],
      ['pendiente','yellow'],
      ['proxima',  'amber'],
      ['vencida',  'orange'],
      ['mora',     'rose'],
      ['critica',  'red'],
      ['inexistente', 'zinc'],
    ])('%s → %s', (estado, color) => {
      expect(colorEstado(estado)).toBe(color)
    })
  })
})
