import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findFirst: vi.fn() },
    empleado: { findFirst: vi.fn(), findUnique: vi.fn() },
    empresa: { findUnique: vi.fn() },
    syncDeuda: { findMany: vi.fn() },
    integracion: { findFirst: vi.fn() },
    pagoCartera: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/consecutivo', () => ({ getConsecutivo: vi.fn().mockResolvedValue('CL2605001') }))
vi.mock('@/lib/recibos', async () => {
  const real = await vi.importActual<typeof import('@/lib/recibos')>('@/lib/recibos')
  return {
    ...real,
    generarReciboToken: vi.fn(() => ({
      reciboToken: 'tok_aaa',
      tokenExpira: new Date('2026-05-12T16:00:00Z'),
    })),
  }
})

import { POST } from '@/app/api/cartera/pago-sync/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const VENDEDOR = { user: { id: 'usr-1', role: 'vendedor', empresaId: 'emp-1', email: 'v@x.com', apiId: 'api-usr-1' } } as any
const EMPRESA = { user: { id: 'emp-1', role: 'empresa', email: 'e@x.com' } } as any

const makeReq = (body: any) => new NextRequest('http://localhost/api/cartera/pago-sync', {
  method: 'POST', body: JSON.stringify(body),
})

function mockTx(txMocks: any) {
  // Defaults para modelos agregados — visita, turno, cliente dentro de tx
  const defaults = {
    turno:       { findFirst: vi.fn().mockResolvedValue({ id: 'turno-1' }) },
    visita:      { create:    vi.fn().mockResolvedValue({}) },
    cliente:     { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }) },
    pagoCartera: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'pago-1' }) },
  }
  vi.mocked((prisma as any).$transaction).mockImplementation(async (cb: any) => cb({ ...defaults, ...txMocks }))
}

function setupHappyPath() {
  vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
  vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: 'c1', nombre: 'Cliente X' } as any)
  vi.mocked(prisma.empleado.findUnique).mockResolvedValue({ nombre: 'Vendedor X' } as any)
  vi.mocked(prisma.empresa.findUnique).mockResolvedValue({ configRecibos: { anchoPapel: '80mm' } } as any)
  vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)
  // Por defecto: deuda asignada al vendedor (scope check pasa)
  vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
    { id: 'sd-default', externalId: 'ext-default', saldo: 100, abono: 0,
      numeroFactura: 1, fechaVencimiento: new Date('2026-01-01'),
      empleadoExternalId: 'api-usr-1' }
  ])
}

