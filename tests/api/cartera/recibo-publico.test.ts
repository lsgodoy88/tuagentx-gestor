import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/cartera/recibo-publico/route'

const p = prisma as any

const PAGO_SNAPSHOT = {
  id: 'pago-01', reciboToken: 'tok-abc', tokenExpira: null,
  metodopago: 'efectivo', numeroRecibo: 'REC001', monto: 100000, descuento: 0,
  clienteApiId: 'api-cli-01', saldoAnterior: null, valorFactura: null,
  reciboPago: {
    empresa: { nombre: 'Test SA', anchoPapel: '80mm', prefijo: 'REC', nit: null, telefono: null, direccion: null, logo: null },
    cliente: { nombre: 'Cliente Test' },
    detalles: [{ valorFactura: 100000 }],
    saldoAnterior: 130000, saldoNuevo: 30000,
  },
  Cartera: null,
  Empleado: { id: 'emp-01', nombre: 'Carlos', empresaId: 'emp-01' },
  Aplicaciones: [],
}

const PAGO_LIVE = {
  id: 'pago-02', reciboToken: 'tok-xyz', tokenExpira: null,
  metodopago: 'transferencia', numeroRecibo: 'REC002', monto: 50000, descuento: 0,
  clienteApiId: 'api-cli-01', saldoAnterior: 100000, valorFactura: 200000,
  reciboPago: null,
  Cartera: null,
  Empleado: { id: 'emp-01', nombre: 'Carlos', empresaId: 'emp-01' },
  Aplicaciones: [{ syncDeudaId: 'sd-01', numeroFactura: 1001, montoAplicado: 50000 }],
}

function makeReq(token?: string) {
  const url = token
    ? `http://localhost/api/cartera/recibo-publico?token=${token}`
    : 'http://localhost/api/cartera/recibo-publico'
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
  p.pagoCartera = { findFirst: vi.fn().mockResolvedValue(PAGO_SNAPSHOT) }
  p.empresa     = { findUnique: vi.fn().mockResolvedValue({ id: 'emp-01', nombre: 'Test SA' }) }
  p.cliente     = { findFirst: vi.fn().mockResolvedValue({ id: 'cli-01', nombre: 'Cliente Test' }) }
  p.syncDeuda   = { findMany: vi.fn().mockResolvedValue([{ id: 'sd-01', valor: 200000, saldo: 150000, clienteApiId: 'api-cli-01', data: {} }]), findUnique: vi.fn() }
})

describe('GET /api/cartera/recibo-publico — auth y validación', () => {
  it('sin token → 400', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/token requerido/i)
  })

  it('token inválido (no encontrado) → 404', async () => {
    p.pagoCartera.findFirst.mockResolvedValue(null)
    const res = await GET(makeReq('tok-invalido'))
    expect(res.status).toBe(404)
  })

  it('token expirado → 410 con pagoId', async () => {
    p.pagoCartera.findFirst.mockResolvedValue({
      ...PAGO_SNAPSHOT,
      tokenExpira: new Date(Date.now() - 1000), // expirado
    })
    const res = await GET(makeReq('tok-abc'))
    expect(res.status).toBe(410)
    const json = await res.json()
    expect(json.error).toBe('TOKEN_EXPIRADO')
    expect(json.pagoId).toBe('pago-01')
  })

  it('token vigente (expira en el futuro) → 200', async () => {
    p.pagoCartera.findFirst.mockResolvedValue({
      ...PAGO_SNAPSHOT,
      tokenExpira: new Date(Date.now() + 600000),
    })
    const res = await GET(makeReq('tok-abc'))
    expect(res.status).toBe(200)
  })

  it('tokenExpira null → nunca expira → 200', async () => {
    const res = await GET(makeReq('tok-abc'))
    expect(res.status).toBe(200)
  })
})

describe('GET /api/cartera/recibo-publico — snapshot (reciboPago)', () => {
  it('retorna modo snapshot con datos congelados', async () => {
    const res = await GET(makeReq('tok-abc'))
    const json = await res.json()
    expect(json.pago.cartera._modo).toBe('snapshot')
  })

  it('normaliza metodoPago y consecutivo', async () => {
    const res = await GET(makeReq('tok-abc'))
    const json = await res.json()
    expect(json.pago.metodoPago).toBe('efectivo')
    expect(json.pago.consecutivo).toBe('REC001')
  })

  it('configRecibos se construye con anchoPapel del snapshot', async () => {
    const res = await GET(makeReq('tok-abc'))
    const json = await res.json()
    expect(json.pago.cartera.empresa.configRecibos.anchoPapel).toBe('80mm')
  })

  it('saldoAnterior y saldoPendiente vienen del snapshot', async () => {
    const res = await GET(makeReq('tok-abc'))
    const json = await res.json()
    expect(json.pago.cartera.saldoAnterior).toBe(130000)
    expect(json.pago.cartera.saldoPendiente).toBe(30000)
  })

  it('valorFacturasPagadas = suma de detalles', async () => {
    const res = await GET(makeReq('tok-abc'))
    const json = await res.json()
    expect(json.pago.cartera.valorFacturasPagadas).toBe(100000)
  })
})

describe('GET /api/cartera/recibo-publico — fallback live (sin reciboPago)', () => {
  beforeEach(() => {
    p.pagoCartera.findFirst.mockResolvedValue(PAGO_LIVE)
  })

  it('retorna modo sync', async () => {
    const res = await GET(makeReq('tok-xyz'))
    const json = await res.json()
    expect(json.pago.cartera._modo).toBe('sync')
  })

  it('saldoAnterior congelado tiene prioridad', async () => {
    const res = await GET(makeReq('tok-xyz'))
    const json = await res.json()
    expect(json.pago.cartera.saldoAnterior).toBe(100000)
  })

  it('montoAplicado se mapea en detalleCartera', async () => {
    const res = await GET(makeReq('tok-xyz'))
    const json = await res.json()
    expect(json.pago.cartera.DetalleCartera[0].montoAplicado).toBe(50000)
    expect(json.pago.cartera.DetalleCartera[0].numeroFactura).toBe(1001)
  })

  it('sin aplicaciones → DetalleCartera vacío', async () => {
    p.pagoCartera.findFirst.mockResolvedValue({ ...PAGO_LIVE, Aplicaciones: [] })
    const res = await GET(makeReq('tok-xyz'))
    const json = await res.json()
    expect(json.pago.cartera.DetalleCartera).toHaveLength(0)
  })
})
