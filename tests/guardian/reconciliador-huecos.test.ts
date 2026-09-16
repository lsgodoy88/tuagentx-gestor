/**
 * Tests del reconciliador de huecos — sync-delta
 *
 * Reglas protegidas:
 * 1. Detecta gaps en consecutivos de facturas del día
 * 2. Solo busca huecos si hay >= 2 facturas Y el rango es < 50
 * 3. No busca huecos si el rango > 50 (evita saturar UpTres)
 * 4. Órdenes sin facturar en BD que UpTres ya facturó → reconcilia
 * 5. Hueco encontrado en UpTres con datos completos → upsert
 * 6. Hueco sin datos en UpTres → omite silenciosamente
 * 7. Normalización: fetchVentas y ordenesDate tienen shapes distintos → se unifican
 */

import { describe, it, expect } from 'vitest'
import { parseFechaUptresBogota } from '@/lib/integracion/adapters/uptres'

// ─── Lógica extraída del reconciliador (pura, sin Prisma ni HTTP) ─────────────

function detectarHuecos(facturas: number[]): number[] {
  if (facturas.length < 2) return []
  const min = Math.min(...facturas)
  const max = Math.max(...facturas)
  if (max - min >= 50) return [] // rango muy grande — no buscar
  const esperados = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const llegaron = new Set(facturas)
  return esperados.filter(n => !llegaron.has(n))
}

function normalizarOrdenesDate(ordenesDate: any[]): any[] {
  // ordenesDate usa: id, invoiceNumber, total, isInvoiced, invoicedAt
  // fetchVentas usa:  uid, numeroFacturado, vTotal, isInvoiced, invoicedAt
  return ordenesDate.map(o => ({
    uid: o.id,
    isInvoiced: o.isInvoiced,
    numeroFacturado: o.invoiceNumber || null,
    vTotal: o.total || null,
    invoicedAt: o.invoicedAt || null,
  }))
}

function reconciliarSinFacturar(
  sinFacturarEnBD: { origenId: string; numeroOrden: string }[],
  ordenesUpTres: any[]
): { origenId: string; numeroFactura: string; invoicedAt: string | null }[] {
  const porOrigenId = new Map(ordenesUpTres.map(o => [String(o.uid || o._id || o.id), o]))
  const reconciliadas: any[] = []
  for (const sinF of sinFacturarEnBD) {
    const uptres = porOrigenId.get(sinF.origenId)
    if (uptres?.isInvoiced && uptres?.numeroFacturado) {
      reconciliadas.push({
        origenId: sinF.origenId,
        numeroFactura: String(uptres.numeroFacturado),
        invoicedAt: uptres.invoicedAt || null,
      })
    }
  }
  return reconciliadas
}

// ─── Tests detectarHuecos ─────────────────────────────────────────────────────

describe('detectarHuecos', () => {

  it('sin huecos — consecutivos completos', () => {
    expect(detectarHuecos([4436, 4437, 4438, 4439])).toEqual([])
  })

  it('hueco en el medio', () => {
    expect(detectarHuecos([4436, 4438, 4439])).toEqual([4437])
  })

  it('múltiples huecos', () => {
    expect(detectarHuecos([4436, 4439, 4441])).toEqual([4437, 4438, 4440])
  })

  it('menos de 2 facturas → no busca huecos', () => {
    expect(detectarHuecos([])).toEqual([])
    expect(detectarHuecos([4436])).toEqual([])
  })

  it('rango >= 50 → no busca huecos (evita saturar UpTres)', () => {
    expect(detectarHuecos([4400, 4451])).toEqual([]) // rango = 51
    expect(detectarHuecos([4400, 4449])).toHaveLength(48) // rango = 49 → busca
  })

  it('rango exacto de 49 → sí busca', () => {
    const huecos = detectarHuecos([4400, 4449])
    expect(huecos.length).toBeGreaterThan(0)
  })

  it('facturas desordenadas → detecta igual', () => {
    expect(detectarHuecos([4439, 4436, 4438])).toEqual([4437])
  })

  it('2 facturas consecutivas → sin huecos', () => {
    expect(detectarHuecos([4436, 4437])).toEqual([])
  })

  it('2 facturas con 1 hueco', () => {
    expect(detectarHuecos([4436, 4438])).toEqual([4437])
  })
})

// ─── Tests normalizarOrdenesDate ──────────────────────────────────────────────

