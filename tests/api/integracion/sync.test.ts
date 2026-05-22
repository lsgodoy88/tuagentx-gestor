import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    integracion: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    cliente: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    empleado: { updateMany: vi.fn() },
    syncEmpleado: { upsert: vi.fn() },
    syncDeuda: { findMany: vi.fn() },
    pagoCartera: { findMany: vi.fn() },
    empresa: { update: vi.fn() },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === 'function') {
        const { prisma: p } = await import('@/lib/prisma')
        return ops(p)
      }
      return Array.isArray(ops) ? Promise.all(ops) : ops
    }),
    syncLog: { create: vi.fn() },
    carteraCache: { deleteMany: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/crypto-uptres', () => ({ decrypt: vi.fn(() => 'decrypted-secret') }))

vi.mock('@/lib/integracion/sync', () => ({
  crearAdaptador: vi.fn(() => ({
    login: vi.fn().mockResolvedValue(undefined),
    fetchClientes: vi.fn().mockResolvedValue([]),
    fetchEmpleados: vi.fn().mockResolvedValue([]),
    fetchDeudas: vi.fn().mockResolvedValue([]),
    fetchDeudasCliente: vi.fn().mockResolvedValue([]),
    fetchVentas: vi.fn().mockResolvedValue([]),
  })),
  sincronizarDeudas: vi.fn().mockResolvedValue(new Set()),
  marcarZombis: vi.fn().mockResolvedValue(0),
  actualizarCache: vi.fn().mockResolvedValue(undefined),
  refrescarDeudasConPagosPendientes: vi.fn().mockResolvedValue({ clientes: 0, confrontados: 0, deudasActualizadas: 0 }),
}))
vi.mock('@/lib/integracion/venta-mes', () => ({
  recalcularVentasMesImpulsos: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/integracion/sync/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const SUPERVISOR = { user: { id: 'usr-sup', role: 'supervisor', empresaId: 'emp-1' } } as any
const VENDEDOR = { user: { id: 'usr-v', role: 'vendedor', empresaId: 'emp-1' } } as any
const PUBLICO = { user: { id: 'usr-p', role: 'cliente', empresaId: 'emp-1' } } as any
const EMPRESA = { user: { id: 'emp-1', role: 'empresa' } } as any

const makeReq = (body: any, headers: Record<string, string> = {}) => {
  return new NextRequest('http://localhost/api/integracion/sync', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const integracionBase = {
  id: 'intg-1',
  empresaId: 'emp-1',
  tipo: 'uptres',
  activa: true,
  syncInicial: false,
  ultimaSync: null,
  config: { apiKey: 'key', apiSecret: 'enc-secret' },
}

describe('POST /api/integracion/sync — orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-secret-test'
    // Defaults: todas las queries devuelven arrays vacíos / no-ops
    vi.mocked((prisma as any).cliente.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).cliente.createMany).mockResolvedValue({ count: 0 })
    vi.mocked((prisma as any).cliente.update).mockResolvedValue({})
    vi.mocked((prisma as any).empleado.updateMany).mockResolvedValue({ count: 0 })
    vi.mocked((prisma as any).syncEmpleado.upsert).mockResolvedValue({})
    vi.mocked((prisma as any).syncDeuda.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).pagoCartera.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).empresa.update).mockResolvedValue({})
    vi.mocked((prisma as any).integracion.update).mockResolvedValue({})
    vi.mocked((prisma as any).syncLog.create).mockResolvedValue({})
    vi.mocked((prisma as any).carteraCache.deleteMany).mockResolvedValue({ count: 0 })
    vi.mocked((prisma as any).carteraCache.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).carteraCache.upsert).mockResolvedValue({})
  })

  describe('cron (x-cron-secret header)', () => {
    it('header matches CRON_SECRET → loopea todas las integraciones activas (no requiere sesión)', async () => {
      vi.mocked((prisma as any).integracion.findMany).mockResolvedValue([
        { ...integracionBase, id: 'intg-1', empresaId: 'emp-1' },
        { ...integracionBase, id: 'intg-2', empresaId: 'emp-2' },
      ])

      const res = await POST(makeReq({ tipo: 'delta' }, { 'x-cron-secret': 'cron-secret-test' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.resultados).toHaveLength(2)
      expect(body.resultados[0].empresaId).toBe('emp-1')
      expect(body.resultados[1].empresaId).toBe('emp-2')
      expect(getServerSession).not.toHaveBeenCalled()
    })

    it('filtra integraciones por tipo uptres + activa', async () => {
      vi.mocked((prisma as any).integracion.findMany).mockResolvedValue([])
      await POST(makeReq({ tipo: 'delta' }, { 'x-cron-secret': 'cron-secret-test' }))
      expect((prisma as any).integracion.findMany).toHaveBeenCalledWith({
        where: { tipo: 'uptres', activa: true }
      })
    })

    it('cron con tipo != delta → 400', async () => {
      const res = await POST(makeReq({ tipo: 'inicial' }, { 'x-cron-secret': 'cron-secret-test' }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/delta/i)
    })

    it.skip('una integración falla → se reporta error pero NO rompe el batch [TODO: mock ejecutarDelta interno]', async () => {
      vi.mocked((prisma as any).integracion.findMany).mockResolvedValue([
        { ...integracionBase, id: 'intg-bad', empresaId: 'emp-bad', config: null },
        { ...integracionBase, id: 'intg-ok', empresaId: 'emp-ok' },
      ])

      const res = await POST(makeReq({ tipo: 'delta' }, { 'x-cron-secret': 'cron-secret-test' }))
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.resultados).toHaveLength(2)
      expect(body.resultados[0].ok).toBe(false)
      expect(body.resultados[0].error).toBeDefined()
      expect(body.resultados[1].ok).toBe(true)
    })

    it('header secret no matches → cae al flujo manual (requiere sesión, 401 sin ella)', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await POST(makeReq({ tipo: 'delta' }, { 'x-cron-secret': 'wrong' }))
      expect(res.status).toBe(401)
    })

    it('sin header x-cron-secret → flujo manual', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await POST(makeReq({ tipo: 'delta' }))
      expect(res.status).toBe(401)
    })
  })

  describe('manual: autenticación + autorización', () => {
    it('sin sesión → 401', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)
      const res = await POST(makeReq({ tipo: 'delta' }))
      expect(res.status).toBe(401)
    })

    it('rol fuera de ROLES_SUPERVISOR_VENDEDOR → 403', async () => {
      vi.mocked(getServerSession).mockResolvedValue(PUBLICO)
      const res = await POST(makeReq({ tipo: 'delta' }))
      expect(res.status).toBe(403)
    })

    it('rol vendedor: pasa el guard', async () => {
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)
      const res = await POST(makeReq({ tipo: 'delta' }))
      expect(res.status).toBe(400)
    })

    it('rol supervisor: pasa el guard', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SUPERVISOR)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)
      const res = await POST(makeReq({ tipo: 'delta' }))
      expect(res.status).toBe(400)
    })

    it('rol empresa: pasa el guard', async () => {
      vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)
      const res = await POST(makeReq({ tipo: 'delta' }))
      expect(res.status).toBe(400)
    })

    it('sin integración activa → 400', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SUPERVISOR)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)
      const res = await POST(makeReq({ tipo: 'delta' }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/integraci[oó]n/i)
    })
  })

  describe('manual: tipo dispatch', () => {
    beforeEach(() => {
      vi.mocked(getServerSession).mockResolvedValue(SUPERVISOR)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(integracionBase)
    })

    it.skip('tipo "delta" → ejecuta delta exitosamente [TODO: mock ejecutarDelta interno]', async () => {
      const res = await POST(makeReq({ tipo: 'delta' }))
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.clientes).toBeDefined()
      expect(body.deudas).toBeDefined()
      expect(body.logs).toBeDefined()
    })

    it('tipo "inicial" con syncInicial=false → ejecuta inicial', async () => {
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue({
        ...integracionBase, syncInicial: false,
      })
      const res = await POST(makeReq({ tipo: 'inicial' }))
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('tipo "inicial" con syncInicial=true → 400 "ya ejecutado"', async () => {
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue({
        ...integracionBase, syncInicial: true,
      })
      const res = await POST(makeReq({ tipo: 'inicial' }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/ya ejecutado/i)
    })

    it('tipo "bla" → 400 con mensaje sobre tipos válidos', async () => {
      const res = await POST(makeReq({ tipo: 'bla' }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/delta.*inicial/i)
    })
  })

  describe('manual: error path escribe syncLog', () => {
    it('error en ejecución → 500 + intenta crear syncLog con estado=error', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SUPERVISOR)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(integracionBase)
      vi.mocked((prisma as any).cliente.findMany).mockRejectedValueOnce(new Error('DB caída'))

      const res = await POST(makeReq({ tipo: 'delta' }))
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.ok).toBe(false)
      expect(body.error).toMatch(/DB caída/)
      expect((prisma as any).syncLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          estado: 'error',
          errores: expect.objectContaining({ message: 'DB caída' }),
        })
      }))
    })

    it('error dentro del error-handler → no crashea, devuelve 500 con el error original', async () => {
      vi.mocked(getServerSession).mockResolvedValue(SUPERVISOR)
      // Primera consulta de integración (al inicio) OK
      // Segunda (dentro del catch) tira → el try interno la swallowea
      vi.mocked((prisma as any).integracion.findFirst)
        .mockResolvedValueOnce(integracionBase)
        .mockRejectedValueOnce(new Error('DB del todo caída'))
      vi.mocked((prisma as any).cliente.findMany).mockRejectedValueOnce(new Error('boom'))

      const res = await POST(makeReq({ tipo: 'delta' }))
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toMatch(/boom/) // mantiene el error original
    })
  })

  describe('manual delta: separación cartera vs impulsos', () => {
    it('supervisor manual → NO llama recalcularVentasMesImpulsos (cartera quirúrgica)', async () => {
      const { recalcularVentasMesImpulsos } = await import('@/lib/integracion/venta-mes')
      vi.mocked(getServerSession).mockResolvedValue(SUPERVISOR)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(integracionBase)

      await POST(makeReq({ tipo: 'delta' }))

      expect(recalcularVentasMesImpulsos).not.toHaveBeenCalled()
    })

    it('vendedor manual → NO llama recalcularVentasMesImpulsos (solo sus deudas)', async () => {
      const { recalcularVentasMesImpulsos } = await import('@/lib/integracion/venta-mes')
      vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(integracionBase)

      await POST(makeReq({ tipo: 'delta' }))

      expect(recalcularVentasMesImpulsos).not.toHaveBeenCalled()
    })
  })
})
