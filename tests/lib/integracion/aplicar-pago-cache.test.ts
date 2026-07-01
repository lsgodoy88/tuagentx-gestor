import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    carteraCache: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { aplicarPagoEnCache } from '@/lib/integracion/sync'
import { prisma } from '@/lib/prisma'

const INTEGRACION_ID = 'int-1'
const EMPRESA_ID = 'empresa-1'
const CLIENTE_API_ID = 'cliente-api-1'

// Deudas base reutilizables en cada test
const deudaBase = (id: string, saldo: number, extras = {}) => ({
  id,
  saldo,
  valor: 500000,
  abono: 0,
  estado: 'mora',
  numeroFactura: 1000 + parseInt(id.replace('sd-', '')),
  ...extras,
})

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma as any).carteraCache.update.mockResolvedValue({})
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockCache(deudas: any[]) {
  ;(prisma as any).carteraCache.findUnique.mockResolvedValue({
    deudas,
    saldoPendiente: deudas.reduce((s, d) => s + d.saldo, 0),
  })
}

function captureUpdate() {
  return (prisma as any).carteraCache.update.mock.calls[0]?.[0]?.data
}

// ── Suite principal ───────────────────────────────────────────────────────────

describe('aplicarPagoEnCache — todos los escenarios', () => {

  // ── Caso nominal ──────────────────────────────────────────────────────────

  describe('caso nominal: pago simple 1 factura', () => {
    it('actualiza saldo con el valor exacto del recibo (saldoFinal absoluto)', async () => {
      mockCache([deudaBase('sd-1', 333800)])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 283800 },
      ])

      const data = captureUpdate()
      expect(data.deudas[0].saldo).toBe(283800)
      expect(data.saldoPendiente).toBe(283800)
      expect(data.totalDeudas).toBe(1)
    })

    it('el saldoFinal del cache coincide con saldoDespues del recibo (fuente única)', async () => {
      // Simula exactamente el flujo real: reciboPago.detalles[0].saldoDespues
      // se calcula como Math.max(0, saldoAntes - monto - descuento)
      const saldoAntes = 542100
      const monto = 50000
      const descuento = 22777
      const saldoDespues = Math.max(0, saldoAntes - monto - descuento) // 469323

      mockCache([deudaBase('sd-1', saldoAntes)])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: saldoDespues },
      ])

      const data = captureUpdate()
      expect(data.deudas[0].saldo).toBe(469323)
      expect(data.saldoPendiente).toBe(469323)
    })
  })

  // ── Multi-factura ──────────────────────────────────────────────────────────

  describe('recibo multi-factura', () => {
    it('actualiza múltiples deudas en un solo call', async () => {
      mockCache([
        deudaBase('sd-1', 200000),
        deudaBase('sd-2', 150000),
        deudaBase('sd-3', 100000),
      ])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 150000 },
        { syncDeudaId: 'sd-2', saldoFinal: 80000 },
      ])

      const data = captureUpdate()
      const byId = Object.fromEntries(data.deudas.map((d: any) => [d.id, d.saldo]))
      expect(byId['sd-1']).toBe(150000)
      expect(byId['sd-2']).toBe(80000)
      expect(byId['sd-3']).toBe(100000) // no tocada
      expect(data.saldoPendiente).toBe(330000)
    })

    it('saldoPendiente es la suma exacta de TODAS las deudas, no solo las afectadas', async () => {
      mockCache([
        deudaBase('sd-1', 100000),
        deudaBase('sd-2', 200000), // esta NO se toca
      ])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 50000 },
      ])

      const data = captureUpdate()
      expect(data.saldoPendiente).toBe(250000) // 50000 + 200000
    })
  })

  // ── Deuda saldada completamente ────────────────────────────────────────────

  describe('deuda que queda en $0', () => {
    it('se elimina del array de deudas (filtro saldo > 0)', async () => {
      mockCache([
        deudaBase('sd-1', 50000),
        deudaBase('sd-2', 100000),
      ])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 0 },
      ])

      const data = captureUpdate()
      expect(data.deudas).toHaveLength(1)
      expect(data.deudas[0].id).toBe('sd-2')
      expect(data.totalDeudas).toBe(1)
      expect(data.saldoPendiente).toBe(100000)
    })

    it('todas las deudas saldadas → array vacío, saldoPendiente $0', async () => {
      mockCache([
        deudaBase('sd-1', 50000),
        deudaBase('sd-2', 75000),
      ])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 0 },
        { syncDeudaId: 'sd-2', saldoFinal: 0 },
      ])

      const data = captureUpdate()
      expect(data.deudas).toHaveLength(0)
      expect(data.saldoPendiente).toBe(0)
      expect(data.totalDeudas).toBe(0)
    })
  })

  // ── saldoFinal = 0 nunca puede ser negativo ───────────────────────────────

  describe('protección contra saldo negativo', () => {
    it('saldoFinal=0 ya garantiza no-negativo (Math.max viene del recibo)', async () => {
      // El reciboPago.detalles[i].saldoDespues ya tiene Math.max(0,...) aplicado
      // en pago-sync/route.ts — aquí solo verificamos que el cache lo refleja tal cual
      mockCache([deudaBase('sd-1', 100000)])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 0 },
      ])

      const data = captureUpdate()
      expect(data.deudas.find((d: any) => d.id === 'sd-1')).toBeUndefined() // filtrado
      expect(data.saldoPendiente).toBe(0)
    })
  })

  // ── Cache inexistente ──────────────────────────────────────────────────────

  describe('cache no existe aún', () => {
    it('no llama update si findUnique retorna null (el nocturno lo generará)', async () => {
      ;(prisma as any).carteraCache.findUnique.mockResolvedValue(null)

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 100000 },
      ])

      expect((prisma as any).carteraCache.update).not.toHaveBeenCalled()
    })
  })

  // ── Lista de ajustes vacía ─────────────────────────────────────────────────

  describe('ajustes vacíos', () => {
    it('no hace ninguna query si no hay ajustes', async () => {
      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [])

      expect((prisma as any).carteraCache.findUnique).not.toHaveBeenCalled()
      expect((prisma as any).carteraCache.update).not.toHaveBeenCalled()
    })
  })

  // ── syncDeudaId no existe en el cache ────────────────────────────────────

  describe('syncDeudaId desconocido (no está en el cache)', () => {
    it('ignora el ajuste y no modifica las deudas existentes', async () => {
      mockCache([deudaBase('sd-1', 100000)])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-INEXISTENTE', saldoFinal: 50000 },
      ])

      const data = captureUpdate()
      expect(data.deudas[0].saldo).toBe(100000) // sin cambios
      expect(data.saldoPendiente).toBe(100000)
    })
  })

  // ── Error de BD ───────────────────────────────────────────────────────────

  describe('error de BD en update', () => {
    it('no propaga la excepción (catch silencioso — no crítico)', async () => {
      mockCache([deudaBase('sd-1', 100000)])
      ;(prisma as any).carteraCache.update.mockRejectedValue(new Error('DB timeout'))

      // No debe lanzar — el nocturno corregirá
      await expect(
        aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
          { syncDeudaId: 'sd-1', saldoFinal: 50000 },
        ])
      ).resolves.toBeUndefined()
    })

    it('error en findUnique tampoco propaga', async () => {
      ;(prisma as any).carteraCache.findUnique.mockRejectedValue(new Error('connection lost'))

      await expect(
        aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
          { syncDeudaId: 'sd-1', saldoFinal: 50000 },
        ])
      ).resolves.toBeUndefined()
    })
  })

  // ── Idempotencia ──────────────────────────────────────────────────────────

  describe('idempotencia', () => {
    it('aplicar el mismo saldoFinal dos veces da el mismo resultado', async () => {
      mockCache([deudaBase('sd-1', 333800)])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 283800 },
      ])
      const data1 = captureUpdate()

      // Segunda llamada con mismo saldoFinal (retry del request)
      vi.clearAllMocks()
      ;(prisma as any).carteraCache.update.mockResolvedValue({})
      // El cache ya tiene 283800 después del primer update
      mockCache([{ ...deudaBase('sd-1', 283800) }])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 283800 },
      ])
      const data2 = captureUpdate()

      expect(data1.deudas[0].saldo).toBe(data2.deudas[0].saldo)
      expect(data1.saldoPendiente).toBe(data2.saldoPendiente)
    })
  })

  // ── Preserva campos existentes de la deuda ────────────────────────────────

  describe('integridad del objeto deuda', () => {
    it('solo modifica saldo — no toca valor, estado, numeroFactura, etc.', async () => {
      const deudaOriginal = {
        id: 'sd-1',
        saldo: 333800,
        valor: 542100,
        abono: 208300,
        estado: 'mora',
        numeroFactura: 3785,
        diasCredito: 30,
        fechaVencimiento: '2026-05-25T00:00:00Z',
      }
      mockCache([deudaOriginal])

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 283800 },
      ])

      const data = captureUpdate()
      const deudaActualizada = data.deudas[0]
      expect(deudaActualizada.saldo).toBe(283800)          // actualizado
      expect(deudaActualizada.valor).toBe(542100)           // preservado
      expect(deudaActualizada.abono).toBe(208300)           // preservado
      expect(deudaActualizada.estado).toBe('mora')          // preservado
      expect(deudaActualizada.numeroFactura).toBe(3785)     // preservado
      expect(deudaActualizada.diasCredito).toBe(30)         // preservado
    })
  })

  // ── ultimaActualizacion siempre se actualiza ──────────────────────────────

  describe('metadata del cache', () => {
    it('ultimaActualizacion es una fecha reciente', async () => {
      mockCache([deudaBase('sd-1', 100000)])
      const antes = new Date()

      await aplicarPagoEnCache(CLIENTE_API_ID, INTEGRACION_ID, EMPRESA_ID, [
        { syncDeudaId: 'sd-1', saldoFinal: 50000 },
      ])

      const data = captureUpdate()
      expect(data.ultimaActualizacion).toBeInstanceOf(Date)
      expect(data.ultimaActualizacion.getTime()).toBeGreaterThanOrEqual(antes.getTime())
    })
  })

})
