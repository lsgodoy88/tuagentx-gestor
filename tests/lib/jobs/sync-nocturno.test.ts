import { describe, it, expect } from 'vitest'
import { derivarEnvioEstado, encontrarSubsetExacto } from '@/lib/jobs/sync-nocturno'

// ── derivarEnvioEstado ────────────────────────────────────────────────────────
describe('derivarEnvioEstado', () => {
  it('lista vacía → pendiente', () => {
    expect(derivarEnvioEstado([])).toBe('pendiente')
  })

  it('todas recibido → recibido', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'recibido' }, { envioEstado: 'recibido' },
    ])).toBe('recibido')
  })

  it('todas cierreUptres → cierreUptres', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'cierreUptres' }, { envioEstado: 'cierreUptres' },
    ])).toBe('cierreUptres')
  })

  it('mezcla recibido + cierreUptres → cierreUptres (tiene alguno)', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'recibido' }, { envioEstado: 'cierreUptres' },
    ])).toBe('cierreUptres')
  })

  it('todas enviado → enviado', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'enviado' }, { envioEstado: 'enviado' },
    ])).toBe('enviado')
  })

  it('mezcla enviado + recibido → enviado (sin pendientes)', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'enviado' }, { envioEstado: 'recibido' },
    ])).toBe('enviado')
  })

  it('al menos un pendiente → pendiente', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'enviado' }, { envioEstado: 'pendiente' },
    ])).toBe('pendiente')
  })

  it('mezcla enviado + recibido + pendiente → pendiente', () => {
    expect(derivarEnvioEstado([
      { envioEstado: 'enviado' }, { envioEstado: 'recibido' }, { envioEstado: 'pendiente' },
    ])).toBe('pendiente')
  })

  it('una sola aplicación pendiente → pendiente', () => {
    expect(derivarEnvioEstado([{ envioEstado: 'pendiente' }])).toBe('pendiente')
  })

  it('una sola aplicación enviado → enviado', () => {
    expect(derivarEnvioEstado([{ envioEstado: 'enviado' }])).toBe('enviado')
  })
})

// ── encontrarSubsetExacto ─────────────────────────────────────────────────────
function ap(id: string, monto: number) { return { id, montoAplicado: monto } }

describe('encontrarSubsetExacto', () => {
  it('lista vacía → null', () => {
    expect(encontrarSubsetExacto([], 100)).toBeNull()
  })

  it('target 0 → null', () => {
    expect(encontrarSubsetExacto([ap('a1', 100)], 0)).toBeNull()
  })

  it('target negativo → null', () => {
    expect(encontrarSubsetExacto([ap('a1', 100)], -50)).toBeNull()
  })

  it('más de 20 aplicaciones → null (guard)', () => {
    const apps = Array.from({ length: 21 }, (_, i) => ap(`a${i}`, 100))
    expect(encontrarSubsetExacto(apps, 100)).toBeNull()
  })

  it('match exacto en un elemento', () => {
    const r = encontrarSubsetExacto([ap('a1', 100), ap('a2', 200)], 100)
    expect(r).toHaveLength(1)
    expect(r![0].id).toBe('a1')
  })

  it('match exacto en dos elementos', () => {
    const r = encontrarSubsetExacto([ap('a1', 100), ap('a2', 50), ap('a3', 200)], 150)
    expect(r).toHaveLength(2)
    const ids = r!.map(x => x.id).sort()
    expect(ids).toEqual(['a1', 'a2'])
  })

  it('sin match → null', () => {
    expect(encontrarSubsetExacto([ap('a1', 100), ap('a2', 200)], 99)).toBeNull()
  })

  it('tolerancia 1 peso → acepta diferencia < 1', () => {
    // 100.5 + 50.4 = 150.9 ≈ 151 (diff < 1)
    const r = encontrarSubsetExacto([ap('a1', 100.5), ap('a2', 50.4)], 151)
    expect(r).not.toBeNull()
  })

  it('múltiples subsets posibles → retorna el de MENOS elementos', () => {
    // [100] y [50+50] ambos suman 100 — debe retornar [100] (1 elemento)
    const r = encontrarSubsetExacto([ap('a1', 100), ap('a2', 50), ap('a3', 50)], 100)
    expect(r).toHaveLength(1)
    expect(r![0].id).toBe('a1')
  })

  it('20 aplicaciones exacto — procesa sin explotar', () => {
    const apps = Array.from({ length: 20 }, (_, i) => ap(`a${i}`, i + 1))
    // suma 1+2+...+20 = 210; target = 20 → match exacto en a19 (valor 20)
    const r = encontrarSubsetExacto(apps, 20)
    expect(r).not.toBeNull()
    expect(r).toHaveLength(1)
  })
})
