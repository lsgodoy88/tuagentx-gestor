import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  nowBogota,
  fechaHoyBogota,
  fechaBogotaStr,
  fmtFechaCorta,
  rangoMesBogota,
} from '@/lib/fechas'

describe('lib/fechas — helpers timezone Bogotá (UTC-5)', () => {
  describe('nowBogota()', () => {
    it('resta 5 horas del UTC actual', () => {
      vi.useFakeTimers()
      // 12-may-2026 14:00:00 UTC → 09:00 Bogotá
      vi.setSystemTime(new Date('2026-05-12T14:00:00Z'))
      const bog = nowBogota()
      expect(bog.getUTCHours()).toBe(9)
      expect(bog.getUTCDate()).toBe(12)
      vi.useRealTimers()
    })

    it('cruza el día cuando UTC apenas pasó medianoche', () => {
      vi.useFakeTimers()
      // 13-may 04:00 UTC → 12-may 23:00 Bogotá
      vi.setSystemTime(new Date('2026-05-13T04:00:00Z'))
      const bog = nowBogota()
      expect(bog.getUTCDate()).toBe(12)
      expect(bog.getUTCHours()).toBe(23)
      vi.useRealTimers()
    })
  })

  describe('fechaHoyBogota()', () => {
    it('devuelve la fecha de Bogotá aunque UTC ya cambió de día', () => {
      vi.useFakeTimers()
      // 13-may 02:00 UTC = 12-may 21:00 Bogotá → debe ser "2026-05-12"
      vi.setSystemTime(new Date('2026-05-13T02:00:00Z'))
      expect(fechaHoyBogota()).toBe('2026-05-12')
      vi.useRealTimers()
    })

    it('formato YYYY-MM-DD', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T15:00:00Z'))
      expect(fechaHoyBogota()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      vi.useRealTimers()
    })
  })

  describe('fechaBogotaStr(d)', () => {
    it('convierte un Date arbitrario a YYYY-MM-DD Bogotá', () => {
      // 10:00 UTC → 05:00 Bogotá → "2026-03-15"
      const d = new Date('2026-03-15T10:00:00Z')
      expect(fechaBogotaStr(d)).toBe('2026-03-15')
    })

    it('respeta el cambio de día cuando UTC ya pasó medianoche', () => {
      // 03:00 UTC = 22:00 día anterior en Bogotá
      const d = new Date('2026-03-16T03:00:00Z')
      expect(fechaBogotaStr(d)).toBe('2026-03-15')
    })
  })

  describe('fmtFechaCorta(d)', () => {
    it('formatea dd/MM/yy en Bogotá', () => {
      const d = new Date('2026-05-12T14:00:00Z') // 09:00 Bogotá
      expect(fmtFechaCorta(d)).toBe('12/05/26')
    })

    it('acepta string ISO', () => {
      expect(fmtFechaCorta('2026-01-05T15:00:00Z')).toBe('05/01/26')
    })

    it('día anterior si UTC ya pasó medianoche', () => {
      // 02:00 UTC del 13 = 21:00 del 12 en Bogotá
      const d = new Date('2026-05-13T02:00:00Z')
      expect(fmtFechaCorta(d)).toBe('12/05/26')
    })

    it('padding correcto (un dígito)', () => {
      const d = new Date('2026-01-05T14:00:00Z') // 09:00 Bogotá del 5
      expect(fmtFechaCorta(d)).toBe('05/01/26')
    })
  })

  describe('rangoMesBogota(mes)', () => {
    it('mayo 2026: desde=2026-05-01T05:00Z, hasta=2026-06-01T05:00Z', () => {
      const { desde, hasta } = rangoMesBogota('2026-05')
      expect(desde.toISOString()).toBe('2026-05-01T05:00:00.000Z')
      expect(hasta.toISOString()).toBe('2026-06-01T05:00:00.000Z')
    })

    it('diciembre → cruce de año', () => {
      const { desde, hasta } = rangoMesBogota('2026-12')
      expect(desde.toISOString()).toBe('2026-12-01T05:00:00.000Z')
      expect(hasta.toISOString()).toBe('2027-01-01T05:00:00.000Z')
    })

    it('rango cubre exactamente un mes calendario Bogotá', () => {
      const { desde, hasta } = rangoMesBogota('2026-02') // febrero
      const days = (hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24)
      expect(days).toBe(28) // 2026 no es bisiesto
    })
  })
})
