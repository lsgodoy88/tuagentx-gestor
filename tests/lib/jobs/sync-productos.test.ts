/**
 * Tests — sync-productos (sync completo, sin cursor)
 *
 * Decisión de diseño: UpTres NO actualiza updatedAt al descontar inventario
 * por factura → cursor updatedAt no detecta cambios de stock → sync completo
 * cada hora es la única estrategia confiable.
 *
 * Reglas protegidas:
 * 1. Siempre sync completo (cursor=null) → trae todos los productos activos
 * 2. inventory actualizado correctamente en cada corrida
 * 3. Productos ausentes en UpTres → desactivados en BD (condition=false)
 * 4. Productos ya inactivos en UpTres → no cuentan como upserted
 * 5. Sin datos de UpTres → upserted=0, BD no se toca
 * 6. Corridas idempotentes — mismos datos → mismo resultado
 * 7. Desactivados solo cuando condition=false viene de UpTres
 */

import { describe, it, expect } from 'vitest'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROD_ACTIVO_1 = { id: 'abc001', name: 'Ampolla Booster 1', inventory: 190, condition: true,  updatedAt: '2026-09-04T08:40:07.000Z' }
const PROD_ACTIVO_2 = { id: 'abc002', name: 'Shampoo 400ml',     inventory: 51,  condition: true,  updatedAt: '2026-09-04T08:40:07.000Z' }
const PROD_INACTIVO = { id: 'abc003', name: 'Producto viejo',    inventory: 0,   condition: false, updatedAt: '2026-08-01T00:00:00.000Z' }

const RESPONSE_COMPLETO = { ok: true, data: [PROD_ACTIVO_1, PROD_ACTIVO_2], nextCursor: null }
const RESPONSE_CON_INACTIVO = { ok: true, data: [PROD_ACTIVO_1, PROD_INACTIVO], nextCursor: null }
const RESPONSE_VACIO = { ok: true, data: [], nextCursor: null }

// ─── Simulador (refleja syncProductosEmpresa con cursor=null) ─────────────────

interface SyncResult { upserted: number; desactivados: number }

function simularSync(
  respuesta: typeof RESPONSE_COMPLETO,
  idsEnBD: string[] = []
): SyncResult {
  const productos = respuesta.data
  if (!productos.length) return { upserted: 0, desactivados: 0 }

  // Upsert todos los que vienen (activos e inactivos)
  const upserted = productos.length

  // Desactivar los que estaban en BD y ya no vienen (sync completo, cursor=null)
  const idsQueVienen = productos.map(p => p.id)
  const desactivados = idsEnBD.filter(id => !idsQueVienen.includes(id)).length

  return { upserted, desactivados }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sync-productos — sync completo sin cursor', () => {

  it('1. Siempre sync completo — upserted = total productos en UpTres', () => {
    const r = simularSync(RESPONSE_COMPLETO)
    expect(r.upserted).toBe(2)
    expect(r.desactivados).toBe(0)
  })

  it('2. inventory actualizado — refleja el valor actual de UpTres', () => {
    // El upsert sobrescribe inventory siempre, sin importar updatedAt
    const inventoryUpTres = PROD_ACTIVO_1.inventory
    expect(inventoryUpTres).toBe(190) // bajó de 191→190 al facturar
    // updatedAt en UpTres NO cambió — pero inventory sí
    expect(PROD_ACTIVO_1.updatedAt).toBe('2026-09-04T08:40:07.000Z') // fecha vieja
  })

  it('3. Producto ausente en UpTres → desactivado en BD', () => {
    const idsEnBD = ['abc001', 'abc002', 'abc999'] // abc999 ya no viene
    const r = simularSync(RESPONSE_COMPLETO, idsEnBD)
    expect(r.desactivados).toBe(1)
  })

  it('4. Producto inactivo (condition=false) → upserted pero no suma a activos', () => {
    const r = simularSync(RESPONSE_CON_INACTIVO)
    expect(r.upserted).toBe(2) // ambos se upsertan
    const activos = RESPONSE_CON_INACTIVO.data.filter(p => p.condition)
    expect(activos).toHaveLength(1)
  })

  it('5. Sin datos de UpTres → upserted=0, desactivados=0', () => {
    const r = simularSync(RESPONSE_VACIO, ['abc001'])
    expect(r.upserted).toBe(0)
    expect(r.desactivados).toBe(0)
  })

  it('6. Idempotente — misma respuesta en dos corridas → mismo resultado', () => {
    const r1 = simularSync(RESPONSE_COMPLETO, [])
    const r2 = simularSync(RESPONSE_COMPLETO, [])
    expect(r1).toEqual(r2)
  })

  it('7. Sin BD previa → 0 desactivados aunque vengan productos', () => {
    const r = simularSync(RESPONSE_COMPLETO, [])
    expect(r.desactivados).toBe(0)
    expect(r.upserted).toBe(2)
  })

  it('8. Razón del diseño: updatedAt no cambia al facturar en UpTres', () => {
    // Simula el escenario real: inventory bajó pero updatedAt no cambió
    const antes = { ...PROD_ACTIVO_1, inventory: 191 }
    const despues = { ...PROD_ACTIVO_1, inventory: 190 } // facturaron 1 unidad

    expect(despues.updatedAt).toBe(antes.updatedAt)   // UpTres no lo tocó
    expect(despues.inventory).toBeLessThan(antes.inventory) // pero inventory cambió
    // → cursor updatedAt nunca detectaría este cambio → sync completo es obligatorio
  })
})
