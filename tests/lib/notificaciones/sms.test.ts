import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enviarSMS, consultarEstadoSMS, construirMensaje } from '@/lib/notificaciones/sms'

// ── construirMensaje — pura, sin mock ────────────────────────────────────────
describe('construirMensaje', () => {
  const PLANTILLA = 'Hola {nombre}, factura {factura} por {valor}, vence {vencimiento}.'
  const FIRMA = 'TuEmpresa'

  it('reemplaza todas las variables', () => {
    const msg = construirMensaje(PLANTILLA, FIRMA, {
      nombre: 'Juan', factura: '1001', valor: '$100.000', vencimiento: '30/09/26',
    })
    expect(msg).toContain('Juan')
    expect(msg).toContain('1001')
    expect(msg).toContain('$100.000')
    expect(msg).toContain('30/09/26')
  })

  it('trunca nombre a 25 caracteres', () => {
    const nombre = 'Nombre Muy Largo que Supera El Limite'
    const msg = construirMensaje(PLANTILLA, FIRMA, {
      nombre, factura: '1', valor: '1', vencimiento: '1',
    })
    expect(msg).toContain(nombre.slice(0, 25).trim())
    expect(msg).not.toContain(nombre.slice(26))
  })

  it('trunca mensaje completo a 140 caracteres', () => {
    const plantillaLarga = 'A'.repeat(200) + '{nombre}{factura}{valor}{vencimiento}'
    const msg = construirMensaje(plantillaLarga, FIRMA, {
      nombre: 'X', factura: 'Y', valor: 'Z', vencimiento: 'W',
    })
    expect(msg.length).toBeLessThanOrEqual(140)
  })
})

// ── enviarSMS — mock fetch ───────────────────────────────────────────────────
describe('enviarSMS', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('número inválido → ok false sin llamar fetch', async () => {
    const r = await enviarSMS('12345', 'test')
    expect(r.ok).toBe(false)
    expect(r.errorCodigo).toBe(1007)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('número vacío → ok false', async () => {
    const r = await enviarSMS('', 'test')
    expect(r.ok).toBe(false)
  })

  it('número colombiano 10 dígitos → normaliza a 57XXXXXXXXXX', async () => {
    const fetchMock = fetch as any
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ status: 0, data: { id: '9999' } }),
    })
    const r = await enviarSMS('3001234567', 'hola')
    expect(r.ok).toBe(true)
    expect(r.msgId).toBe('9999')
    const body = fetchMock.mock.calls[0][1].body as string
    expect(body).toContain('573001234567')
  })

  it('número ya con 57 prefix → lo usa directo', async () => {
    const fetchMock = fetch as any
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ status: 0, data: { id: '8888' } }),
    })
    await enviarSMS('573001234567', 'hola')
    const body = fetchMock.mock.calls[0][1].body as string
    expect(body).toContain('573001234567')
  })

  it('respuesta Onurix con error → ok false con errorCodigo', async () => {
    const fetchMock = fetch as any
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ status: 1, error: 1003, msg: 'Saldo insuficiente' }),
    })
    const r = await enviarSMS('3001234567', 'hola')
    expect(r.ok).toBe(false)
    expect(r.errorCodigo).toBe(1003)
    expect(r.errorMsg).toBe('Saldo insuficiente')
  })

  it('fetch lanza excepción → ok false con errorMsg', async () => {
    const fetchMock = fetch as any
    fetchMock.mockRejectedValue(new Error('timeout'))
    const r = await enviarSMS('3001234567', 'hola')
    expect(r.ok).toBe(false)
    expect(r.errorMsg).toBe('timeout')
  })
})

// ── consultarEstadoSMS ───────────────────────────────────────────────────────
describe('consultarEstadoSMS', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('state delivered → entregado', async () => {
    (fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ data: { state: 'Delivered' } }),
    })
    expect(await consultarEstadoSMS('123')).toBe('entregado')
  })

  it('state failed → fallido', async () => {
    (fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ data: { state: 'Failed' } }),
    })
    expect(await consultarEstadoSMS('123')).toBe('fallido')
  })

  it('state undelivered → fallido', async () => {
    (fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ data: { state: 'Undelivered' } }),
    })
    expect(await consultarEstadoSMS('123')).toBe('fallido')
  })

  it('state pendiente → pendiente', async () => {
    (fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ data: { state: 'queued' } }),
    })
    expect(await consultarEstadoSMS('123')).toBe('pendiente')
  })

  it('fetch lanza excepción → pendiente (no propaga error)', async () => {
    (fetch as any).mockRejectedValue(new Error('network'))
    expect(await consultarEstadoSMS('123')).toBe('pendiente')
  })
})