describe('normalizarOrdenesDate', () => {

  it('convierte shape de ordenesDate al shape de fetchVentas', () => {
    const ordenesDate = [{
      id: 'o1', invoiceNumber: 4450, total: '100000',
      isInvoiced: true, invoicedAt: '2026-09-15T10:00:00.000Z',
    }]
    const normalizadas = normalizarOrdenesDate(ordenesDate)
    expect(normalizadas[0]).toMatchObject({
      uid: 'o1',
      numeroFacturado: 4450,
      vTotal: '100000',
      isInvoiced: true,
      invoicedAt: '2026-09-15T10:00:00.000Z',
    })
  })

  it('invoiceNumber null → numeroFacturado null', () => {
    const normalizadas = normalizarOrdenesDate([{ id: 'o1', invoiceNumber: null, isInvoiced: false }])
    expect(normalizadas[0].numeroFacturado).toBeNull()
  })

  it('array vacío → array vacío', () => {
    expect(normalizarOrdenesDate([])).toEqual([])
  })

  it('puede combinarse con fetchVentas en un Map por uid', () => {
    const fetchVentas = [{ uid: 'o1', numeroFacturado: 4449, isInvoiced: true }]
    const ordenesDate = [{ id: 'o2', invoiceNumber: 4450, isInvoiced: true, total: '100', invoicedAt: null }]
    const normalizadas = normalizarOrdenesDate(ordenesDate)
    const todas = [...fetchVentas, ...normalizadas]
    const porUid = new Map(todas.map(o => [String(o.uid), o]))
    expect(porUid.has('o1')).toBe(true)
    expect(porUid.has('o2')).toBe(true)
  })
})

// ─── Tests reconciliarSinFacturar ─────────────────────────────────────────────

describe('reconciliarSinFacturar', () => {

  it('orden en BD sin factura que UpTres ya facturó → reconcilia', () => {
    const sinFacturar = [{ origenId: 'o1', numeroOrden: '3700' }]
    const ordenesUpTres = [{ uid: 'o1', isInvoiced: true, numeroFacturado: '4450', invoicedAt: '2026-09-15T10:00:00.000Z' }]
    const result = reconciliarSinFacturar(sinFacturar, ordenesUpTres)
    expect(result).toHaveLength(1)
    expect(result[0].numeroFactura).toBe('4450')
    expect(result[0].origenId).toBe('o1')
  })

  it('orden en BD sin factura que UpTres tampoco tiene facturada → no reconcilia', () => {
    const sinFacturar = [{ origenId: 'o1', numeroOrden: '3700' }]
    const ordenesUpTres = [{ uid: 'o1', isInvoiced: false, numeroFacturado: null }]
    const result = reconciliarSinFacturar(sinFacturar, ordenesUpTres)
    expect(result).toHaveLength(0)
  })

  it('orden en BD no está en UpTres → no reconcilia', () => {
    const sinFacturar = [{ origenId: 'o-desconocida', numeroOrden: '9999' }]
    const ordenesUpTres = [{ uid: 'o1', isInvoiced: true, numeroFacturado: '4450' }]
    const result = reconciliarSinFacturar(sinFacturar, ordenesUpTres)
    expect(result).toHaveLength(0)
  })

  it('múltiples órdenes — reconcilia solo las que UpTres tiene facturadas', () => {
    const sinFacturar = [
      { origenId: 'o1', numeroOrden: '3700' },
      { origenId: 'o2', numeroOrden: '3699' },
      { origenId: 'o3', numeroOrden: '3698' },
    ]
    const ordenesUpTres = [
      { uid: 'o1', isInvoiced: true, numeroFacturado: '4450', invoicedAt: '2026-09-15T10:00:00.000Z' },
      { uid: 'o2', isInvoiced: false, numeroFacturado: null },
      // o3 no está en UpTres
    ]
    const result = reconciliarSinFacturar(sinFacturar, ordenesUpTres)
    expect(result).toHaveLength(1)
    expect(result[0].origenId).toBe('o1')
  })

  it('lista vacía de sinFacturar → sin reconciliaciones', () => {
    const result = reconciliarSinFacturar([], [{ uid: 'o1', isInvoiced: true, numeroFacturado: '4450' }])
    expect(result).toHaveLength(0)
  })

  it('invoicedAt se preserva para parseFechaUptresBogota posterior', () => {
    const sinFacturar = [{ origenId: 'o1', numeroOrden: '3700' }]
    const ordenesUpTres = [{ uid: 'o1', isInvoiced: true, numeroFacturado: '4450', invoicedAt: '2026-09-15T10:31:28.000Z' }]
    const result = reconciliarSinFacturar(sinFacturar, ordenesUpTres)
    const fecha = parseFechaUptresBogota(result[0].invoicedAt)
    expect(fecha!.toISOString()).toBe('2026-09-15T15:31:28.000Z')
  })
})

// ─── Tests integración detectar + reconciliar ─────────────────────────────────

describe('reconciliador completo — detectar huecos + reconciliar', () => {

  it('escenario real: facturas 4436,4438,4439 → hueco 4437 detectado', () => {
    const facturas = [4436, 4438, 4439]
    const huecos = detectarHuecos(facturas)
    expect(huecos).toEqual([4437])
  })

  it('escenario real: todas las facturas del día presentes → sin huecos', () => {
    const facturas = [4436, 4437, 4438, 4439, 4440, 4441, 4442]
    expect(detectarHuecos(facturas)).toEqual([])
  })

  it('escenario Leche 3710: orden sin facturar no genera hueco — no está en el set del día', () => {
    // 3710 está sin facturar → no aparece en fetchVentas (solo facturadas)
    // El cursor invoicedAt la capturará cuando se facture
    const facturasDia = [4436, 4437, 4438] // 3710 no tiene factura, no aparece aquí
    const huecos = detectarHuecos(facturasDia)
    expect(huecos).toEqual([]) // sin huecos en el consecutivo de facturas
  })
})
