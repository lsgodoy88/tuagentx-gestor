import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRawUnsafe: vi.fn() },
  DB_SCHEMA: 'gestor_staging',
}))

vi.mock('@/lib/bodega', () => ({
  resolverEmpresaIdOrigen:   vi.fn().mockResolvedValue('emp-origen'),
  resolverEmpresaIdOperador: vi.fn().mockResolvedValue('emp-operador'),
}))

import { prisma } from '@/lib/prisma'
import { getDespachoLog } from '@/lib/bodega/despacho-log'

const p = prisma as any

function fila(id: string, numeroFactura: string, despachadoEl = new Date('2026-09-01T10:00:00Z')) {
  return {
    id, numeroFactura, clienteNombre: 'Cliente Test', modo: 'normal',
    guiaTransporte: null, transportadora: null, despachadoEl,
    despachadoPorNombre: 'Luis', alistadoEl: null, ciudad: null,
    fotosAlistamiento: null, fotoAlistamiento: null, ordenId: `orden-${id}`,
    fechaOrden: null, fechaFactura: null, direccion: null,
    num_cajas: 1, entregadoEl: null, firmaEntrega: null, observacion: null,
    urlSeguimiento: null, alistadoPorNombre: null, repartidorNombre: null, vendedorNombre: null,
  }
}

const PARAMS_BASE = { empresaId: 'emp-01', origenId: 'propia', cursor: null, role: 'empresa' }

beforeEach(() => vi.clearAllMocks())

describe('getDespachoLog — paginación', () => {
  it('sin filas → data vacía, nextCursor null, controlFacturas []', async () => {
    p.$queryRawUnsafe.mockResolvedValue([])
    const r = await getDespachoLog(PARAMS_BASE)
    expect(r.data).toHaveLength(0)
    expect(r.nextCursor).toBeNull()
    expect(r.hayMas).toBe(false)
    expect(r.controlFacturas).toHaveLength(0)
  })

  it('≤50 filas → hayMas false, sin cursor', async () => {
    p.$queryRawUnsafe.mockResolvedValue([fila('f1', '100'), fila('f2', '99')])
    const r = await getDespachoLog(PARAMS_BASE)
    expect(r.hayMas).toBe(false)
    expect(r.nextCursor).toBeNull()
    expect(r.data).toHaveLength(2)
  })

  it('51 filas → hayMas true, nextCursor = id de la fila 50', async () => {
    const filas = Array.from({ length: 51 }, (_, i) =>
      fila(`f${i}`, String(200 - i))
    )
    p.$queryRawUnsafe.mockResolvedValue(filas)
    const r = await getDespachoLog(PARAMS_BASE)
    expect(r.hayMas).toBe(true)
    expect(r.data).toHaveLength(50)
    expect(r.nextCursor).toBe('f49')
  })
})

describe('getDespachoLog — controlFacturas (huecos)', () => {
  it('facturas consecutivas sin hueco', async () => {
    p.$queryRawUnsafe.mockResolvedValue([fila('f1', '102'), fila('f2', '101'), fila('f3', '100')])
    const r = await getDespachoLog(PARAMS_BASE)
    expect(r.controlFacturas).toHaveLength(3)
    expect(r.controlFacturas.every((c: any) => !c.hueco)).toBe(true)
  })

  it('detecta hueco entre facturas', async () => {
    p.$queryRawUnsafe.mockResolvedValue([fila('f1', '105'), fila('f2', '103')])
    const r = await getDespachoLog(PARAMS_BASE)
    // rango 105→103: 105, 104 (hueco), 103
    expect(r.controlFacturas).toHaveLength(3)
    const hueco = r.controlFacturas.find((c: any) => c.numero === 104)
    expect(hueco?.hueco).toBe(true)
    expect(hueco?.log).toBeNull()
  })

  it('factura con log tiene hueco=false y log relleno', async () => {
    p.$queryRawUnsafe.mockResolvedValue([fila('f1', '200')])
    const r = await getDespachoLog(PARAMS_BASE)
    expect(r.controlFacturas[0].hueco).toBe(false)
    expect(r.controlFacturas[0].log).not.toBeNull()
  })
})

describe('getDespachoLog — serialización fechas', () => {
  it('despachadoEl Date → ISO string con Z', async () => {
    p.$queryRawUnsafe.mockResolvedValue([fila('f1', '100', new Date('2026-09-01T10:00:00Z'))])
    const r = await getDespachoLog(PARAMS_BASE)
    expect(r.data[0].despachadoEl).toMatch(/Z$/)
  })
})
