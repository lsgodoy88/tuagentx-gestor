import { describe, it, expect, vi } from 'vitest'
import {
  fechaHoy,
  fmtFecha,
  fmtFechaCorta,
  fmtFechaLarga,
  inicioSemana,
  finSemana,
  inicioMes,
  finMes,
  labelNavegador,
  moverFecha,
} from '@/app/(app)/ingresos/_lib/fechas'

describe('ingresos/_lib/fechas', () => {

  describe('fechaHoy()', () => {
    it('retorna formato YYYY-MM-DD', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-21T15:00:00Z')) // 10am Bogotá
      expect(fechaHoy()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      vi.useRealTimers()
    })
  })

  describe('fmtFecha()', () => {
    it('formatea YYYY-MM-DD a dd/MM/yy', () => {
      expect(fmtFecha('2026-09-21')).toBe('21/09/26')
    })
    it('retorna --/--/-- para vacío', () => {
      expect(fmtFecha('')).toBe('--/--/--')
    })
  })

  describe('fmtFechaCorta()', () => {
    it('retorna dd/MM sin año', () => {
      expect(fmtFechaCorta('2026-09-21')).toBe('21/09')
    })
    it('retorna vacío para string vacío', () => {
      expect(fmtFechaCorta('')).toBe('')
    })
  })

  describe('fmtFechaLarga()', () => {
    it('retorna string no vacío para fecha válida', () => {
      expect(fmtFechaLarga('2026-09-21').length).toBeGreaterThan(0)
    })
    it('retorna vacío para string vacío', () => {
      expect(fmtFechaLarga('')).toBe('')
    })
  })

  describe('inicioSemana() / finSemana()', () => {
    it('lunes 2026-09-21 → semana inicia domingo 2026-09-20', () => {
      expect(inicioSemana('2026-09-21')).toBe('2026-09-20')
    })
    it('lunes 2026-09-21 → semana termina sábado 2026-09-26', () => {
      expect(finSemana('2026-09-21')).toBe('2026-09-26')
    })
    it('domingo de inicio es el mismo día', () => {
      expect(inicioSemana('2026-09-20')).toBe('2026-09-20')
    })
  })

  describe('inicioMes() / finMes()', () => {
    it('inicio de septiembre', () => {
      expect(inicioMes('2026-09-21')).toBe('2026-09-01')
    })
    it('fin de septiembre', () => {
      expect(finMes('2026-09-21')).toBe('2026-09-30')
    })
    it('fin de febrero año bisiesto', () => {
      expect(finMes('2028-02-15')).toBe('2028-02-29')
    })
    it('fin de diciembre cruza año', () => {
      expect(finMes('2026-12-10')).toBe('2026-12-31')
    })
  })

  describe('moverFecha()', () => {
    it('avanza 1 día', () => {
      expect(moverFecha('2026-09-21', 'Día', 1)).toBe('2026-09-22')
    })
    it('retrocede 1 día', () => {
      expect(moverFecha('2026-09-21', 'Día', -1)).toBe('2026-09-20')
    })
    it('avanza 1 semana', () => {
      expect(moverFecha('2026-09-21', 'Semana', 1)).toBe('2026-09-28')
    })
    it('avanza 1 mes', () => {
      expect(moverFecha('2026-09-21', 'Mes', 1)).toBe('2026-10-21')
    })
    it('retrocede 1 mes cruzando año', () => {
      expect(moverFecha('2026-01-15', 'Mes', -1)).toBe('2025-12-15')
    })
  })

  describe('labelNavegador()', () => {
    it('vista Día muestra fecha formateada', () => {
      expect(labelNavegador('Día', '2026-09-21')).toBe('21/09/26')
    })
    it('vista Semana muestra rango', () => {
      const label = labelNavegador('Semana', '2026-09-21')
      expect(label).toContain('–')
    })
    it('vista Mes muestra nombre del mes capitalizado', () => {
      const label = labelNavegador('Mes', '2026-09-21')
      expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase())
      expect(label).toContain('2026')
    })
  })

})
