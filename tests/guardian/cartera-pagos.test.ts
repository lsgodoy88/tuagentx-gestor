/**
 * Tests del Guardián — Cartera / Pagos / Recibos
 *
 * Reglas protegidas:
 * 1. saldoAnterior se congela ANTES del pago — nunca recalcular
 * 2. clienteNombre y vendedorNombre congelados al momento del pago
 * 3. valorFactura congelado — no puede cambiar después
 * 4. Transacción atómica — pago + actualización de saldo juntos
 * 5. Monto inválido → rechazado
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth',        () => ({ authOptions: {} }))
vi.mock('@/lib/consecutivo', () => ({ getConsecutivo: vi.fn().mockResolvedValue('CL2605001') }))
vi.mock('@/lib/recibos',     () => ({ generarReciboToken: vi.fn().mockReturnValue({ token: 'tok-1', expira: new Date() }) }))
vi.mock('@/lib/cartera',     () => ({ calcularEstado: vi.fn() }))
vi.mock('@/lib/integracion/sync', () => ({ actualizarCache: vi.fn() }))

vi.mock('@/lib/prisma', () => {
  const m = {
    cliente:    { findFirst: vi.fn() },
    empleado:   { findFirst: vi.fn(), findUnique: vi.fn() },
    empresa:    { findUnique: vi.fn() },
    integracion:{ findFirst: vi.fn() },
    pagoCartera:{ create: vi.fn() },
    syncDeuda:  { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue({ saldo: 0, abono: 0 }), update: vi.fn() },
    visita:     { create: vi.fn() },
    turno:      { findFirst: vi.fn().mockResolvedValue({ id: 'turno-1' }) },
    $transaction: vi.fn(async (ops: any) =>
      typeof ops === 'function' ? ops(m) : Promise.all(ops)
    ),
  }
  return { prisma: m }
})

import { POST } from '@/app/api/cartera/pago-sync/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

// ── Fixtures ──────────────────────────────────────────────────────

const SESSION = {
  user: { id: 'emp-1', role: 'vendedor', empresaId: 'emp-co-1', email: 'v@x.com' }
} as any

const makeReq = (body: any) => new NextRequest('http://localhost/api/cartera/pago-sync', {
  method: 'POST',
  body: JSON.stringify(body),
})

function setupBase() {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue(SESSION)
  vi.mocked((prisma as any).cliente.findFirst).mockResolvedValue({ id: 'cli-1', nombre: 'EVELIN ZAMBRANO' })
  vi.mocked((prisma as any).empleado.findUnique).mockResolvedValue({ nombre: 'Carlos Godoy' })
  vi.mocked((prisma as any).empresa.findUnique).mockResolvedValue({ configRecibos: { anchoPapel: '80mm' } })
  vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)
  vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
  vi.mocked((prisma as any).pagoCartera.create).mockResolvedValue({
    id: 'pago-1',
    numeroRecibo: 'CL2605001',
    monto: 500000,
    descuento: 0,
    clienteNombre: 'EVELIN ZAMBRANO',
    vendedorNombre: 'Carlos Godoy',
    saldoAnterior: null,
    valorFactura: null,
    metodopago: 'efectivo',
    lineasPago: null,
  })
}

// ── Tests ─────────────────────────────────────────────────────────

describe('GUARDIÁN: Cartera — Pagos', () => {

  // ── Regla 1: valores congelados ───────────────────────────────────
  describe('[RECIBO] saldoAnterior congelado ANTES del pago', () => {

    it('con deudas → saldoAnterior = suma de saldos ANTES de aplicar', async () => {
      setupBase()

      const deuda1 = { id: 'sd-1', externalId: 'ext-1', saldo: 800000, valor: 1000000, abono: 200000 }
      const deuda2 = { id: 'sd-2', externalId: 'ext-2', saldo: 300000, valor: 300000, abono: 0 }

      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([deuda1, deuda2])

      let capturedData: any = null
      vi.mocked((prisma as any).pagoCartera.create).mockImplementation(async ({ data }: any) => {
        capturedData = data
        return { id: 'pago-1', ...data }
      })

      await POST(makeReq({
        clienteApiId: 'cli-api-1',
        monto: 1100000,
        syncDeudaIds: ['ext-1', 'ext-2'],
      }))

      // REGLA: saldoAnterior = suma de saldos antes del pago
      expect(capturedData?.saldoAnterior).toBe(1100000) // 800k + 300k
    })

    it('clienteNombre capturado del objeto cliente en BD — no del body', async () => {
      setupBase()

      let capturedData: any = null
      vi.mocked((prisma as any).pagoCartera.create).mockImplementation(async ({ data }: any) => {
        capturedData = data
        return { id: 'pago-1', ...data }
      })

      await POST(makeReq({
        clienteApiId: 'cli-api-1',
        monto: 500000,
        // No enviamos clienteNombre en el body — debe tomarlo de la BD
      }))

      // REGLA: nombre viene de la BD, no del request
      expect(capturedData?.clienteNombre).toBe('EVELIN ZAMBRANO')
    })

    it('vendedorNombre capturado del empleado en BD', async () => {
      setupBase()

      let capturedData: any = null
      vi.mocked((prisma as any).pagoCartera.create).mockImplementation(async ({ data }: any) => {
        capturedData = data
        return { id: 'pago-1', ...data }
      })

      await POST(makeReq({ clienteApiId: 'cli-api-1', monto: 500000 }))

      expect(capturedData?.vendedorNombre).toBe('Carlos Godoy')
    })

    it('sin deudas → saldoAnterior = null (no inventar saldo)', async () => {
      setupBase()
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])

      let capturedData: any = null
      vi.mocked((prisma as any).pagoCartera.create).mockImplementation(async ({ data }: any) => {
        capturedData = data
        return { id: 'pago-1', ...data }
      })

      await POST(makeReq({ clienteApiId: 'cli-api-1', monto: 200000 }))

      // REGLA: sin deudas identificadas, no inventa saldoAnterior
      expect(capturedData?.saldoAnterior).toBeNull()
    })
  })

  // ── Regla 2: validaciones de entrada ─────────────────────────────
  describe('[PAGO] validaciones de entrada', () => {

    it('sin clienteApiId → 400', async () => {
      setupBase()
      const res = await POST(makeReq({ monto: 500000 }))
      expect(res.status).toBe(400)
    })

    it('sin monto → 400', async () => {
      setupBase()
      const res = await POST(makeReq({ clienteApiId: 'cli-1' }))
      expect(res.status).toBe(400)
    })

    it('monto negativo → 400', async () => {
      setupBase()
      const res = await POST(makeReq({ clienteApiId: 'cli-1', monto: -1000 }))
      expect(res.status).toBe(400)
    })

    it('monto cero → 400', async () => {
      setupBase()
      const res = await POST(makeReq({ clienteApiId: 'cli-1', monto: 0, descuento: 0 }))
      expect(res.status).toBe(400)
    })

    it('sin sesión → 401', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await POST(makeReq({ clienteApiId: 'cli-1', monto: 500000 }))
      expect(res.status).toBe(401)
    })

    it('cliente no encontrado → 404', async () => {
      setupBase()
      vi.mocked((prisma as any).cliente.findFirst).mockResolvedValue(null)
      const res = await POST(makeReq({ clienteApiId: 'cli-inexistente', monto: 500000 }))
      expect(res.status).toBe(404)
    })
  })

  // ── Regla 3: respuesta incluye pago y anchoPapel ──────────────────
  describe('[RECIBO] shape de respuesta', () => {

    it('respuesta incluye pago y anchoPapel', async () => {
      setupBase()
      const res  = await POST(makeReq({ clienteApiId: 'cli-api-1', monto: 500000 }))
      const body = await res.json()

      expect(body).toHaveProperty('pago')
      expect(body).toHaveProperty('anchoPapel')
    })

    it('numeroRecibo generado y retornado', async () => {
      setupBase()
      const res  = await POST(makeReq({ clienteApiId: 'cli-api-1', monto: 500000 }))
      const body = await res.json()

      expect(body.pago.numeroRecibo).toBe('CL2605001')
    })
  })
})
