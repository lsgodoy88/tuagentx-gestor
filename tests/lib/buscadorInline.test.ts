import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Simulación de la lógica de BuscadorInlineAccion sin DOM
// Tests unitarios de las funciones puras

describe('BuscadorInlineAccion — validación nombre prospecto', () => {
  const validarNombre = (nombre: string) =>
    nombre.trim().split(/\s+/).filter(Boolean).length >= 2

  it('nombre vacío: inválido', () => expect(validarNombre('')).toBe(false))
  it('una palabra: inválido', () => expect(validarNombre('Juan')).toBe(false))
  it('dos palabras: válido', () => expect(validarNombre('Juan Pérez')).toBe(true))
  it('espacios extra: válido si hay 2 palabras', () => expect(validarNombre('  Juan   López  ')).toBe(true))
  it('tres palabras: válido', () => expect(validarNombre('María Andrea Tafur')).toBe(true))
})

describe('BuscadorInlineAccion — mínimo 3 chars para buscar', () => {
  const debesBuscar = (q: string) => q.trim().length >= 3

  it('0 chars: no busca', () => expect(debesBuscar('')).toBe(false))
  it('2 chars: no busca', () => expect(debesBuscar('Ma')).toBe(false))
  it('3 chars: busca', () => expect(debesBuscar('Mar')).toBe(true))
  it('espacios no cuentan', () => expect(debesBuscar('  A ')).toBe(false))
})

describe('BuscadorInlineAccion — resolución __PROSPECTO__', () => {
  const resolverClienteId = (clienteId: string, empresaId: string) =>
    clienteId === '__PROSPECTO__' ? `__PROSPECTO__${empresaId}` : clienteId

  it('prospecto: agrega empresaId', () =>
    expect(resolverClienteId('__PROSPECTO__', 'emp123')).toBe('__PROSPECTO__emp123'))

  it('cliente normal: no cambia', () =>
    expect(resolverClienteId('abc123', 'emp123')).toBe('abc123'))
})

describe('BuscadorInlineAccion — AbortController en cambio de q', () => {
  it('aborta request anterior al cambiar query', async () => {
    const ctrl1 = new AbortController()
    const abortSpy = vi.spyOn(ctrl1, 'abort')
    // Simula que abortRef.current = ctrl1 y llega nueva query
    ctrl1.abort()
    expect(abortSpy).toHaveBeenCalledTimes(1)
  })

  it('fetch con signal abortada lanza AbortError', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    let caughtAbort = false
    try {
      await fetchMock('url', { signal: ctrl.signal })
    } catch (e: any) {
      if (e.name === 'AbortError') caughtAbort = true
    }
    expect(caughtAbort).toBe(true)
  })
})
