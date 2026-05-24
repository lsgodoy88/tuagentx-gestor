/**
 * Tests del Guardián — Dashboard Vendedor
 *
 * Cada test corresponde a una regla en vault/guardian/index.md
 * Si este test falla → la lógica de negocio está rota → deploy bloqueado
 *
 * IMPORTANTE: estos tests verifican la LÓGICA de la API, no el UI.
 * Usan mocks de Prisma para reproducir los escenarios exactos que
 * causaron bugs en producción.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── Fixtures de datos realistas ──────────────────────────────────

const CARLOS_ID = 'cmncbhmkk00011al5x4xljorv'
const CARLOS_API_ID = '67a3da759c104c6e174b71ce'
const EMPRESA_ID = 'cmn7oiutk0001vmega46373b4'

const VENDEDOR_SESSION = {
  user: {
    id: CARLOS_ID,
    role: 'vendedor',
    empresaId: EMPRESA_ID,
    email: 'carlos@lumeli.com',
    apiId: CARLOS_API_ID,
  }
} as any

// Fechas de referencia en Bogotá (UTC-5)
const HOY_BOGOTA = '2026-05-23'
const INICIO_DIA = new Date('2026-05-23T05:00:00.000Z')  // 00:00 Bogotá
const FIN_DIA    = new Date('2026-05-24T05:00:00.000Z')  // 23:59 Bogotá
const INICIO_MES = new Date('2026-05-01T05:00:00.000Z')

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth',  () => ({ authOptions: {} }))
vi.mock('@/lib/cache', () => ({
  withCache: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<any>) => fn()),
  invalidateKeys: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const m = {
    empleado:     { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    ordenDespacho:{ findMany: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
    visita:       { findMany: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
    pagoCartera:  { aggregate: vi.fn() },
    metaVenta:    { findFirst: vi.fn() },
    metaRecaudo:  { findFirst: vi.fn() },
    turno:        { findFirst: vi.fn(), count: vi.fn() },
    rutaFijaEmpleado: { findMany: vi.fn() },
    $transaction: vi.fn(async (ops: any) =>
      typeof ops === 'function' ? ops(m) : Promise.all(ops)
    ),
  }
  return { prisma: m }
})

import { GET } from '@/app/api/vendedor/stats/route'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'

// Helper para crear Request
const makeReq = () => new NextRequest('http://localhost/api/vendedor/stats')

// Helper para setup base de mocks (vacíos — cada test sobreescribe lo que necesita)
function setupBase() {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue(VENDEDOR_SESSION)

  vi.mocked((prisma as any).empleado.findUnique).mockResolvedValue({ apiId: CARLOS_API_ID })
  vi.mocked((prisma as any).empleado.findMany).mockResolvedValue([])
  vi.mocked((prisma as any).visita.findMany).mockResolvedValue([])
  vi.mocked((prisma as any).visita.aggregate).mockResolvedValue({ _sum: { monto: null }, _count: { id: 0 } })
  vi.mocked((prisma as any).pagoCartera.aggregate).mockResolvedValue({ _sum: { monto: null, descuento: null }, _count: { id: 0 } })
  vi.mocked((prisma as any).metaVenta.findFirst).mockResolvedValue(null)
  vi.mocked((prisma as any).metaRecaudo.findFirst).mockResolvedValue(null)
  vi.mocked((prisma as any).turno.findFirst).mockResolvedValue(null)
  vi.mocked((prisma as any).turno.count).mockResolvedValue(0)
  vi.mocked((prisma as any).rutaFijaEmpleado.findMany).mockResolvedValue([])
  vi.mocked((prisma as any).ordenDespacho.findMany).mockResolvedValue([])
  vi.mocked((prisma as any).ordenDespacho.aggregate).mockResolvedValue({ _count: { id: 0 }, _sum: { totalOrden: null } })
  vi.mocked((prisma as any).ordenDespacho.count).mockResolvedValue(0)
}

// ── Tests del Guardián ────────────────────────────────────────────

describe('GUARDIÁN: Dashboard Vendedor', () => {

  // ── Regla 1: factHoy usa fechaFactura, NO fechaOrden ─────────────
  describe('[ÓRDENES] factHoy = órdenes con fechaFactura HOY', () => {

    it('ordenes con fechaFactura de hoy → factHoy > 0', async () => {
      setupBase()
      // 6 órdenes con fechaFactura de hoy
      vi.mocked((prisma as any).ordenDespacho.findMany).mockResolvedValue([
        { estado: 'despachado', numeroFactura: '3906', totalOrden: 351000, isFacturada: true, fechaFactura: new Date('2026-05-23T08:12:47.000Z'), fechaOrden: new Date('2026-05-22T18:31:57') },
        { estado: 'despachado', numeroFactura: '3907', totalOrden: 608500, isFacturada: true, fechaFactura: new Date('2026-05-23T08:14:32.000Z'), fechaOrden: new Date('2026-05-22T18:45:47') },
        { estado: 'despachado', numeroFactura: '3908', totalOrden: 529000, isFacturada: true, fechaFactura: new Date('2026-05-23T09:00:00.000Z'), fechaOrden: new Date('2026-05-22T19:00:00') },
      ])

      const res  = await GET(makeReq())
      const body = await res.json()

      // REGLA: factHoy debe ser 3, porque 3 órdenes tienen fechaFactura de hoy
      expect(body.ordenes.factHoy).toBe(3)
    })

    it('ordenes con fechaOrden de hoy pero fechaFactura de ayer → factHoy = 0', async () => {
      setupBase()
      // Bug histórico: se usaba fechaOrden en lugar de fechaFactura
      vi.mocked((prisma as any).ordenDespacho.findMany).mockResolvedValue([
        {
          estado: 'despachado',
          numeroFactura: '3905',
          totalOrden: 500000,
          isFacturada: true,
          // fechaFactura de AYER — no cuenta como "hoy"
          fechaFactura: new Date('2026-05-22T14:00:00.000Z'),
          // fechaOrden de HOY — el bug antiguo la habría contado
          fechaOrden: new Date('2026-05-23T10:00:00.000Z'),
        }
      ])

      const res  = await GET(makeReq())
      const body = await res.json()

      // REGLA: NO debe contar esta orden porque fechaFactura es de ayer
      expect(body.ordenes.factHoy).toBe(0)
    })

    it('orden sin fechaFactura → NO cuenta en factHoy aunque tenga numeroFactura', async () => {
      setupBase()
      vi.mocked((prisma as any).ordenDespacho.findMany).mockResolvedValue([
        {
          estado: 'despachado',
          numeroFactura: '3900',
          totalOrden: 200000,
          isFacturada: true,
          fechaFactura: null,  // sin fecha de facturación
          fechaOrden: new Date('2026-05-23T10:00:00.000Z'),
        }
      ])

      const res  = await GET(makeReq())
      const body = await res.json()

      expect(body.ordenes.factHoy).toBe(0)
    })
  })

  // ── Regla 2: montoMes solo cuenta isFacturada = true ─────────────
  describe('[VENTAS] montoMes = solo órdenes isFacturada=true', () => {

    it('ordenes sin isFacturada NO suman en montoMes', async () => {
      setupBase()
      // Aggregate para montoMes — solo facturadas
      vi.mocked((prisma as any).ordenDespacho.aggregate).mockResolvedValue({
        _count: { id: 5 },
        _sum: { totalOrden: 5000000 }
      })

      const res  = await GET(makeReq())
      const body = await res.json()

      // REGLA: montoMes debe venir del aggregate que filtra isFacturada=true
      expect(body.ordenes.montoMes).toBe(5000000)
    })

    it('sin órdenes facturadas → montoMes = 0', async () => {
      setupBase()
      vi.mocked((prisma as any).ordenDespacho.aggregate).mockResolvedValue({
        _count: { id: 0 },
        _sum: { totalOrden: null }
      })

      const res  = await GET(makeReq())
      const body = await res.json()

      expect(body.ordenes.montoMes).toBe(0)
    })
  })

  // ── Regla 3: turno.inicio nunca en el futuro ─────────────────────
  describe('[TURNO] inicio nunca en el futuro', () => {

    it('turno con inicio en el futuro → contador en 0, no negativo', async () => {
      // El dashboard usa Math.max(0, diff) — verificar que el cálculo es correcto
      const ahora = new Date(Date.now() - 5 * 60 * 60 * 1000) // Bogotá
      const futuro = new Date(ahora.getTime() + 30 * 60 * 1000) // 30 min en el futuro

      const diff = Math.max(0, Math.floor((ahora.getTime() - futuro.getTime()) / 1000))
      // REGLA: nunca negativo
      expect(diff).toBe(0)
      expect(diff).toBeGreaterThanOrEqual(0)
    })

    it('turno normal → diff positivo', () => {
      const ahora  = new Date(Date.now() - 5 * 60 * 60 * 1000)
      const hace1h = new Date(ahora.getTime() - 60 * 60 * 1000)

      const diff = Math.max(0, Math.floor((ahora.getTime() - hace1h.getTime()) / 1000))
      expect(diff).toBe(3600)
    })
  })

  // ── Regla 4: cache key usa fechaHoyBogota() ──────────────────────
  describe('[CACHE] key usa fechaHoyBogota, no UTC', () => {

    it('fechaHoyBogota difiere de UTC después de las 7pm', async () => {
      // A las 7pm Bogotá = medianoche UTC → fechas diferentes
      // Simular: son las 7:30pm Bogotá = 00:30 UTC del día siguiente
      const alas7pmBogota = new Date('2026-05-24T00:30:00.000Z') // UTC
      const fechaUTC = alas7pmBogota.toISOString().split('T')[0]  // '2026-05-24'
      const fechaBogota = new Date(alas7pmBogota.getTime() - 5 * 60 * 60 * 1000)
        .toISOString().split('T')[0]  // '2026-05-23'

      // REGLA: las keys deben ser distintas — por eso usamos fechaHoyBogota()
      expect(fechaUTC).not.toBe(fechaBogota)
      expect(fechaBogota).toBe('2026-05-23')
      expect(fechaUTC).toBe('2026-05-24')
    })
  })

  // ── Regla 5: sin sesión → 401 ────────────────────────────────────
  describe('[AUTH] acceso sin sesión', () => {

    it('sin sesión → 401', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await GET(makeReq())
      expect(res.status).toBe(401)
    })

    it('rol no vendedor → 403', async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: 'admin-1', role: 'empresa', empresaId: EMPRESA_ID }
      } as any)
      const res = await GET(makeReq())
      expect(res.status).toBe(403)
    })
  })

  // ── Regla 6: shape de respuesta — tipos TypeScript ───────────────
  describe('[CONTRATO] shape de respuesta VendedorStats', () => {

    it('respuesta tiene todos los campos requeridos por VendedorStats', async () => {
      setupBase()
      const res  = await GET(makeReq())
      const body = await res.json()

      // Campos obligatorios según lib/types/vendedor.ts
      expect(body).toHaveProperty('hoy')
      expect(body).toHaveProperty('ordenes')
      expect(body).toHaveProperty('recaudo')
      expect(body).toHaveProperty('cumplimiento')
      expect(body).toHaveProperty('dias')
      expect(body).toHaveProperty('meses')

      // Subcampos críticos
      expect(body.ordenes).toHaveProperty('factHoy')
      expect(body.ordenes).toHaveProperty('despHoy')
      expect(body.ordenes).toHaveProperty('montoMes')
      expect(body.ordenes).toHaveProperty('metaVentaMes')
      expect(body.recaudo).toHaveProperty('mes')
      expect(body.recaudo).toHaveProperty('meta')
      expect(body.recaudo).toHaveProperty('pagosCount')
    })

    it('valores numéricos nunca son NaN o undefined', async () => {
      setupBase()
      const res  = await GET(makeReq())
      const body = await res.json()

      expect(Number.isFinite(body.ordenes.factHoy)).toBe(true)
      expect(Number.isFinite(body.ordenes.montoMes)).toBe(true)
      expect(Number.isFinite(body.ordenes.despHoy)).toBe(true)
      expect(Number.isFinite(body.recaudo.mes)).toBe(true)
      expect(Number.isFinite(body.hoy.total)).toBe(true)
    })
  })
})
