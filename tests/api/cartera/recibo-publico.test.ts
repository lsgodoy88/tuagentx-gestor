import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pagoCartera: { findFirst: vi.fn() },
    empresa: { findUnique: vi.fn() },
    cliente: { findFirst: vi.fn() },
    syncDeuda: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}))

import { GET } from '@/app/api/cartera/recibo-publico/route'
import { prisma } from '@/lib/prisma'

const makeReq = (token: string | null) => {
  const url = token === null
    ? 'http://localhost/api/cartera/recibo-publico'
    : `http://localhost/api/cartera/recibo-publico?token=${token}`
  return new NextRequest(url)
}

describe('GET /api/cartera/recibo-publico — recibo público por token', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('validación de token', () => {
    it('sin token → 400', async () => {
      const res = await GET(makeReq(null))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/token/i)
    })

    it('token no existe en BD → 404', async () => {
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue(null)
      const res = await GET(makeReq('inexistente'))
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toMatch(/invalido/i)
    })

    it('búsqueda usa el campo reciboToken', async () => {
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue(null)
      await GET(makeReq('tok_abc'))
      expect((prisma as any).pagoCartera.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reciboToken: 'tok_abc' } })
      )
    })
  })

  describe('expiración de token', () => {
    it('tokenExpira en el pasado → 410 con pagoId (frontend puede pedir renovar)', async () => {
      const pago = {
        id: 'pago-1',
        reciboToken: 'tok',
        tokenExpira: new Date(Date.now() - 60_000), // expirado hace 1 min
        Cartera: null,
        Empleado: null,
        Aplicaciones: [],
      }
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue(pago)
      const res = await GET(makeReq('tok'))
      expect(res.status).toBe(410)
      const body = await res.json()
      expect(body.error).toBe('TOKEN_EXPIRADO')
      expect(body.pagoId).toBe('pago-1')
    })

    it('tokenExpira en el futuro → procede', async () => {
      const pago = {
        id: 'pago-1',
        reciboToken: 'tok',
        tokenExpira: new Date(Date.now() + 60_000),
        monto: 100, descuento: 0,
        Cartera: null,
        Empleado: null,
        Aplicaciones: [],
      }
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue(pago)
      const res = await GET(makeReq('tok'))
      expect(res.status).toBe(200)
    })

    it('tokenExpira null → procede sin expirar', async () => {
      const pago = {
        id: 'pago-1',
        reciboToken: 'tok',
        tokenExpira: null,
        monto: 100, descuento: 0,
        Cartera: null,
        Empleado: null,
        Aplicaciones: [],
      }
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue(pago)
      const res = await GET(makeReq('tok'))
      expect(res.status).toBe(200)
    })
  })

  describe('modo Cartera (flujo viejo: Cliente/Empresa/DetalleCartera relacionados)', () => {
    it('pago con Cartera → devuelve la cartera normalizada con cliente/empresa', async () => {
      const pago = {
        id: 'pago-cartera-1',
        monto: 50_000, descuento: 0,
        tokenExpira: null,
        metodopago: 'efectivo',
        numeroRecibo: 'CL2605001',
        Cartera: {
          id: 'cart-1',
          empresaId: 'emp-1',
          Cliente: { id: 'c1', nombre: 'Cliente X', nit: '900111' },
          Empresa: { id: 'emp-1', nombre: 'Lumeli' },
          DetalleCartera: [{ id: 'd1', valorFactura: 100_000 }],
        },
        Empleado: { id: 'e1', nombre: 'Vendedor X', empresaId: 'emp-1' },
        Aplicaciones: [],
      }
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue(pago)

      const res = await GET(makeReq('tok'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.pago.cartera.cliente.nombre).toBe('Cliente X')
      expect(body.pago.cartera.empresa.nombre).toBe('Lumeli')
      expect(body.pago.cartera.DetalleCartera).toHaveLength(1)
      // NO llama a las tablas del modo sync
      expect((prisma as any).empresa.findUnique).not.toHaveBeenCalled()
      expect((prisma as any).syncDeuda.findUnique).not.toHaveBeenCalled()
    })

    it('campos normalizados: metodoPago y consecutivo (camelCase del schema raro)', async () => {
      const pago = {
        id: 'p1', monto: 100, descuento: 0,
        tokenExpira: null,
        metodopago: 'nequi',           // schema usa "metodopago" (legacy)
        numeroRecibo: 'CL2605007',
        Cartera: { Cliente: {}, Empresa: {}, DetalleCartera: [] },
        Empleado: {},
        Aplicaciones: [],
      }
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue(pago)
      const res = await GET(makeReq('tok'))
      const body = await res.json()
      expect(body.pago.metodoPago).toBe('nequi')     // expuesto en camelCase
      expect(body.pago.consecutivo).toBe('CL2605007') // alias claro
    })
  })

  describe('modo sync (sin Cartera, datos congelados en PagoCartera)', () => {
    const pagoSyncBase = {
      id: 'pago-sync-1',
      monto: 80_000, descuento: 2_000,
      tokenExpira: null,
      metodopago: 'efectivo',
      numeroRecibo: 'CL2605002',
      Cartera: null, // ← clave: sin Cartera relacional, modo sync
      Empleado: { id: 'e1', nombre: 'Vendedor X', empresaId: 'emp-1' },
    }

    it('1 aplicación con valorFactura congelado → usa el congelado (no SyncDeuda.valor)', async () => {
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
        ...pagoSyncBase,
        clienteApiId: 'api-c1',
        valorFactura: 150_000,
        saldoAnterior: 150_000,
        Aplicaciones: [{ syncDeudaId: 'sd-1', numeroFactura: 999, externalId: 'ext-1', montoAplicado: 82_000 }],
      })
      vi.mocked((prisma as any).empresa.findUnique).mockResolvedValue({ id: 'emp-1', nombre: 'Lumeli' })
      vi.mocked((prisma as any).cliente.findFirst).mockResolvedValue({ id: 'c1', nombre: 'X', apiId: 'api-c1' })
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', valor: 999_999, saldo: 68_000, data: {} }, // valor distinto al congelado
      ])

      const res = await GET(makeReq('tok'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.pago.cartera._modo).toBe('sync')
      // valorFactura debe ser el CONGELADO (150_000), no el de SyncDeuda (999_999)
      expect(body.pago.cartera.DetalleCartera[0].valorFactura).toBe(150_000)
      // saldoAnterior congelado: 150_000
      expect(body.pago.cartera.DetalleCartera[0].saldoAntes).toBe(150_000)
    })

    it('>1 aplicaciones → NO usa valorFactura congelado (es ambiguo a qué factura corresponde)', async () => {
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
        ...pagoSyncBase,
        clienteApiId: 'api-c1',
        valorFactura: 150_000, // congelado pero ambiguo
        saldoAnterior: 150_000,
        Aplicaciones: [
          { syncDeudaId: 'sd-1', numeroFactura: 101, externalId: 'ext-1', montoAplicado: 50_000 },
          { syncDeudaId: 'sd-2', numeroFactura: 102, externalId: 'ext-2', montoAplicado: 30_000 },
        ],
      })
      vi.mocked((prisma as any).empresa.findUnique).mockResolvedValue({ id: 'emp-1' })
      vi.mocked((prisma as any).cliente.findFirst).mockResolvedValue({ id: 'c1', apiId: 'api-c1' })
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', valor: 100_000, saldo: 50_000, data: {} },
        { id: 'sd-2', valor: 80_000,  saldo: 50_000, data: {} },
      ])

      const res = await GET(makeReq('tok'))
      const body = await res.json()
      // Cada detalle usa el valor de SU SyncDeuda, no el congelado del pago
      expect(body.pago.cartera.DetalleCartera[0].valorFactura).toBe(100_000)
      expect(body.pago.cartera.DetalleCartera[1].valorFactura).toBe(80_000)
    })

    it('cliente sin datos congelados (pago viejo) → fallback a SyncDeuda.clienteApiId', async () => {
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
        ...pagoSyncBase,
        clienteApiId: null, // sin congelar (pago antes del fix)
        valorFactura: null,
        saldoAnterior: null,
        Aplicaciones: [{ syncDeudaId: 'sd-1', numeroFactura: 101, externalId: 'ext-1', montoAplicado: 50_000 }],
      })
      vi.mocked((prisma as any).empresa.findUnique).mockResolvedValue({ id: 'emp-1' })
      vi.mocked((prisma as any).syncDeuda.findUnique).mockResolvedValue({ id: 'sd-1', clienteApiId: 'api-fallback' })
      vi.mocked((prisma as any).cliente.findFirst).mockResolvedValue({ id: 'c-old', nombre: 'Viejo', apiId: 'api-fallback' })
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', valor: 50_000, saldo: 0, data: {} },
      ])

      const res = await GET(makeReq('tok'))
      const body = await res.json()
      expect(body.pago.cartera.cliente.nombre).toBe('Viejo')
      // Verificamos que SÍ recurrió al fallback
      expect((prisma as any).syncDeuda.findUnique).toHaveBeenCalledWith({ where: { id: 'sd-1' } })
    })

    it('totales: valorFacturasPagadas + saldoAnterior derivado', async () => {
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
        ...pagoSyncBase,
        monto: 80_000,
        descuento: 2_000, // 82k total aplicado
        clienteApiId: 'api-c1',
        valorFactura: null,
        saldoAnterior: null,
        Aplicaciones: [
          { syncDeudaId: 'sd-1', numeroFactura: 101, externalId: 'ext-1', montoAplicado: 50_000 },
          { syncDeudaId: 'sd-2', numeroFactura: 102, externalId: 'ext-2', montoAplicado: 32_000 },
        ],
      })
      vi.mocked((prisma as any).empresa.findUnique).mockResolvedValue({ id: 'emp-1' })
      vi.mocked((prisma as any).cliente.findFirst).mockResolvedValue({ id: 'c1', apiId: 'api-c1' })
      vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([
        { id: 'sd-1', valor: 100_000, saldo: 50_000, data: {} },
        { id: 'sd-2', valor: 80_000,  saldo: 48_000, data: {} },
      ])

      const res = await GET(makeReq('tok'))
      const body = await res.json()
      expect(body.pago.cartera.valorFacturasPagadas).toBe(180_000) // 100k + 80k
      expect(body.pago.cartera.saldoPendiente).toBe(98_000)        // 50k + 48k
      // saldoAnterior = saldoPendiente + (monto + descuento) = 98k + 82k = 180k
      expect(body.pago.cartera.saldoAnterior).toBe(180_000)
    })

    it('sin aplicaciones (anticipo) → DetalleCartera vacío, totales en 0', async () => {
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
        ...pagoSyncBase,
        monto: 30_000, descuento: 0,
        clienteApiId: 'api-c1',
        Aplicaciones: [],
      })
      vi.mocked((prisma as any).empresa.findUnique).mockResolvedValue({ id: 'emp-1' })
      vi.mocked((prisma as any).cliente.findFirst).mockResolvedValue({ id: 'c1', apiId: 'api-c1' })

      const res = await GET(makeReq('tok'))
      const body = await res.json()
      expect(body.pago.cartera.DetalleCartera).toHaveLength(0)
      expect(body.pago.cartera.valorFacturasPagadas).toBe(0)
      expect(body.pago.cartera.saldoPendiente).toBe(0)
      // saldoAnterior = 0 + 30k = 30k (lo que el cliente "tenía" antes del anticipo)
      expect(body.pago.cartera.saldoAnterior).toBe(30_000)
    })

    it('filtro de cliente respeta empresaId (multitenant)', async () => {
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
        ...pagoSyncBase,
        clienteApiId: 'api-c1',
        Aplicaciones: [],
      })
      vi.mocked((prisma as any).empresa.findUnique).mockResolvedValue({ id: 'emp-1' })
      vi.mocked((prisma as any).cliente.findFirst).mockResolvedValue(null)

      await GET(makeReq('tok'))

      expect((prisma as any).cliente.findFirst).toHaveBeenCalledWith({
        where: { apiId: 'api-c1', empresaId: 'emp-1' },
      })
    })

    it('Empleado sin empresaId (caso raro) → empresa null, cliente null', async () => {
      vi.mocked((prisma as any).pagoCartera.findFirst).mockResolvedValue({
        ...pagoSyncBase,
        Empleado: { id: 'e1', nombre: 'X', empresaId: null },
        clienteApiId: 'api-c1',
        Aplicaciones: [],
      })

      const res = await GET(makeReq('tok'))
      const body = await res.json()
      expect(body.pago.cartera.empresa).toBeNull()
      expect(body.pago.cartera.cliente).toBeNull()
      // No tira error, devuelve el recibo aunque sin cliente
      expect(res.status).toBe(200)
    })
  })
})
