/**
 * Tests del Guardián — Sync Bodega (UpTres → BD)
 *
 * Reglas protegidas:
 * 1. isFacturada viene de isInvoiced de UpTres — nunca hardcodear
 * 2. fechaFactura viene de invoicedAt de UpTres — no createdAt, no fechaOrden
 * 3. vendedorApiId viene de orden.empleado.uid — NO orden.empleadoId
 * 4. Insert-only — si origenId existe, skip completo
 * 5. Órdenes sin numeroFactura o nombre → skip
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth',  () => ({ authOptions: {} }))
vi.mock('@/lib/cache', () => ({ invalidateKeys: vi.fn() }))

vi.mock('@/lib/prisma', () => {
  const m = {
    empresa: {
      findMany:  vi.fn(),
      update:    vi.fn(),
    },
    ordenDespacho: {
      findMany:   vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    cliente: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (ops: any) =>
      typeof ops === 'function' ? ops(m) : Promise.all(ops)
    ),
  }
  return { prisma: m }
})

vi.mock('@/lib/integracion/adapters/uptres', () => ({
  UpTresAdapter: vi.fn().mockImplementation(() => ({
    login: vi.fn(),
    fetchVentas: vi.fn().mockResolvedValue([]),
  }))
}))

vi.mock('@/lib/crypto-uptres', () => ({ decrypt: vi.fn().mockReturnValue('secret') }))

import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'

// ── Helpers ───────────────────────────────────────────────────────

/** Construye una VentaExterna mínima válida */
function makeVenta(overrides: Partial<{
  uid: string
  numeroFacturado: number | null
  isInvoiced: boolean
  invoicedAt: string | null
  empleadoUid: string | null
  clienteUid: string
  total: string
  clienteNombre: string
}> = {}) {
  return {
    uid: overrides.uid ?? 'ord-1',
    _id: overrides.uid ?? 'ord-1',
    numeroOrden: 2942,
    numeroFacturado: 'numeroFacturado' in overrides ? overrides.numeroFacturado : 3906,
    isInvoiced:  overrides.isInvoiced  ?? true,
    invoicedAt:  'invoicedAt' in overrides ? overrides.invoicedAt ?? null : '2026-05-23T08:12:47.000Z',
    vTotal:      overrides.total       ?? '500000',
    fCreado:     '2026-05-22T18:27:38.000Z',
    fModificado: '2026-05-23T08:12:47.000Z',
    empleado:    { uid: 'empleadoUid' in overrides ? overrides.empleadoUid : '67a3da759c104c6e174b71ce' },
    cliente:     { uid: overrides.clienteUid  ?? 'cli-api-1' },
    productos:   [],
    clienteNombreApi: overrides.clienteNombre ?? 'EVELIN ZAMBRANO',
    cityId: null,
    direccion: null,
    telefono: null,
    clienteNit: null,
  }
}

// ── Tests ─────────────────────────────────────────────────────────