describe('POST /api/cartera/pago-sync', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('autenticación', () => {
    it('sin sesión → 401', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await POST(makeReq({ clienteApiId: 'c1', monto: 100 }))
      expect(res.status).toBe(401)
    })
  })

  describe('validación de input', () => {
    beforeEach(() => { vi.mocked(getServerSession).mockResolvedValue(VENDEDOR) })

    it('sin clienteApiId → 400', async () => {
      const res = await POST(makeReq({ monto: 100 }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/clienteApiId/i)
    })

    it('sin monto → 400', async () => {
      const res = await POST(makeReq({ clienteApiId: 'erp-c1' }))
      expect(res.status).toBe(400)
    })

    it('cliente fuera de empresa → 404', async () => {
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue(null)
      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 100 }))
      expect(res.status).toBe(404)
      expect(prisma.cliente.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { apiId: 'erp-c1', empresaId: 'emp-1' } })
      )
    })

    it('monto NaN (string no numérico) → 400', async () => {
      setupHappyPath()
      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 'pollo' }))
      expect(res.status).toBe(400)
    })

    it('monto negativo → 400', async () => {
      setupHappyPath()
      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: -50 }))
      expect(res.status).toBe(400)
    })

    it('descuento negativo → 400', async () => {
      setupHappyPath()
      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 100, descuento: -10 }))
      expect(res.status).toBe(400)
    })

    it('notas >1000 chars → 400', async () => {
      setupHappyPath()
      const notas = 'x'.repeat(1001)
      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 100, notas }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/notas/i)
    })

    it('notas exactamente 1000 chars → pasa', async () => {
      setupHappyPath()
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
      mockTx({ pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'pago-1' }) }, syncDeuda: { findUnique: vi.fn(), update: vi.fn() } })
      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 100, notas: 'x'.repeat(1000) }))
      expect(res.status).toBe(200)
    })
  })

  describe('selección de empleado', () => {
    beforeEach(() => {
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: 'c1', nombre: 'X' } as any)
      vi.mocked(prisma.empresa.findUnique).mockResolvedValue({ configRecibos: {} } as any)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)
      // Rol empresa no tiene scope check de vendedor
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
      mockTx({ pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'pago-1' }) }, syncDeuda: { findUnique: vi.fn(), update: vi.fn() } })
    })

    it('rol empresa: busca un empleado activo y usa su id', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      vi.mocked(prisma.empleado.findFirst).mockResolvedValue({ id: 'emp-act-1', nombre: 'V' } as any)
      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 100 }))
      expect(res.status).toBe(200)
      expect(prisma.empleado.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { empresaId: 'emp-1', activo: true } })
      )
    })

    it('rol empresa SIN empleado activo → 400', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      vi.mocked(prisma.empleado.findFirst).mockResolvedValue(null)
      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 100 }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/empleado/i)
    })

    it('rol vendedor: usa user.id directamente', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked(prisma.empleado.findUnique).mockResolvedValue({ nombre: 'V' } as any)
      // Scope vendedor: deuda debe tener empleadoExternalId = user.apiId
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', externalId: 'ext-1', saldo: 100, abono: 0, numeroFactura: 1,
          fechaVencimiento: new Date('2026-01-01'), empleadoExternalId: 'api-usr-1' }
      ])
      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 100 }))
      expect(res.status).toBe(200)
      expect(prisma.empleado.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usr-1' } })
      )
      expect(prisma.empleado.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('lineas multi-método', () => {
    beforeEach(() => {
      setupHappyPath()
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    })

    it('una sola línea → metodopago = el de la línea, no "mixto"', async () => {
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({ pagoCartera: { create: pagoCreate }, syncDeuda: { findUnique: vi.fn(), update: vi.fn() } })

      await POST(makeReq({
        clienteApiId: 'erp-c1', monto: 100,
        lineasPago: [{ metodoPago: 'nequi', monto: 100 }],
      }))

      const callData = pagoCreate.mock.calls[0][0].data
      expect(callData.metodopago).toBe('nequi')
      expect(callData.monto).toBe(100)
    })

    it('múltiples líneas → metodopago = "mixto", suma montos+descuentos', async () => {
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({ pagoCartera: { create: pagoCreate }, syncDeuda: { findUnique: vi.fn(), update: vi.fn() } })

      // Descuento ahora viene en el body, no en cada línea
      await POST(makeReq({
        clienteApiId: 'erp-c1', monto: 999,
        descuento: 5,
        lineasPago: [
          { metodoPago: 'efectivo', monto: 60 },
          { metodoPago: 'nequi',    monto: 40 },
        ],
      }))

      const callData = pagoCreate.mock.calls[0][0].data
      expect(callData.metodopago).toBe('mixto')
      expect(callData.monto).toBe(100)
      expect(callData.descuento).toBe(5)
    })

    it('líneas con monto<=0 son filtradas', async () => {
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({ pagoCartera: { create: pagoCreate }, syncDeuda: { findUnique: vi.fn(), update: vi.fn() } })

      await POST(makeReq({
        clienteApiId: 'erp-c1', monto: 100,
        lineasPago: [
          { metodoPago: 'efectivo', monto: 100 },
          { metodoPago: 'nequi', monto: 0 },
          { metodoPago: 'banco', monto: -50 },
        ],
      }))

      const callData = pagoCreate.mock.calls[0][0].data
      expect(callData.metodopago).toBe('efectivo')
    })
  })

  describe('aplicación FIFO de deudas', () => {
    beforeEach(() => { setupHappyPath() })

    it('pago $150 sobre 3 deudas → cubre 1ra ($50) + 2da ($100), no toca la 3ra', async () => {
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', externalId: 'ext-1', numeroFactura: 101, saldo: 50,  abono: 0, fechaVencimiento: new Date('2026-01-01'), empleadoExternalId: 'api-usr-1' },
        { id: 'sd-2', externalId: 'ext-2', numeroFactura: 102, saldo: 100, abono: 0, fechaVencimiento: new Date('2026-02-01'), empleadoExternalId: 'api-usr-1' },
        { id: 'sd-3', externalId: 'ext-3', numeroFactura: 103, saldo: 200, abono: 0, fechaVencimiento: new Date('2026-03-01'), empleadoExternalId: 'api-usr-1' },
      ])
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      const sdFindUnique = vi.fn()
        .mockResolvedValueOnce({ saldo: 50, abono: 0 })
        .mockResolvedValueOnce({ saldo: 100, abono: 0 })
      mockTx({ pagoCartera: { create: pagoCreate }, syncDeuda: { findUnique: sdFindUnique, update: vi.fn() } })

      await POST(makeReq({
        clienteApiId: 'erp-c1', monto: 150, syncDeudaIds: ['ext-1', 'ext-2', 'ext-3'],
      }))

      const aplicaciones = pagoCreate.mock.calls[0][0].data.Aplicaciones.create
      expect(aplicaciones).toHaveLength(2)
      expect(aplicaciones[0]).toMatchObject({ externalId: 'ext-1', montoAplicado: 50 })
      expect(aplicaciones[1]).toMatchObject({ externalId: 'ext-2', montoAplicado: 100 })
    })

    it('pago parcial: $30 sobre deuda de $100 → 1 aplicación de $30', async () => {
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', externalId: 'ext-1', numeroFactura: 101, saldo: 100, abono: 0, fechaVencimiento: new Date('2026-01-01'), empleadoExternalId: 'api-usr-1' },
      ])
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({ pagoCartera: { create: pagoCreate }, syncDeuda: { findUnique: vi.fn().mockResolvedValue({ saldo: 100, abono: 0 }), update: vi.fn() } })

      await POST(makeReq({ clienteApiId: 'erp-c1', monto: 30, syncDeudaIds: ['ext-1'] }))

      const aplicaciones = pagoCreate.mock.calls[0][0].data.Aplicaciones.create
      expect(aplicaciones).toHaveLength(1)
      expect(aplicaciones[0].montoAplicado).toBe(30)
    })

    it('deuda con saldo=0 se skippea', async () => {
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-pagada', externalId: 'ext-1', saldo: 0, abono: 100, numeroFactura: 101, fechaVencimiento: new Date('2026-01-01'), empleadoExternalId: 'api-usr-1' },
        { id: 'sd-pendiente', externalId: 'ext-2', saldo: 80, abono: 0, numeroFactura: 102, fechaVencimiento: new Date('2026-02-01'), empleadoExternalId: 'api-usr-1' },
      ])
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({ pagoCartera: { create: pagoCreate }, syncDeuda: { findUnique: vi.fn().mockResolvedValue({ saldo: 80, abono: 0 }), update: vi.fn() } })

      await POST(makeReq({ clienteApiId: 'erp-c1', monto: 50, syncDeudaIds: ['ext-1', 'ext-2'] }))

      const aplicaciones = pagoCreate.mock.calls[0][0].data.Aplicaciones.create
      expect(aplicaciones).toHaveLength(1)
      expect(aplicaciones[0].externalId).toBe('ext-2')
    })

    it('sin syncDeudaIds → pago sin aplicaciones (anticipo)', async () => {
      const pagoCreate = vi.fn().mockResolvedValue({ id: 'p1' })
      mockTx({ pagoCartera: { create: pagoCreate }, syncDeuda: { findUnique: vi.fn(), update: vi.fn() } })

      await POST(makeReq({ clienteApiId: 'erp-c1', monto: 50 }))

      const data = pagoCreate.mock.calls[0][0].data
      expect(data.Aplicaciones).toBeUndefined()
    })
  })

  describe('transacción atómica: actualización de saldos', () => {
    beforeEach(() => { setupHappyPath() })

    it('aplicar $30 → sd.saldo: 100→70, abono: 0→30, condition: true', async () => {
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', externalId: 'ext-1', saldo: 100, abono: 0, numeroFactura: 101, fechaVencimiento: new Date('2026-01-01'), empleadoExternalId: 'api-usr-1' },
      ])
      const sdUpdate = vi.fn()
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        syncDeuda: { findUnique: vi.fn().mockResolvedValue({ saldo: 100, abono: 0 }), update: sdUpdate },
      })

      await POST(makeReq({ clienteApiId: 'erp-c1', monto: 30, syncDeudaIds: ['ext-1'] }))

      expect(sdUpdate).toHaveBeenCalledWith({
        where: { id: 'sd-1' },
        data: { saldo: 70, abono: 30, condition: true },
      })
    })

    it('aplicar exacto: $100 sobre $100 → saldo=0, condition=false (deuda pagada)', async () => {
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', externalId: 'ext-1', saldo: 100, abono: 0, numeroFactura: 101, fechaVencimiento: new Date('2026-01-01'), empleadoExternalId: 'api-usr-1' },
      ])
      const sdUpdate = vi.fn()
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        syncDeuda: { findUnique: vi.fn().mockResolvedValue({ saldo: 100, abono: 0 }), update: sdUpdate },
      })

      await POST(makeReq({ clienteApiId: 'erp-c1', monto: 100, syncDeudaIds: ['ext-1'] }))

      expect(sdUpdate).toHaveBeenCalledWith({
        where: { id: 'sd-1' },
        data: { saldo: 0, abono: 100, condition: false },
      })
    })

    it('relee saldo dentro de la transacción (anti race condition)', async () => {
      // Pre-tx el saldo era 100, pero dentro de la tx releemos: ahora es 80 (otro pago entró)
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', externalId: 'ext-1', saldo: 100, abono: 0, numeroFactura: 101, fechaVencimiento: new Date('2026-01-01'), empleadoExternalId: 'api-usr-1' },
      ])
      const sdUpdate = vi.fn()
      mockTx({
        pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        syncDeuda: { findUnique: vi.fn().mockResolvedValue({ saldo: 80, abono: 20 }), update: sdUpdate },
      })

      await POST(makeReq({ clienteApiId: 'erp-c1', monto: 50, syncDeudaIds: ['ext-1'] }))

      // Usa el saldo NUEVO (80), no el viejo (100): 80 - 50 = 30
      expect(sdUpdate).toHaveBeenCalledWith({
        where: { id: 'sd-1' },
        data: { saldo: 30, abono: 70, condition: true },
      })
    })

    it('isolation Serializable + timeout 10s', async () => {
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
      mockTx({ pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) }, syncDeuda: { findUnique: vi.fn(), update: vi.fn() } })

      await POST(makeReq({ clienteApiId: 'erp-c1', monto: 50 }))

      const call = vi.mocked((prisma as any).$transaction).mock.calls[0]
      expect(call[1]).toEqual({ isolationLevel: 'Serializable', timeout: 10000 })
    })
  })

  describe('response final', () => {
    it('200 con pago + anchoPapel desde empresa.configRecibos', async () => {
      setupHappyPath()
      vi.mocked(prisma.empresa.findUnique).mockResolvedValue({ configRecibos: { anchoPapel: '58mm' } } as any)
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
      mockTx({ pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'pago-final', monto: 50 }) }, syncDeuda: { findUnique: vi.fn(), update: vi.fn() } })

      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 50 }))
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.pago).toMatchObject({ id: 'pago-final', monto: 50 })
      expect(body.anchoPapel).toBe('58mm')
    })

    it('configRecibos sin anchoPapel → default "80mm"', async () => {
      setupHappyPath()
      vi.mocked(prisma.empresa.findUnique).mockResolvedValue({ configRecibos: {} } as any)
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
      mockTx({ pagoCartera: { create: vi.fn().mockResolvedValue({ id: 'p1' }) }, syncDeuda: { findUnique: vi.fn(), update: vi.fn() } })

      const res = await POST(makeReq({ clienteApiId: 'erp-c1', monto: 50 }))
      const body = await res.json()
      expect(body.anchoPapel).toBe('80mm')
    })
  })
})
