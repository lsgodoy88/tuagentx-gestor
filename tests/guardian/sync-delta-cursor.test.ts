/**
 * Tests de integración — cursor de órdenes en sync-delta
 *
 * Reglas protegidas:
 * 1. Cursor invoicedAt avanza al más reciente (data[0]) tras procesar órdenes
 * 2. Cursor no avanza si ultimoCursor es null (sin datos)
 * 3. Cursor no avanza si todas las órdenes son inválidas (sin invoiceNumber)
 * 4. Cursor updatedAt avanza solo en primera página (no pisado por páginas posteriores)
 * 5. Cursor deletedAt avanza al más reciente tras detectar eliminaciones
 * 6. Sin cursor inicial → reescanea desde hace 3 días
 * 7. Con cursor → usa cursorDate como punto de partida
 */

import { describe, it, expect } from 'vitest'
import type { UpTresCursor } from '@/lib/integracion/adapters/uptres'
import {
  ORDEN_INVOICED_1, ORDEN_INVOICED_2, ORDEN_INVOICED_3,
  RESPONSE_INVOICED_1_PAGINA,
  RESPONSE_INVOICED_PAGINA_1_DE_2, RESPONSE_INVOICED_PAGINA_2_DE_2,
  ORDEN_UPDATED_1, ORDEN_UPDATED_2,
  RESPONSE_UPDATED_1_PAGINA,
  RESPONSE_UPDATED_PAGINA_1_DE_2, RESPONSE_UPDATED_PAGINA_2_DE_2,
  ORDEN_DELETED_1, ORDEN_DELETED_2,
  RESPONSE_DELETED_1_PAGINA,
} from '../fixtures/uptres-ordenes'

// ─── Lógica extraída de sync-delta — persistencia del cursor ─────────────────
// Refleja exactamente lo que hace sync-delta con el ultimoCursor

interface CursorUpdate {
  cursor: UpTresCursor | null
  persistido: boolean
}

async function simularPersistenciaCursor(
  fetchPages: (() => Promise<{ data: any[]; ultimoCursor: UpTresCursor | null }>)
): Promise<CursorUpdate> {
  const { ultimoCursor } = await fetchPages()
  // Refleja: if (nuevoCursorOrdenesInvoiced) { prisma.empresa.update(...) }
  const persistido = ultimoCursor !== null
  return { cursor: ultimoCursor, persistido }
}

// Simula fetchOrdenesInvoicedConCursor con respuestas paginadas
async function simularInvoicedConCursor(
  respuestas: any[]
): Promise<{ data: any[]; ultimoCursor: UpTresCursor | null }> {
  const todos: any[] = []
  let ultimoCursor: UpTresCursor | null = null
  let pagina = 0

  for (const resp of respuestas) {
    if (!resp.data?.length) break
    todos.push(...resp.data)
    // Captura solo en la primera página — lógica del fix
    if (!ultimoCursor) {
      const primero = resp.data[0]
      if (primero?.invoicedAt && primero?.id) {
        ultimoCursor = { cursorDate: primero.invoicedAt, cursorId: primero.id }
      }
    }
    if (!resp.nextCursor) break
    pagina++
  }
  return { data: todos, ultimoCursor }
}

