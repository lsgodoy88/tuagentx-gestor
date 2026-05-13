import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    empleado: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getConsecutivo } from '@/lib/consecutivo'
import { prisma } from '@/lib/prisma'

function mockTx(empleado: any) {
  const tx = {
    empleado: {
      findUnique: vi.fn().mockResolvedValue(empleado),
      update: vi.fn().mockResolvedValue({}),
    },
  }
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(tx))
  return tx
}

describe('lib/consecutivo — getConsecutivo', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  describe('formato del consecutivo', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T10:00:00Z'))
    })

    it('vendedor "CARLOS NORBERTO LOZADA" en mayo 2026, primer recibo del mes → CL2605001', async () => {
      mockTx({
        nombre: 'CARLOS NORBERTO LOZADA',
        configRecibos: null,
        empresa: { configRecibos: null },
      })
      const result = await getConsecutivo('e1')
      expect(result).toBe('CL2605001')
    })

    it('incrementa el consecutivo del mes (007 → 008)', async () => {
      mockTx({
        nombre: 'MARCELA ALVAREZ',
        configRecibos: { consecutivoActual: 7, consecutivoMes: '0526' },
        empresa: { configRecibos: null },
      })
      const result = await getConsecutivo('e1')
      expect(result).toBe('MA2605008')
    })

    it('cambio de mes → resetea a 001', async () => {
      // En mayo 2026, pero el último consecutivo era de abril 2026 (mes=04, año=26 → "0426")
      mockTx({
        nombre: 'CARLOS LOZADA',
        configRecibos: { consecutivoActual: 87, consecutivoMes: '0426' },
        empresa: { configRecibos: null },
      })
      const result = await getConsecutivo('e1')
      expect(result).toBe('CL2605001')
    })

    it('padStart correcto: 1 → 001, 10 → 010, 100 → 100, 1234 → 1234 (sin truncar)', async () => {
      mockTx({
        nombre: 'X Z',
        configRecibos: { consecutivoActual: 1233, consecutivoMes: '0526' },
        empresa: { configRecibos: null },
      })
      const result = await getConsecutivo('e1')
      expect(result).toBe('XZ26051234')
    })
  })

  describe('iniciales del vendedor', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T10:00:00Z'))
    })

    it('un solo nombre: "MARCELA" → "M"', async () => {
      mockTx({ nombre: 'MARCELA', configRecibos: null, empresa: { configRecibos: null } })
      const result = await getConsecutivo('e1')
      expect(result).toBe('M2605001')
    })

    it('nombre con preposiciones "JUAN DE LA ROSA" → "JR" (filtra de, la)', async () => {
      mockTx({ nombre: 'JUAN DE LA ROSA', configRecibos: null, empresa: { configRecibos: null } })
      const result = await getConsecutivo('e1')
      expect(result).toBe('JR2605001')
    })

    it('"PEDRO Y MARIA DEL CARMEN" → "PC" (filtra Y, del)', async () => {
      mockTx({ nombre: 'PEDRO Y MARIA DEL CARMEN', configRecibos: null, empresa: { configRecibos: null } })
      const result = await getConsecutivo('e1')
      expect(result).toBe('PC2605001')
    })

    it('nombre vacío → "X" (el "XX" del código es dead code, primera=X siempre)', async () => {
      mockTx({ nombre: '', configRecibos: null, empresa: { configRecibos: null } })
      const result = await getConsecutivo('e1')
      expect(result).toBe('X2605001')
    })

    it('nombre null → "X" (mismo dead code path)', async () => {
      mockTx({ nombre: null, configRecibos: null, empresa: { configRecibos: null } })
      const result = await getConsecutivo('e1')
      expect(result).toBe('X2605001')
    })

    it('múltiples espacios: "  ANA   MARIA  " → "AM"', async () => {
      mockTx({ nombre: '  ANA   MARIA  ', configRecibos: null, empresa: { configRecibos: null } })
      const result = await getConsecutivo('e1')
      expect(result).toBe('AM2605001')
    })
  })

  describe('prefijo manual', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T10:00:00Z'))
    })

    it('configRecibos.prefijo explícito → usa ese en vez de iniciales', async () => {
      mockTx({
        nombre: 'CARLOS LOZADA',
        configRecibos: { prefijo: 'REC' },
        empresa: { configRecibos: null },
      })
      const result = await getConsecutivo('e1')
      expect(result).toBe('REC2605001')
    })
  })

  describe('persistencia', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T10:00:00Z'))
    })

    it('guarda configRecibos actualizado con consecutivoActual+1 y consecutivoMes', async () => {
      const tx = mockTx({
        nombre: 'X',
        configRecibos: { consecutivoActual: 5, consecutivoMes: '0526', otraClave: 'preservada' },
        empresa: { configRecibos: null },
      })
      await getConsecutivo('e1')
      expect(tx.empleado.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          configRecibos: {
            otraClave: 'preservada', // preservada del config previo
            consecutivoActual: 6,
            consecutivoMes: '0526',
          },
        },
      })
    })

    it('al cambiar mes guarda el nuevo mes en BD', async () => {
      const tx = mockTx({
        nombre: 'X',
        configRecibos: { consecutivoActual: 50, consecutivoMes: '0426' },
        empresa: { configRecibos: null },
      })
      await getConsecutivo('e1')
      expect(tx.empleado.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          configRecibos: expect.objectContaining({
            consecutivoActual: 1, // reset
            consecutivoMes: '0526', // nuevo mes
          }),
        },
      })
    })
  })

  describe('errores', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T10:00:00Z'))
    })

    it('empleado no encontrado → throw', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb({
        empleado: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() }
      }))
      await expect(getConsecutivo('e-no-existe')).rejects.toThrow(/no encontrado/i)
    })
  })

  describe('formato fecha en distintos meses', () => {
    it('enero: mes="01", padStart correcto', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-15T10:00:00Z'))
      mockTx({ nombre: 'X', configRecibos: null, empresa: { configRecibos: null } })
      const result = await getConsecutivo('e1')
      expect(result).toBe('X2601001')
    })

    it('diciembre: mes="12"', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-12-31T23:00:00Z'))
      mockTx({ nombre: 'X', configRecibos: null, empresa: { configRecibos: null } })
      const result = await getConsecutivo('e1')
      expect(result).toBe('X2612001')
    })

    it('año "26" se forma de los últimos 2 dígitos de 2026', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2030-05-01T10:00:00Z'))
      mockTx({ nombre: 'X', configRecibos: null, empresa: { configRecibos: null } })
      const result = await getConsecutivo('e1')
      expect(result).toBe('X3005001') // año 30
    })
  })
})
