import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { fetchApi, errorMsg } from '@/lib/fetchApi'

describe('lib/fetchApi — errorMsg', () => {
  it('null → "Sin respuesta del servidor"', () => {
    expect(errorMsg(null)).toBe('Sin respuesta del servidor')
  })

  it('undefined → "Sin respuesta del servidor"', () => {
    expect(errorMsg(undefined)).toBe('Sin respuesta del servidor')
  })

  it('string → lo devuelve tal cual', () => {
    expect(errorMsg('Error pelado')).toBe('Error pelado')
  })

  it('objeto con .error → usa .error', () => {
    expect(errorMsg({ error: 'No autorizado' })).toBe('No autorizado')
  })

  it('objeto con .message → usa .message', () => {
    expect(errorMsg({ message: 'Algo pasó' })).toBe('Algo pasó')
  })

  it('error tiene prioridad sobre message', () => {
    expect(errorMsg({ error: 'priority', message: 'fallback' })).toBe('priority')
  })

  it('objeto sin error/message → fallback default', () => {
    expect(errorMsg({})).toBe('Error inesperado')
  })

  it('objeto sin error/message → fallback custom', () => {
    expect(errorMsg({}, 'Pasó algo raro')).toBe('Pasó algo raro')
  })

  it('0 (falsy pero no nullish) cae al "Sin respuesta del servidor"', () => {
    // !data → '0' es falsy → cae en la primera rama
    expect(errorMsg(0)).toBe('Sin respuesta del servidor')
  })
})

describe('lib/fetchApi — fetchApi', () => {
  let originalFetch: any
  beforeEach(() => {
    originalFetch = global.fetch
    vi.useFakeTimers()
  })
  afterEach(() => {
    global.fetch = originalFetch
    vi.useRealTimers()
  })

  it('200 OK con JSON válido → retorna el objeto parseado', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ data: 'hello' }),
    }) as any)

    const r = await fetchApi('/api/test')
    expect(r).toEqual({ data: 'hello' })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('200 OK con body vacío → retorna {}', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => '',
    }) as any)

    const r = await fetchApi('/api/test')
    expect(r).toEqual({})
  })

  it('HTTP 500 → reintenta y eventualmente devuelve null', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false, status: 500,
      text: async () => 'Internal Server Error',
    }) as any)

    const promise = fetchApi('/api/test', {}, 2)
    // Avanzar timers para los waits entre reintentos (800ms * i)
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('HTTP 404 una vez + 200 segunda vez → retorna data del intento 2', async () => {
    let llamada = 0
    global.fetch = vi.fn(async () => {
      llamada++
      if (llamada === 1) return { ok: false, status: 404, text: async () => 'Not found' } as any
      return { ok: true, status: 200, text: async () => JSON.stringify({ recuperado: true }) } as any
    })

    const promise = fetchApi('/api/test', {}, 3)
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r).toEqual({ recuperado: true })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('fetch throws (red caída) → reintenta', async () => {
    let llamada = 0
    global.fetch = vi.fn(async () => {
      llamada++
      if (llamada < 3) throw new Error('ETIMEDOUT')
      return { ok: true, status: 200, text: async () => '{"finalmente":true}' } as any
    })

    const promise = fetchApi('/api/test', {}, 3)
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r).toEqual({ finalmente: true })
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('todos los reintentos fallan → retorna null (no throws)', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('boom')
    })

    const promise = fetchApi('/api/test', {}, 2)
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('pasa opciones a fetch (method, headers, body)', async () => {
    let capturedInit: any = null
    global.fetch = vi.fn(async (_url, init) => {
      capturedInit = init
      return { ok: true, status: 200, text: async () => '{}' } as any
    })

    await fetchApi('/api/test', {
      method: 'POST',
      headers: { 'X-Custom': 'yes' },
      body: JSON.stringify({ x: 1 }),
    })

    expect(capturedInit.method).toBe('POST')
    expect(capturedInit.headers).toEqual({ 'X-Custom': 'yes' })
    expect(JSON.parse(capturedInit.body)).toEqual({ x: 1 })
  })

  it('default reintentos = 2', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('boom')
    })

    const promise = fetchApi('/api/test')
    await vi.runAllTimersAsync()
    await promise

    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('respuesta con JSON malformado → reintenta (parsea falla)', async () => {
    let llamada = 0
    global.fetch = vi.fn(async () => {
      llamada++
      if (llamada === 1) return { ok: true, status: 200, text: async () => 'NO ES JSON' } as any
      return { ok: true, status: 200, text: async () => '{"recuperado":true}' } as any
    })

    const promise = fetchApi('/api/test', {}, 2)
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r).toEqual({ recuperado: true })
  })

  it('error text() también captura body de respuesta (no crashea si text rompe)', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false, status: 500,
      text: async () => { throw new Error('text crash') },
    }) as any)

    const promise = fetchApi('/api/test', {}, 1)
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
