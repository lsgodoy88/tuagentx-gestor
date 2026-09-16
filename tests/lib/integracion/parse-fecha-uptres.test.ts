/**
 * Tests de parseFechaUptresBogota
 *
 * Reglas protegidas:
 * 1. UpTres entrega hora Bogotá con sufijo "Z" engañoso — NO es UTC real
 * 2. La función suma 5h para obtener el instante UTC correcto
 * 3. Nunca restar 5h — ya viene como hora local Bogotá
 * 4. Soporta formato con "T" y con espacio
 * 5. null/undefined/vacío → null
 * 6. String inválido → null
 */

import { describe, it, expect } from 'vitest'
import { parseFechaUptresBogota } from '@/lib/integracion/adapters/uptres'

describe('parseFechaUptresBogota', () => {

  // ─── Invariante principal ─────────────────────────────────────────────────

  it('hora Bogotá 10:00am → UTC 15:00 (suma 5h)', () => {
    // UpTres entrega "2026-09-15T10:00:33.000Z" pero ese valor ES hora Bogotá
    // El instante UTC real es 10:00 + 5h = 15:00 UTC
    const result = parseFechaUptresBogota('2026-09-15T10:00:33.000Z')
    expect(result).not.toBeNull()
    expect(result!.toISOString()).toBe('2026-09-15T15:00:33.000Z')
  })

  it('hora Bogotá 08:12am → UTC 13:12', () => {
    const result = parseFechaUptresBogota('2026-09-12T08:12:51.000Z')
    expect(result!.toISOString()).toBe('2026-09-12T13:12:51.000Z')
  })

  it('hora Bogotá 19:04pm → UTC siguiente día 00:04', () => {
    // 19:04 Bogotá + 5h = 00:04 UTC del día siguiente
    const result = parseFechaUptresBogota('2026-09-15T19:04:16.000Z')
    expect(result!.toISOString()).toBe('2026-09-16T00:04:16.000Z')
  })

  it('NO resta 5h — eso daría hora incorrecta', () => {
    const result = parseFechaUptresBogota('2026-09-15T10:00:33.000Z')
    // Si restáramos 5h incorrectamente, obtendríamos 05:00 UTC
    expect(result!.toISOString()).not.toBe('2026-09-15T05:00:33.000Z')
    // El correcto es +5h = 15:00 UTC
    expect(result!.toISOString()).toBe('2026-09-15T15:00:33.000Z')
  })

  // ─── Formatos de entrada ──────────────────────────────────────────────────

  it('formato con T y sufijo Z → OK', () => {
    const result = parseFechaUptresBogota('2026-09-15T10:31:28.000Z')
    expect(result).not.toBeNull()
    expect(result!.toISOString()).toBe('2026-09-15T15:31:28.000Z')
  })

  it('formato con espacio en vez de T → OK', () => {
    // UpTres a veces entrega "2026-06-19 16:11:18"
    const result = parseFechaUptresBogota('2026-06-19 16:11:18')
    expect(result).not.toBeNull()
    expect(result!.toISOString()).toBe('2026-06-19T21:11:18.000Z')
  })

  it('ignora milisegundos en el sufijo — solo usa hasta segundos', () => {
    const r1 = parseFechaUptresBogota('2026-09-15T10:00:33.000Z')
    const r2 = parseFechaUptresBogota('2026-09-15T10:00:33.999Z')
    // Ambos deben dar el mismo resultado — milisegundos ignorados
    expect(r1!.toISOString()).toBe(r2!.toISOString())
  })

  it('formato con offset +00:00 → ignora el offset, trata como Bogotá', () => {
    const result = parseFechaUptresBogota('2026-09-15T10:00:33+00:00')
    expect(result!.toISOString()).toBe('2026-09-15T15:00:33.000Z')
  })

  // ─── Casos edge ───────────────────────────────────────────────────────────

  it('null → null', () => {
    expect(parseFechaUptresBogota(null)).toBeNull()
  })

  it('undefined → null', () => {
    expect(parseFechaUptresBogota(undefined)).toBeNull()
  })

  it('string vacío → null', () => {
    expect(parseFechaUptresBogota('')).toBeNull()
  })

  it('string inválido → null', () => {
    expect(parseFechaUptresBogota('no-es-fecha')).toBeNull()
    expect(parseFechaUptresBogota('2000-01-01')).toBeNull() // sin hora
    expect(parseFechaUptresBogota('2000-01-01')).toBeNull()
  })

  it('invoicedAt "2000-01-01" (sin facturar en UpTres) → parsea pero se filtra externamente', () => {
    // UpTres usa "2000-01-01" como sentinel de "sin facturar"
    // La función parsea correctamente — el filtro isInvoiced===true lo maneja sync-delta
    const result = parseFechaUptresBogota('2000-01-01T00:00:00.000Z')
    expect(result).not.toBeNull() // parsea OK
    expect(result!.getFullYear()).toBe(2000)
  })

  // ─── Medianoche Bogotá ────────────────────────────────────────────────────

  it('medianoche Bogotá 00:00 → UTC 05:00 mismo día', () => {
    const result = parseFechaUptresBogota('2026-09-15T00:00:00.000Z')
    expect(result!.toISOString()).toBe('2026-09-15T05:00:00.000Z')
  })

  it('23:59 Bogotá → UTC 04:59 día siguiente', () => {
    const result = parseFechaUptresBogota('2026-09-15T23:59:00.000Z')
    expect(result!.toISOString()).toBe('2026-09-16T04:59:00.000Z')
  })

  // ─── Consistencia con invariante DOMINIOS v41 ─────────────────────────────

  it('invariante v41: invoicedAt "2026-09-15T10:00:33.000Z" = 10:00am Bogotá (no 5:00am)', () => {
    const result = parseFechaUptresBogota('2026-09-15T10:00:33.000Z')
    // En hora Bogotá (UTC-5), el instante UTC 15:00 = 10:00am local ✅
    const horaBogota = result!.getUTCHours() - 5
    expect(horaBogota).toBe(10)
  })
})