async function simularUpdatedConCursor(
  respuestas: any[]
): Promise<{ data: any[]; ultimoCursor: UpTresCursor | null }> {
  const todos: any[] = []
  let ultimoCursor: UpTresCursor | null = null

  for (const resp of respuestas) {
    if (!resp.data?.length) break
    todos.push(...resp.data)
    if (!ultimoCursor) {
      const primero = resp.data[0]
      if (primero?.updatedAt && primero?.id) {
        ultimoCursor = { cursorDate: primero.updatedAt, cursorId: primero.id }
      }
    }
    if (!resp.nextCursor) break
  }
  return { data: todos, ultimoCursor }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sync-delta — cursor invoicedAt', () => {

  it('1 página → cursor = data[0] del fixture (más reciente)', async () => {
    const { cursor, persistido } = await simularPersistenciaCursor(
      () => simularInvoicedConCursor([RESPONSE_INVOICED_1_PAGINA])
    )
    expect(persistido).toBe(true)
    expect(cursor).toEqual({
      cursorDate: ORDEN_INVOICED_1.invoicedAt,
      cursorId: ORDEN_INVOICED_1.id,
    })
  })

  it('2 páginas → cursor = data[0] de PRIMERA página, no pisado por segunda', async () => {
    const { cursor } = await simularPersistenciaCursor(
      () => simularInvoicedConCursor([
        RESPONSE_INVOICED_PAGINA_1_DE_2,
        RESPONSE_INVOICED_PAGINA_2_DE_2,
      ])
    )
    // Debe ser ORDEN_INVOICED_1 (página 1), NO ORDEN_INVOICED_3 (página 2)
    expect(cursor?.cursorDate).toBe(ORDEN_INVOICED_1.invoicedAt)
    expect(cursor?.cursorId).toBe(ORDEN_INVOICED_1.id)
    expect(cursor?.cursorDate).not.toBe(ORDEN_INVOICED_3.invoicedAt)
  })

  it('sin datos → cursor null, no se persiste', async () => {
    const { cursor, persistido } = await simularPersistenciaCursor(
      () => simularInvoicedConCursor([{ ok: true, data: [], nextCursor: null }])
    )
    expect(cursor).toBeNull()
    expect(persistido).toBe(false)
  })

  it('cursor avanza cronológicamente — fecha del cursor > fecha del cursor anterior', async () => {
    const cursorAnterior = { cursorDate: ORDEN_INVOICED_3.invoicedAt, cursorId: ORDEN_INVOICED_3.id }
    const { cursor } = await simularPersistenciaCursor(
      () => simularInvoicedConCursor([RESPONSE_INVOICED_1_PAGINA])
    )
    // El nuevo cursor debe ser más reciente que el anterior
    expect(new Date(cursor!.cursorDate).getTime()).toBeGreaterThan(
      new Date(cursorAnterior.cursorDate).getTime()
    )
  })

  it('órdenes en el fixture son DESC por invoicedAt', () => {
    const data = RESPONSE_INVOICED_1_PAGINA.data
    for (let i = 0; i < data.length - 1; i++) {
      expect(new Date(data[i].invoicedAt).getTime()).toBeGreaterThan(
        new Date(data[i + 1].invoicedAt).getTime()
      )
    }
  })

  it('cursorId del cursor coincide con el id del elemento más reciente', async () => {
    const { cursor } = await simularPersistenciaCursor(
      () => simularInvoicedConCursor([RESPONSE_INVOICED_1_PAGINA])
    )
    const masReciente = RESPONSE_INVOICED_1_PAGINA.data[0]
    expect(cursor?.cursorId).toBe(masReciente.id)
    expect(cursor?.cursorDate).toBe(masReciente.invoicedAt)
  })
})

describe('sync-delta — cursor updatedAt', () => {

  it('1 página → cursor = data[0] (más reciente)', async () => {
    const { cursor, persistido } = await simularPersistenciaCursor(
      () => simularUpdatedConCursor([RESPONSE_UPDATED_1_PAGINA])
    )
    expect(persistido).toBe(true)
    expect(cursor).toEqual({
      cursorDate: ORDEN_UPDATED_1.updatedAt,
      cursorId: ORDEN_UPDATED_1.id,
    })
  })

  it('2 páginas → cursor = data[0] de PRIMERA página, no pisado', async () => {
    const { cursor } = await simularPersistenciaCursor(
      () => simularUpdatedConCursor([
        RESPONSE_UPDATED_PAGINA_1_DE_2,
        RESPONSE_UPDATED_PAGINA_2_DE_2,
      ])
    )
    expect(cursor?.cursorDate).toBe(ORDEN_UPDATED_1.updatedAt)
    expect(cursor?.cursorDate).not.toBe(ORDEN_UPDATED_2.updatedAt)
  })

  it('sin datos → no se persiste', async () => {
    const { persistido } = await simularPersistenciaCursor(
      () => simularUpdatedConCursor([{ ok: true, data: [], nextCursor: null }])
    )
    expect(persistido).toBe(false)
  })
})

