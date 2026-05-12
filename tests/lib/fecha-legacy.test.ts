import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ahoraBogota,
  fechaBogotaStr,
  inicioDiaBogota,
  finDiaBogota,
  fechaBogotaDeVisita,
} from '@/lib/fecha'

describe('lib/fecha (legacy) — helpers usados en rutas/procesar-dia', () => {
  describe('ahoraBogota()', () => {
    it('resta 5h del UTC', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T14:00:00Z'))
      expect(ahoraBogota().getUTCHours()).toBe(9)
      vi.useRealTimers()
    })
  })

  describe('fechaBogotaStr(fecha?)', () => {
    it('sin argumento → fecha actual en Bogotá', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-13T02:00:00Z')) // 21:00 Bogotá del 12
      expect(fechaBogotaStr()).toBe('2026-05-12')
      vi.useRealTimers()
    })

    it('con Date', () => {
      const d = new Date('2026-03-15T10:00:00Z') // 05:00 Bogotá
      expect(fechaBogotaStr(d)).toBe('2026-03-15')
    })

    it('con string ISO', () => {
      expect(fechaBogotaStr('2026-03-15T10:00:00Z')).toBe('2026-03-15')
    })

    it('null → usa fecha actual', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T15:00:00Z'))
      expect(fechaBogotaStr(null)).toBe('2026-05-12')
      vi.useRealTimers()
    })
  })

  describe('inicioDiaBogota(fechaStr?)', () => {
    it('con fecha "2026-05-12" → Date a 00:00:00 UTC de ese día', () => {
      const d = inicioDiaBogota('2026-05-12')
      expect(d.toISOString()).toBe('2026-05-12T00:00:00.000Z')
    })

    it('sin argumento → inicio del día Bogotá actual', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T18:00:00Z'))
      expect(inicioDiaBogota().toISOString()).toBe('2026-05-12T00:00:00.000Z')
      vi.useRealTimers()
    })
  })

  describe('finDiaBogota(fechaStr?)', () => {
    it('con fecha "2026-05-12" → Date a 23:59:59.999 UTC de ese día', () => {
      const d = finDiaBogota('2026-05-12')
      expect(d.toISOString()).toBe('2026-05-12T23:59:59.999Z')
    })

    it('inicio + fin cubren todo el día', () => {
      const ini = inicioDiaBogota('2026-05-12').getTime()
      const fin = finDiaBogota('2026-05-12').getTime()
      const diff = fin - ini
      expect(diff).toBe(86_399_999) // un día menos 1ms
    })
  })

  describe('fechaBogotaDeVisita(v)', () => {
    it('si v.fechaBogota existe, usa ese (formato YYYY-MM-DD)', () => {
      const v = {
        fechaBogota: new Date('2026-05-10T15:00:00Z'),
        createdAt: new Date('2026-05-13T15:00:00Z'),
      }
      expect(fechaBogotaDeVisita(v)).toBe('2026-05-10')
    })

    it('si v.fechaBogota es null, deriva de createdAt restando 5h', () => {
      const v = {
        fechaBogota: null,
        createdAt: new Date('2026-05-13T02:00:00Z'), // 21:00 Bogotá del 12
      }
      expect(fechaBogotaDeVisita(v)).toBe('2026-05-12')
    })

    it('createdAt a las 10am UTC = 05am Bogotá mismo día', () => {
      const v = { createdAt: new Date('2026-05-13T10:00:00Z') }
      expect(fechaBogotaDeVisita(v)).toBe('2026-05-13')
    })
  })
})
