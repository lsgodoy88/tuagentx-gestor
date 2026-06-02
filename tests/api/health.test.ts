import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mocks (vi.mock se hoistea — antes de los imports del endpoint)
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    integracion: { findFirst: vi.fn() },
  },
}))

import { GET } from '@/app/api/health/route'
import { prisma } from '@/lib/prisma'

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.REDIS_HOST // saltarse el check de Redis en todos los tests
  })

  describe('BD reachable + sync reciente → 200 healthy', () => {
    it('BD OK + ultimaSync hace 2h → healthy true, status 200', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as any)
      const haceDosHoras = new Date(Date.now() - 2 * 3600 * 1000)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue({ ultimaSync: haceDosHoras })

      const res = await GET()
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.healthy).toBe(true)
      expect(body.checks.db.ok).toBe(true)
      expect(body.checks.lastSync.ok).toBe(true)
      expect(body.checks.lastSync.hours).toBe(2)
    })

    it('sin integración activa → healthy true (no falla, solo no reporta)', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as any)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)

      const res = await GET()
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.healthy).toBe(true)
      expect(body.checks.db.ok).toBe(true)
      expect(body.checks.lastSync).toBeUndefined()
    })
  })

  describe('BD caída → 503 unhealthy', () => {
    it('queryRaw lanza error → healthy false, status 503', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('connection refused'))
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)

      const res = await GET()
      const body = await res.json()

      expect(res.status).toBe(503)
      expect(body.healthy).toBe(false)
      expect(body.checks.db.ok).toBe(false)
      expect(body.checks.db.error).toBe('connection refused')
    })
  })

  describe('sync vieja — estado de negocio, no rompe healthy', () => {
    // lastSync es informativo — el endpoint siempre devuelve healthy:true si la DB responde
    // Ver: app/api/health/route.ts línea 54 "lastSync es estado de negocio — no rompe healthy"

    it('ultimaSync hace 30h → healthy true, lastSync.ok false', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as any)
      const hace30h = new Date(Date.now() - 30 * 3600 * 1000)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue({ ultimaSync: hace30h })

      const res = await GET()
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.healthy).toBe(true)
      expect(body.checks.lastSync.ok).toBe(false)
      expect(body.checks.lastSync.hours).toBe(30)
    })

    it('límite exacto 26h → healthy true, lastSync.ok false (>=26)', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as any)
      const hace26h = new Date(Date.now() - 26 * 3600 * 1000)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue({ ultimaSync: hace26h })

      const res = await GET()
      const body = await res.json()
      expect(body.healthy).toBe(true)
      expect(body.checks.lastSync.ok).toBe(false)
    })

    it('límite seguro 25h → healthy true, lastSync.ok true', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as any)
      const hace25h = new Date(Date.now() - 25 * 3600 * 1000)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue({ ultimaSync: hace25h })

      const res = await GET()
      const body = await res.json()
      expect(body.healthy).toBe(true)
      expect(body.checks.lastSync.ok).toBe(true)
    })
  })

  describe('integracion.findFirst falla → no afecta healthy', () => {
    it('error en lastSync se reporta pero healthy depende del resto', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as any)
      vi.mocked((prisma as any).integracion.findFirst).mockRejectedValue(new Error('query timeout'))

      const res = await GET()
      const body = await res.json()

      expect(body.healthy).toBe(true)
      expect(res.status).toBe(200)
      expect(body.checks.lastSync.ok).toBe(false)
      expect(body.checks.lastSync.error).toBe('query timeout')
    })
  })

  describe('estructura del response', () => {
    it('incluye timestamp ISO + uptime + totalMs', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as any)
      vi.mocked((prisma as any).integracion.findFirst).mockResolvedValue(null)

      const res = await GET()
      const body = await res.json()

      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(typeof body.checks.uptime).toBe('number')
      expect(typeof body.checks.totalMs).toBe('number')
      expect(body.checks.totalMs).toBeGreaterThanOrEqual(0)
    })
  })
})
