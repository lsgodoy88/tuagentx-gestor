import { describe, it, expect } from 'vitest'
import { fmt, formatCOP, parseCOP, parseNum } from '@/lib/shared/utils/formato'

describe('lib/shared/utils/formato', () => {

  describe('fmt()', () => {
    it('formatea positivo con símbolo $', () => {
      expect(fmt(1500000)).toBe('$1.500.000')
    })
    it('usa valor absoluto para negativos', () => {
      expect(fmt(-250000)).toBe('$250.000')
    })
    it('formatea cero', () => {
      expect(fmt(0)).toBe('$0')
    })
  })

  describe('formatCOP()', () => {
    it('formatea string numérico con puntos de miles', () => {
      expect(formatCOP('1500000')).toBe('1.500.000')
    })
    it('retorna vacío para string vacío', () => {
      expect(formatCOP('')).toBe('')
    })
    it('retorna vacío para cero', () => {
      expect(formatCOP('0')).toBe('')
    })
    it('limpia puntos existentes antes de formatear', () => {
      expect(formatCOP('1.500.000')).toBe('1.500.000')
    })
    it('ignora caracteres no numéricos', () => {
      expect(formatCOP('$1500abc')).toBe('1.500')
    })
  })

  describe('parseCOP()', () => {
    it('elimina puntos de miles', () => {
      expect(parseCOP('1.500.000')).toBe('1500000')
    })
    it('elimina caracteres no numéricos', () => {
      expect(parseCOP('$1.500.000')).toBe('1500000')
    })
    it('retorna vacío para string vacío', () => {
      expect(parseCOP('')).toBe('')
    })
  })

  describe('parseNum()', () => {
    it('parsea string con puntos de miles', () => {
      expect(parseNum('1.500.000')).toBe(1500000)
    })
    it('retorna 0 para string vacío', () => {
      expect(parseNum('')).toBe(0)
    })
    it('retorna 0 para NaN', () => {
      expect(parseNum('abc')).toBe(0)
    })
    it('soporta coma decimal', () => {
      expect(parseNum('1.500,50')).toBe(1500.5)
    })
  })

})
