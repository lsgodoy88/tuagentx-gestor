/**
 * Helpers para generación de tokens de recibo.
 * Centralizado para evitar duplicación del cálculo de expiración.
 */
import { randomBytes } from 'crypto'

export const RECIBO_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutos

export function generarReciboToken(): { reciboToken: string, tokenExpira: Date } {
  return {
    reciboToken: randomBytes(24).toString('hex'),
    tokenExpira: new Date(Date.now() + RECIBO_TOKEN_TTL_MS),
  }
}

export function tokenExpiradoOrenovar(tokenExpira: Date | null): { reciboToken: string, tokenExpira: Date } | null {
  if (!tokenExpira || new Date() < tokenExpira) return null
  return generarReciboToken()
}
