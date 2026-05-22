import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cartera: { findFirst: vi.fn(), findUnique: vi.fn() },
    empleado: { findFirst: vi.fn(), findUnique: vi.fn() },
    detalleCartera: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/consecutivo', () => ({ getConsecutivo: vi.fn().mockResolvedValue('CL2605010') }))
vi.mock('@/lib/recibos', async () => {
  const real = await vi.importActual<typeof import('@/lib/recibos')>('@/lib/recibos')
  return {
    ...real,
    generarReciboToken: vi.fn(() => ({
      reciboToken: 'tok_zzz',
      tokenExpira: new Date('2026-05-12T16:00:00Z'),
    })),
  }
})

import { POST } from '@/app/api/cartera/pago-sync/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const VENDEDOR = { user: { id: 'usr-1', role: 'vendedor', empresaId: 'emp-1' } } as any
const EMPRESA = { user: { id: 'emp-1', role: 'empresa' } } as any

const makeReq = (body: any) => new NextRequest('http://localhost/api/cartera/pago', {
  method: 'POST', body: JSON.stringify(body),
})

function mockTx(txMocks: any) {
  vi.mocked((prisma as any).$transaction).mockImplementation(async (cb: any) => cb(txMocks))
}

function setupHappyPath() {
  vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
  vi.mocked(prisma.cartera.findFirst).mockResolvedValue({
    id: 'cart-1', empresaId: 'emp-1', empleadoId: null,
    Empresa: { configRecibos: { anchoPapel: '80mm' } },
  } as any)
  vi.mocked(prisma.cartera.findUnique).mockResolvedValue({
    Cliente: { apiId: 'api-c1', nombre: 'Cliente X' }
  } as any)
  vi.mocked(prisma.empleado.findUnique).mockResolvedValue({ nombre: 'Vendedor X' } as any)
}

