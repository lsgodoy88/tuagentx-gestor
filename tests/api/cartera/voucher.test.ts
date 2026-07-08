import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('openai', () => {
  class OpenAIMock {
    chat = { completions: { create: mockCreate } }
  }
  return { default: OpenAIMock }
})
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/r2', () => ({ subirVoucher: vi.fn().mockResolvedValue('vouchers/test-key.jpg') }))
vi.mock('@/lib/pdfAJpg', () => ({ pdfPrimerarPaginaAJpg: vi.fn() }))

import { POST } from '@/app/api/cartera/voucher/route'
import { getServerSession } from 'next-auth'

const SESSION = { user: { id: 'emp-1', role: 'vendedor', empresaId: 'emp-1' } }
const FAKE_IMAGE = 'data:image/jpeg;base64,/9j/fake'

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/cartera/voucher', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('POST /api/cartera/voucher', () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(SESSION as any)
    mockCreate.mockReset()
  })

  it('retorna 401 sin sesion', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(makeReq({ archivoBase64: FAKE_IMAGE, mimeType: 'image/jpeg', pagoId: 'p1' }))
    expect(res.status).toBe(401)
  })

  it('retorna 400 si faltan campos', async () => {
    const res = await POST(makeReq({ archivoBase64: FAKE_IMAGE, mimeType: 'image/jpeg' }))
    expect(res.status).toBe(400)
  })

  it('detecta un solo pago', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '[{"valor":2000000,"fecha":"2026-07-02 13:00:00","banco":"Redeban","referencia":"202503"}]' } }] })
    const data = await (await POST(makeReq({ archivoBase64: FAKE_IMAGE, mimeType: 'image/jpeg', pagoId: 'p1' }))).json()
    expect(data.pagos).toHaveLength(1)
    expect(data.pagos[0].valor).toBe(2000000)
    expect(data.datosIA).toEqual(data.pagos[0])
    expect(data.key).toBe('vouchers/test-key.jpg')
  })

  it('detecta multiples pagos en una imagen', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '[{"valor":2000000,"fecha":"2026-07-02 13:00:00","banco":"Redeban","referencia":"202503"},{"valor":1753950,"fecha":"2026-07-02 13:00:25","banco":"Redeban","referencia":"202504"}]' } }] })
    const data = await (await POST(makeReq({ archivoBase64: FAKE_IMAGE, mimeType: 'image/jpeg', pagoId: 'p1' }))).json()
    expect(data.pagos).toHaveLength(2)
    expect(data.pagos[0].valor).toBe(2000000)
    expect(data.pagos[1].valor).toBe(1753950)
    expect(data.pagos[1].referencia).toBe('202504')
    expect(data.datosIA).toEqual(data.pagos[0])
  })

  it('limpia backticks del response IA', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '```json\n[{"valor":500000,"fecha":"2026-07-01 10:00:00","banco":"Nequi","referencia":"TXN123"}]\n```' } }] })
    const data = await (await POST(makeReq({ archivoBase64: FAKE_IMAGE, mimeType: 'image/jpeg', pagoId: 'p1' }))).json()
    expect(data.pagos).toHaveLength(1)
    expect(data.pagos[0].valor).toBe(500000)
  })

  it('fallback null si IA falla', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'respuesta invalida' } }] })
    const data = await (await POST(makeReq({ archivoBase64: FAKE_IMAGE, mimeType: 'image/jpeg', pagoId: 'p1' }))).json()
    expect(data.pagos).toHaveLength(1)
    expect(data.pagos[0].valor).toBeNull()
  })

  it('rechaza objeto simple — solo acepta array', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '{"valor":1000000,"fecha":"2026-07-01 00:00:00","banco":"PSE","referencia":"REF001"}' } }] })
    const data = await (await POST(makeReq({ archivoBase64: FAKE_IMAGE, mimeType: 'image/jpeg', pagoId: 'p1' }))).json()
    expect(data.pagos).toHaveLength(1)
    expect(data.pagos[0].valor).toBeNull()
  })
})