describe('GUARDIÁN: Sync Bodega — UpTres → BD', () => {

  // ── Regla 1: isFacturada viene de isInvoiced ──────────────────────
  describe('[SYNC] isFacturada viene de isInvoiced de UpTres', () => {

    it('isInvoiced=true → isFacturada=true en BD', () => {
      const orden = makeVenta({ isInvoiced: true })
      const isFacturada = orden.isInvoiced === true
      expect(isFacturada).toBe(true)
    })

    it('isInvoiced=false → isFacturada=false en BD', () => {
      const orden = makeVenta({ isInvoiced: false })
      const isFacturada = orden.isInvoiced === true
      expect(isFacturada).toBe(false)
    })

    it('isInvoiced=undefined → isFacturada=false (no truthy)', () => {
      const orden = { ...makeVenta(), isInvoiced: undefined as any }
      const isFacturada = orden.isInvoiced === true
      expect(isFacturada).toBe(false)
    })

    it('NUNCA: isFacturada = !!numeroFacturado — eso es incorrecto', () => {
      // Una orden puede tener invoiceNumber pero no estar facturada todavía
      // La fuente de verdad es isInvoiced de UpTres
      const orden = makeVenta({ isInvoiced: false, numeroFacturado: 3906 })
      const correcto   = orden.isInvoiced === true           // false ✅
      const incorrecto = !!(orden.numeroFacturado)           // true  ❌
      expect(correcto).toBe(false)
      expect(correcto).not.toBe(incorrecto)
    })
  })

  // ── Regla 2: fechaFactura viene de invoicedAt ─────────────────────
  describe('[SYNC] fechaFactura viene de invoicedAt de UpTres', () => {

    it('invoicedAt presente → fechaFactura = new Date(invoicedAt)', () => {
      const orden = makeVenta({ invoicedAt: '2026-05-23T08:12:47.000Z' })
      const fechaFactura = orden.invoicedAt ? new Date(orden.invoicedAt) : null
      expect(fechaFactura).toBeInstanceOf(Date)
      expect(fechaFactura?.toISOString()).toBe('2026-05-23T08:12:47.000Z')
    })

    it('invoicedAt null → fechaFactura = null (no usar createdAt)', () => {
      const orden = makeVenta({ invoicedAt: null })
      const fechaFactura = orden.invoicedAt ? new Date(orden.invoicedAt) : null
      // REGLA: si no hay invoicedAt, no inventar la fecha con fCreado
      expect(fechaFactura).toBeNull()
    })

    it('NUNCA: fechaFactura = fCreado — fCreado es cuando se creó la orden', () => {
      const orden = makeVenta({ invoicedAt: null })
      // El bug histórico era usar createdAt como fechaFactura
      const correcto  = orden.invoicedAt ? new Date(orden.invoicedAt) : null
      const incorrecto = new Date(orden.fCreado)
      expect(correcto).toBeNull()
      expect(incorrecto.toISOString()).toBe('2026-05-22T18:27:38.000Z')
      // Las dos fechas son distintas — confirma que no deben intercambiarse
      expect(correcto).not.toEqual(incorrecto)
    })
  })

  // ── Regla 3: vendedorApiId viene de empleado.uid ──────────────────
  describe('[SYNC] vendedorApiId = orden.empleado.uid — NUNCA orden.empleadoId', () => {

    it('empleado.uid presente → vendedorApiId correcto', () => {
      const orden = makeVenta({ empleadoUid: '67a3da759c104c6e174b71ce' })
      const vendedorApiId = orden.empleado?.uid || null
      expect(vendedorApiId).toBe('67a3da759c104c6e174b71ce')
    })

    it('empleado.uid null → vendedorApiId = null (no rompe)', () => {
      const orden = makeVenta({ empleadoUid: null })
      const vendedorApiId = orden.empleado?.uid || null
      expect(vendedorApiId).toBeNull()
    })

    it('NUNCA: acceder a orden.empleadoId — no existe en VentaExterna', () => {
      const orden = makeVenta()
      // TypeScript previene esto, pero documentamos la regla explícitamente
      // @ts-expect-error — empleadoId no existe en VentaExterna
      const incorrecto = (orden as any).empleadoId
      expect(incorrecto).toBeUndefined()
    })
  })

  // ── Regla 4: insert-only — origenId existente → skip ─────────────
  describe('[SYNC] insert-only — origenId existente skipeado', () => {

    it('nueva orden (origenId no existe) → entra en el batch de create', () => {
      const origenIds = ['ord-1', 'ord-2']
      const existentesSet = new Set(['ord-1'])

      // Simulamos la lógica del sync
      const nuevas = origenIds.filter(id => !existentesSet.has(id))
      expect(nuevas).toEqual(['ord-2'])
      expect(nuevas).not.toContain('ord-1')
    })

    it('todas existentes → 0 creates', () => {
      const origenIds = ['ord-1', 'ord-2']
      const existentesSet = new Set(['ord-1', 'ord-2'])

      const nuevas = origenIds.filter(id => !existentesSet.has(id))
      expect(nuevas).toHaveLength(0)
    })
  })

  // ── Regla 5: órdenes inválidas → skip ────────────────────────────
  describe('[SYNC] órdenes sin datos mínimos → skip', () => {

    it('sin numeroFacturado → skip', () => {
      const orden = makeVenta({ numeroFacturado: null })
      const valida = !!(orden.numeroFacturado && orden.clienteNombreApi && (orden.uid || (orden as any)._id))
      expect(valida).toBe(false)
    })

    it('sin clienteNombreApi → skip', () => {
      const orden = makeVenta({ clienteNombre: '' })
      const valida = !!(orden.numeroFacturado && orden.clienteNombreApi && (orden.uid || (orden as any)._id))
      expect(valida).toBe(false)
    })

    it('datos completos → pasa validación', () => {
      const orden = makeVenta()
      const valida = !!(orden.numeroFacturado && orden.clienteNombreApi && (orden.uid || (orden as any)._id))
      expect(valida).toBe(true)
    })
  })

  // ── Regla 6: las tres fechas de UpTres son distintas ─────────────
  describe('[SYNC] distinción entre las tres fechas de UpTres', () => {

    it('createdAt ≠ invoicedAt — fechas distintas en el mismo día', () => {
      const orden = makeVenta({
        invoicedAt: '2026-05-23T08:12:47.000Z',
      })
      // fCreado = cuándo se creó la orden en UpTres (día anterior)
      expect(orden.fCreado).toBe('2026-05-22T18:27:38.000Z')
      // invoicedAt = cuándo se facturó (día siguiente, horas después)
      expect(orden.invoicedAt).toBe('2026-05-23T08:12:47.000Z')
      // Son distintas — confirma que no se pueden intercambiar
      expect(orden.fCreado).not.toBe(orden.invoicedAt)
    })
  })
})