// TODO: endpoint renombrado a pago-sync/route con nueva interfaz (syncDeudaIds, clienteApiId)
// estos tests cubren la arquitectura anterior — reescribir contra pago-sync
describe.skip('POST /api/cartera/pago — flujo Cartera/DetalleCartera (no sync) [LEGACY]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('autenticación + validación de input', () => {
    it('sin sesión → 401', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await POST(makeReq({ carteraId: 'cart-1', monto: 100 }))
      expect(res.status).toBe(401)
    })

    it('sin carteraId → 400', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      const res = await POST(makeReq({ monto: 100 }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/carteraId/i)
    })

    it('sin monto → 400', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      const res = await POST(makeReq({ carteraId: 'cart-1' }))
      expect(res.status).toBe(400)
    })

    it('cartera fuera de empresa → 404 (multitenant)', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.cartera.findFirst).mockResolvedValue(null)
      const res = await POST(makeReq({ carteraId: 'cart-otra', monto: 100 }))
      expect(res.status).toBe(404)
      expect(prisma.cartera.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cart-otra', empresaId: 'emp-1' } })
      )
    })

    it('monto NaN → 400', async () => {
      setupHappyPath()
      const res = await POST(makeReq({ carteraId: 'cart-1', monto: 'pollo' }))
      expect(res.status).toBe(400)
    })

    it('descuento negativo → 400', async () => {
      setupHappyPath()
      const res = await POST(makeReq({ carteraId: 'cart-1', monto: 100, descuento: -5 }))
      expect(res.status).toBe(400)
    })

    it('notas >1000 chars → 400', async () => {
      setupHappyPath()
      const res = await POST(makeReq({
        carteraId: 'cart-1', monto: 100, notas: 'x'.repeat(1001),
      }))
      expect(res.status).toBe(400)
    })

    it('totalAplicado <= 0 (monto y descuento ambos 0) → 400', async () => {
      // Nota: monto:0 falla primero por `!monto`; este test cubre el caso
      // con descuento:0 explícito sin monto en el body
      setupHappyPath()
      const res = await POST(makeReq({ carteraId: 'cart-1', monto: 0, descuento: 0 }))
      expect(res.status).toBe(400)
    })
  })

  describe('selección de empleado', () => {
    beforeEach(() => {
      vi.mocked(prisma.cartera.findUnique).mockResolvedValue({ Cliente: {} } as any)
      vi.mocked(prisma.empleado.findUnique).mockResolvedValue({ nombre: 'X' } as any)
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        detalleCartera: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), update: vi.fn() },
        cartera: { update: vi.fn() },
      })
    })

    it('vendedor: usa user.id directo', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.cartera.findFirst).mockResolvedValue({
        id: 'cart-1', empresaId: 'emp-1', empleadoId: null,
        Empresa: { configRecibos: {} },
      } as any)
      const res = await POST(makeReq({ carteraId: 'cart-1', monto: 100 }))
      expect(res.status).toBe(200)
      expect(prisma.empleado.findFirst).not.toHaveBeenCalled()
    })

    it('empresa: busca empleado activo, sin restricción si cartera.empleadoId es null', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      vi.mocked(prisma.cartera.findFirst).mockResolvedValue({
        id: 'cart-1', empresaId: 'emp-1', empleadoId: null,
        Empresa: { configRecibos: {} },
      } as any)
      vi.mocked(prisma.empleado.findFirst).mockResolvedValue({ id: 'e-default' } as any)

      await POST(makeReq({ carteraId: 'cart-1', monto: 100 }))

      expect(prisma.empleado.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ empresaId: 'emp-1', activo: true }) })
      )
    })

    it('empresa: si cartera tiene empleadoId asignado, lo respeta', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      vi.mocked(prisma.cartera.findFirst).mockResolvedValue({
        id: 'cart-1', empresaId: 'emp-1', empleadoId: 'e-asignado',
        Empresa: { configRecibos: {} },
      } as any)
      vi.mocked(prisma.empleado.findFirst).mockResolvedValue({ id: 'e-asignado' } as any)

      await POST(makeReq({ carteraId: 'cart-1', monto: 100 }))

      // El query incluye id: 'e-asignado'
      expect(prisma.empleado.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'e-asignado' }) })
      )
    })

    it('empresa sin empleado activo → 400', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      vi.mocked(prisma.cartera.findFirst).mockResolvedValue({
        id: 'cart-1', empresaId: 'emp-1', empleadoId: null,
        Empresa: { configRecibos: {} },
      } as any)
      vi.mocked(prisma.empleado.findFirst).mockResolvedValue(null)

      const res = await POST(makeReq({ carteraId: 'cart-1', monto: 100 }))
      expect(res.status).toBe(400)
    })
  })

  describe('congelado de datos en PagoCartera', () => {
    it('guarda clienteApiId, clienteNombre, vendedorNombre, saldoAnterior, valorFactura', async () => {
      setupHappyPath()
      vi.mocked((prisma as any).detalleCartera.findMany).mockResolvedValue([
        { id: 'd1', saldoPendiente: 80_000, numeroFactura: 555, valorFactura: 100_000 },
      ])
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({
        pagoCartera: { create: pagoCreate },
        detalleCartera: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'd1', valorFactura: 100_000, abonos: 20_000, fechaVencimiento: null },
          ]),
          update: vi.fn(), updateMany: vi.fn(),
        },
        cartera: { update: vi.fn() },
      })

      await POST(makeReq({
        carteraId: 'cart-1', monto: 50_000, detalleIds: ['d1'],
      }))

      const data = pagoCreate.mock.calls[0][0].data
      // Datos congelados desde lookup
      expect(data.clienteApiId).toBe('api-c1')
      expect(data.clienteNombre).toBe('Cliente X')
      expect(data.vendedorNombre).toBe('Vendedor X')
      // Datos congelados desde detalleIds
      expect(data.saldoAnterior).toBe(80_000)
      expect(data.valorFactura).toBe(100_000)
      expect(data.numeroFactura).toBe(555)
    })

    it('sin detalleIds → saldoAnterior y valorFactura quedan null', async () => {
      setupHappyPath()
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({
        pagoCartera: { create: pagoCreate },
        detalleCartera: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn() },
        cartera: { update: vi.fn() },
      })

      await POST(makeReq({ carteraId: 'cart-1', monto: 50_000 }))

      const data = pagoCreate.mock.calls[0][0].data
      expect(data.saldoAnterior).toBeNull()
      expect(data.valorFactura).toBeNull()
      expect(data.numeroFactura).toBeNull()
    })
  })

  describe('fechaPago: voucher OCR > body.fechaPago > now', () => {
    beforeEach(() => {
      setupHappyPath()
    })

    it('fechaPago explícito en body → la usa', async () => {
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({
        pagoCartera: { create: pagoCreate },
        detalleCartera: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn() },
        cartera: { update: vi.fn() },
      })
      await POST(makeReq({
        carteraId: 'cart-1', monto: 50_000,
        fechaPago: '2026-05-10T12:00:00Z',
      }))
      const data = pagoCreate.mock.calls[0][0].data
      expect(new Date(data.fechaPago).toISOString()).toBe('2026-05-10T12:00:00.000Z')
    })

    it('voucherDatosIA.fecha → la usa cuando no hay body.fechaPago', async () => {
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({
        pagoCartera: { create: pagoCreate },
        detalleCartera: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn() },
        cartera: { update: vi.fn() },
      })
      await POST(makeReq({
        carteraId: 'cart-1', monto: 50_000,
        voucherDatosIA: { fecha: '2026-05-05T10:00:00Z' },
      }))
      const data = pagoCreate.mock.calls[0][0].data
      expect(new Date(data.fechaPago).toISOString()).toBe('2026-05-05T10:00:00.000Z')
    })

    it('voucherDatosIA.fecha inválida → ignora y usa now', async () => {
      vi.useFakeTimers()
      const NOW = new Date('2026-05-12T15:00:00Z')
      vi.setSystemTime(NOW)

      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({
        pagoCartera: { create: pagoCreate },
        detalleCartera: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn() },
        cartera: { update: vi.fn() },
      })
      await POST(makeReq({
        carteraId: 'cart-1', monto: 50_000,
        voucherDatosIA: { fecha: 'fecha-invalida' },
      }))
      const data = pagoCreate.mock.calls[0][0].data
      expect(new Date(data.fechaPago).toISOString()).toBe(NOW.toISOString())
      vi.useRealTimers()
    })

    it('sin fechaPago ni voucher → now', async () => {
      vi.useFakeTimers()
      const NOW = new Date('2026-05-12T15:00:00Z')
      vi.setSystemTime(NOW)
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({
        pagoCartera: { create: pagoCreate },
        detalleCartera: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn() },
        cartera: { update: vi.fn() },
      })
      await POST(makeReq({ carteraId: 'cart-1', monto: 50_000 }))
      const data = pagoCreate.mock.calls[0][0].data
      expect(new Date(data.fechaPago).toISOString()).toBe(NOW.toISOString())
      vi.useRealTimers()
    })
  })

  describe('distribución proporcional sobre DetalleCartera', () => {
    beforeEach(() => { setupHappyPath() })

    it('$50 sobre 2 facturas con saldos proporcionales 50/100 → 16.66/33.33', async () => {
      // Cada factura recibe proporción de su saldo respecto al saldoTotal
      vi.mocked((prisma as any).detalleCartera.findMany).mockResolvedValue([
        { id: 'd1', saldoPendiente: 50, numeroFactura: 1, valorFactura: 100 },
        { id: 'd2', saldoPendiente: 100, numeroFactura: 2, valorFactura: 150 },
      ])
      const detalleUpdate = vi.fn()
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        detalleCartera: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'd1', valorFactura: 100, abonos: 50, fechaVencimiento: null }, // saldo restante 50
            { id: 'd2', valorFactura: 150, abonos: 50, fechaVencimiento: null }, // saldo restante 100
          ]),
          update: detalleUpdate, updateMany: vi.fn(),
        },
        cartera: { update: vi.fn() },
      })

      await POST(makeReq({ carteraId: 'cart-1', monto: 50, detalleIds: ['d1', 'd2'] }))

      // saldoTotal = 50 + 100 = 150
      // d1 recibe: 50/150 * 50 = 16.666
      // d2 recibe: 100/150 * 50 = 33.333
      expect(detalleUpdate).toHaveBeenCalledTimes(2)
      const c1 = detalleUpdate.mock.calls.find((c: any) => c[0].where.id === 'd1')[0]
      const c2 = detalleUpdate.mock.calls.find((c: any) => c[0].where.id === 'd2')[0]
      expect(c1.data.abonos).toBeCloseTo(66.666, 1)  // 50 (anterior) + 16.666
      expect(c2.data.abonos).toBeCloseTo(83.333, 1)  // 50 (anterior) + 33.333
    })

    it('abono >= saldoFactura → estado pasa a pagada', async () => {
      vi.mocked((prisma as any).detalleCartera.findMany).mockResolvedValue([
        { id: 'd1', saldoPendiente: 100, numeroFactura: 1, valorFactura: 100 },
      ])
      const detalleUpdate = vi.fn()
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        detalleCartera: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'd1', valorFactura: 100, abonos: 0, fechaVencimiento: null },
          ]),
          update: detalleUpdate, updateMany: vi.fn(),
        },
        cartera: { update: vi.fn() },
      })

      await POST(makeReq({ carteraId: 'cart-1', monto: 100, detalleIds: ['d1'] }))

      const call = detalleUpdate.mock.calls[0][0]
      expect(call.data.abonos).toBe(100)
      expect(call.data.estado).toBe('pagada') // viene de calcularEstado(0, 100, 100, null)
    })

    it('tipo="total" sin detalleIds → marca todos los DetalleCartera no pagados como pagada', async () => {
      const detalleUpdateMany = vi.fn()
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        detalleCartera: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: detalleUpdateMany,
          update: vi.fn(),
        },
        cartera: { update: vi.fn() },
      })

      await POST(makeReq({ carteraId: 'cart-1', monto: 999, tipo: 'total' }))

      expect(detalleUpdateMany).toHaveBeenCalledWith({
        where: { carteraId: 'cart-1', estado: { not: 'pagada' } },
        data: { estado: 'pagada' },
      })
    })

    it('actualiza Cartera.saldoPendiente al final', async () => {
      const carteraUpdate = vi.fn()
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        detalleCartera: {
          findMany: vi.fn()
            .mockResolvedValueOnce([{ id: 'd1', valorFactura: 100, abonos: 50, fechaVencimiento: null }]) // primera llamada (filtrada por detalleIds)
            .mockResolvedValueOnce([
              { id: 'd1', valorFactura: 100, abonos: 100, estado: 'pagada' },
              { id: 'd2', valorFactura: 200, abonos: 30, estado: 'pendiente' },
            ]), // segunda llamada (todos los detalles)
          update: vi.fn(), updateMany: vi.fn(),
        },
        cartera: { update: carteraUpdate },
      })
      vi.mocked((prisma as any).detalleCartera.findMany).mockResolvedValue([
        { id: 'd1', saldoPendiente: 50, numeroFactura: 1, valorFactura: 100 },
      ])

      await POST(makeReq({ carteraId: 'cart-1', monto: 50, detalleIds: ['d1'] }))

      // saldoPendiente = solo los no-pagada: 200 - 30 = 170
      expect(carteraUpdate).toHaveBeenCalledWith({
        where: { id: 'cart-1' },
        data: expect.objectContaining({ saldoPendiente: 170 }),
      })
    })
  })

  describe('Serializable transaction', () => {
    it('isolation Serializable + timeout 10s', async () => {
      setupHappyPath()
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        detalleCartera: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn() },
        cartera: { update: vi.fn() },
      })
      await POST(makeReq({ carteraId: 'cart-1', monto: 50 }))
      const call = vi.mocked((prisma as any).$transaction).mock.calls[0]
      expect(call[1]).toEqual({ isolationLevel: 'Serializable', timeout: 10000 })
    })
  })

  describe('response', () => {
    it('200 con pago + saldoPendiente + anchoPapel', async () => {
      setupHappyPath()
      vi.mocked(prisma.cartera.findFirst).mockResolvedValue({
        id: 'cart-1', empresaId: 'emp-1', empleadoId: null,
        Empresa: { configRecibos: { anchoPapel: '58mm' } },
      } as any)
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'pago-final', monto: 50 }) },
        detalleCartera: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn() },
        cartera: { update: vi.fn() },
      })

      const res = await POST(makeReq({ carteraId: 'cart-1', monto: 50 }))
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.pago.id).toBe('pago-final')
      expect(body.saldoPendiente).toBe(0) // sin detalles → 0
      expect(body.anchoPapel).toBe('58mm')
    })
  })
})
