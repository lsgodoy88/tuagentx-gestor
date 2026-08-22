import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  generarReciboToken,
  tokenExpiradoOrenovar,
  RECIBO_TOKEN_TTL_MS,
} from '@/lib/recibos'

describe('lib/recibos', () => {
  describe('RECIBO_TOKEN_TTL_MS', () => {
    it('exactamente 15 minutos', () => {
      expect(RECIBO_TOKEN_TTL_MS).toBe(15 * 60 * 1000)
      expect(RECIBO_TOKEN_TTL_MS).toBe(900_000)
    })
  })

  describe('generarReciboToken()', () => {
    it('token hex de 48 caracteres (24 bytes)', () => {
      const { reciboToken } = generarReciboToken()
      expect(reciboToken).toMatch(/^[a-f0-9]{48}$/)
    })

    it('tokens consecutivos son distintos (entropía suficiente)', () => {
      const a = generarReciboToken().reciboToken
      const b = generarReciboToken().reciboToken
      const c = generarReciboToken().reciboToken
      expect(a).not.toBe(b)
      expect(b).not.toBe(c)
      expect(a).not.toBe(c)
    })

    it('tokenExpira es exactamente 15min en el futuro', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T15:00:00Z'))
      const { tokenExpira } = generarReciboToken()
      expect(tokenExpira.toISOString()).toBe('2026-05-12T15:15:00.000Z')
      vi.useRealTimers()
    })
  })

  describe('tokenExpiradoOrenovar(tokenExpira)', () => {
    it('null → null (no había token, no hay nada que renovar)', () => {
      // La función renueva SOLO si existía un token previo Y ya venció.
      // Para "primera vez" el caller debe llamar generarReciboToken() directamente.
      expect(tokenExpiradoOrenovar(null)).toBeNull()
    })

    it('expiración futura → null (no renovar)', () => {
      const futura = new Date(Date.now() + 60_000) // 1min en futuro
      expect(tokenExpiradoOrenovar(futura)).toBeNull()
    })

    it('expiración pasada → genera token nuevo', () => {
      const pasada = new Date(Date.now() - 1000) // 1s en el pasado
      const r = tokenExpiradoOrenovar(pasada)
      expect(r).not.toBeNull()
      expect(r?.reciboToken).toMatch(/^[a-f0-9]{48}$/)
      // La nueva expiración debe ser ~15min en el futuro
      const diff = r!.tokenExpira.getTime() - Date.now()
      expect(diff).toBeGreaterThan(RECIBO_TOKEN_TTL_MS - 1000)
      expect(diff).toBeLessThanOrEqual(RECIBO_TOKEN_TTL_MS)
    })

    it('exactamente en el límite → renueva (>= no <)', () => {
      vi.useFakeTimers()
      const ahora = new Date('2026-05-12T15:00:00Z')
      vi.setSystemTime(ahora)
      // Token expira justo ahora — el código usa `new Date() < tokenExpira` → false → renueva
      const r = tokenExpiradoOrenovar(ahora)
      expect(r).not.toBeNull()
      vi.useRealTimers()
    })
  })
})
