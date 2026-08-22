import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const redisMock = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue(null),
  setex: vi.fn().mockResolvedValue('OK'),
}))
vi.mock('ioredis', () => ({
  default: vi.fn(function () { return redisMock }),
}))

import { getServerSession } from 'next-auth'
import { GET, POST } from '@/app/api/rutas/optimizar/route'

const SESSION = { user: { id: 'usr-1', role: 'vendedor', empresaId: 'emp-1' } }

function makePostReq(body: any) {
  return new NextRequest('http://localhost/api/rutas/optimizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const CLIENTES_GPS = [
  { id: 'c1', nombre: 'Cliente A', lat: 4.6, lng: -74.1 },
  { id: 'c2', nombre: 'Cliente B', lat: 4.7, lng: -74.2 },
  { id: 'c3', nombre: 'Cliente C', lat: 4.8, lng: -74.3 },
]

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(SESSION as any)
  vi.stubGlobal('fetch', vi.fn())
  process.env.ANTHROPIC_API_KEY = 'test-key'
})
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/rutas/optimizar', () => {
  it('sin sesión → retorna null', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await GET()
    const json = await res.json()
    expect(json).toBeNull()
  })

  it('sin datos en Redis → retorna null', async () => {
    const res = await GET()
    const json = await res.json()
    expect(json).toBeNull()
  })
})

describe('POST /api/rutas/optimizar — validación', () => {
  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await POST(makePostReq({ clientes: CLIENTES_GPS }))
    expect(res.status).toBe(401)
  })

  it('sin clientes → 400', async () => {
    const res = await POST(makePostReq({ clientes: [] }))
    expect(res.status).toBe(400)
  })

  it('menos de 2 clientes con GPS → 400', async () => {
    const res = await POST(makePostReq({
      clientes: [{ id: 'c1', nombre: 'A', lat: 4.6, lng: -74.1 }],
    }))
    expect(res.status).toBe(400)
  })

  it('clientes sin GPS son ignorados para el conteo mínimo', async () => {
    // 2 con GPS, 1 sin GPS → pasa validación
    ;(fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ content: [{ text: '[1,2]' }] }),
    })
    const res = await POST(makePostReq({
      clientes: [
        { id: 'c1', nombre: 'A', lat: 4.6, lng: -74.1 },
        { id: 'c2', nombre: 'B', lat: 4.7, lng: -74.2 },
        { id: 'c3', nombre: 'C' }, // sin GPS
      ],
    }))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/rutas/optimizar — lógica IA', () => {
  it('IA retorna orden → clientes ordenados correctamente', async () => {
    ;(fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ content: [{ text: '[3,1,2]' }] }),
    })
    const res = await POST(makePostReq({ clientes: CLIENTES_GPS, latInicio: 4.5, lngInicio: -74.0 }))
    const json = await res.json()
    expect(res.status).toBe(200)
    // Orden [3,1,2] → c3, c1, c2
    expect(json.orden[0].id).toBe('c3')
    expect(json.orden[1].id).toBe('c1')
    expect(json.orden[2].id).toBe('c2')
  })

  it('IA retorna con backticks → limpia y parsea', async () => {
    ;(fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ content: [{ text: '```json\n[1,2,3]\n```' }] }),
    })
    const res = await POST(makePostReq({ clientes: CLIENTES_GPS }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.orden).toHaveLength(3)
  })

  it('clientes sin GPS se agregan al final del resultado', async () => {
    ;(fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ content: [{ text: '[1,2]' }] }),
    })
    const res = await POST(makePostReq({
      clientes: [
        { id: 'c1', nombre: 'A', lat: 4.6, lng: -74.1 },
        { id: 'c2', nombre: 'B', lat: 4.7, lng: -74.2 },
        { id: 'c3', nombre: 'C' }, // sin GPS
      ],
    }))
    const json = await res.json()
    expect(json.orden[json.orden.length - 1].id).toBe('c3')
  })

  it('IA responde sin array → 500', async () => {
    ;(fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ content: [{ text: 'No puedo optimizar' }] }),
    })
    const res = await POST(makePostReq({ clientes: CLIENTES_GPS }))
    expect(res.status).toBe(500)
  })

  it('fetch falla → error propagado', async () => {
    ;(fetch as any).mockRejectedValue(new Error('timeout'))
    await expect(POST(makePostReq({ clientes: CLIENTES_GPS }))).rejects.toThrow('timeout')
  })

  it('usa modelo claude-haiku en la llamada a Anthropic', async () => {
    ;(fetch as any).mockResolvedValue({
      json: () => Promise.resolve({ content: [{ text: '[1,2,3]' }] }),
    })
    await POST(makePostReq({ clientes: CLIENTES_GPS }))
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.model).toBe('claude-haiku-4-5-20251001')
    expect(body.max_tokens).toBe(200)
  })
})