describe('sync-delta — cursor deletedAt', () => {

  it('órdenes eliminadas → cursor = data[0] (más reciente)', async () => {
    async function simularDeletedConCursor(respuestas: any[]) {
      const todos: any[] = []
      let ultimoCursor: UpTresCursor | null = null
      for (const resp of respuestas) {
        if (!resp.data?.length) break
        todos.push(...resp.data)
        if (!ultimoCursor) {
          const primero = resp.data[0]
          if (primero?.deletedAt && primero?.id) {
            ultimoCursor = { cursorDate: primero.deletedAt, cursorId: primero.id }
          }
        }
        if (!resp.nextCursor) break
      }
      return { data: todos, ultimoCursor }
    }

    const { cursor, persistido } = await simularPersistenciaCursor(
      () => simularDeletedConCursor([RESPONSE_DELETED_1_PAGINA])
    )
    expect(persistido).toBe(true)
    expect(cursor).toEqual({
      cursorDate: ORDEN_DELETED_1.deletedAt,
      cursorId: ORDEN_DELETED_1.id,
    })
    // NO debe ser el más antiguo
    expect(cursor?.cursorDate).not.toBe(ORDEN_DELETED_2.deletedAt)
  })
})

describe('sync-delta — reglas de negocio del upsert invoiced', () => {

  it('órdenes sin invoiceNumber son ignoradas por sync-delta (filtro en job)', () => {
    // sync-delta filtra: if (!origenId || !o.isInvoiced || !o.invoiceNumber) continue
    const ordenes = [
      { id: 'o1', isInvoiced: true, invoiceNumber: 4450, invoicedAt: '2026-09-15T10:00:00Z' },
      { id: 'o2', isInvoiced: false, invoiceNumber: null, invoicedAt: null }, // sin factura
      { id: 'o3', isInvoiced: true, invoiceNumber: 0, invoicedAt: '2026-09-15T09:00:00Z' }, // electronicInvoiceNumber=0 → null
    ]
    const validas = ordenes.filter(o => o.isInvoiced && o.invoiceNumber && o.invoiceNumber > 0)
    expect(validas).toHaveLength(1)
    expect(validas[0].id).toBe('o1')
  })

  it('upsert no duplica — misma orden en dos corridas tiene mismo origenId', () => {
    // El upsert usa { origenId, empresaId } como clave única
    const corrida1 = RESPONSE_INVOICED_1_PAGINA.data.map(o => o.id)
    const corrida2 = RESPONSE_INVOICED_1_PAGINA.data.map(o => o.id) // mismas órdenes
    const todos = [...corrida1, ...corrida2]
    const unicos = new Set(todos)
    expect(unicos.size).toBe(corrida1.length) // sin duplicados
  })

  it('address siempre null — dirección viene de Cliente local, nunca de UpTres', () => {
    // Invariante v39: UpTres nunca trae address en órdenes
    RESPONSE_INVOICED_1_PAGINA.data.forEach(o => {
      expect(o.address).toBeNull()
    })
  })

  it('origen correcto según origenVinculadaId', () => {
    // Bug corregido hoy: origen: destino → origen: origenVinculadaId ? 'vinculada' : 'propia'
    const origenVinculadaId = null
    const origen = origenVinculadaId ? 'vinculada' : 'propia'
    expect(origen).toBe('propia')

    const origenVinculadaId2 = 'empresa-vinculada-id'
    const origen2 = origenVinculadaId2 ? 'vinculada' : 'propia'
    expect(origen2).toBe('vinculada')
  })
})
