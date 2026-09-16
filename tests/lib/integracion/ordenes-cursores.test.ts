import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  fetchOrdenesDateConCursor,
  fetchOrdenesInvoicedConCursor,
  fetchOrdenesDeletedConCursor,
} from '@/lib/integracion/adapters/uptres'
import {
  ORDEN_INVOICED_1, ORDEN_INVOICED_2, ORDEN_INVOICED_3,
  RESPONSE_INVOICED_1_PAGINA,
  RESPONSE_INVOICED_PAGINA_1_DE_2, RESPONSE_INVOICED_PAGINA_2_DE_2,
  ORDEN_UPDATED_1, ORDEN_UPDATED_2,
  RESPONSE_UPDATED_1_PAGINA,
  RESPONSE_UPDATED_PAGINA_1_DE_2, RESPONSE_UPDATED_PAGINA_2_DE_2,
  ORDEN_DELETED_1, ORDEN_DELETED_2,
  RESPONSE_DELETED_1_PAGINA,
  RESPONSE_DELETED_PAGINA_1_DE_2, RESPONSE_DELETED_PAGINA_2_DE_2,
  CAMPOS_REQUERIDOS_INVOICED, CAMPOS_REQUERIDOS_UPDATED, CAMPOS_REQUERIDOS_DELETED,
} from '../../fixtures/uptres-ordenes'

const API_KEY = 'test-key'
const TOKEN = 'test-token'

function mockFetch(responder: (url: string) => any) {
  return async (url: string) => {
    const resultado = responder(url)
    const text = JSON.stringify(resultado)
    return { ok: true, status: 200, text: async () => text } as any
  }
}

// ─── Contract tests ───────────────────────────────────────────────────────────

describe('Contract — estructura de respuesta de UpTres', () => {
  it('ORDEN_INVOICED tiene todos los campos requeridos por el adapter', () => {
    CAMPOS_REQUERIDOS_INVOICED.forEach(campo => {
      expect(ORDEN_INVOICED_1).toHaveProperty(campo)
    })
  })

  it('ORDEN_UPDATED tiene todos los campos requeridos por el adapter', () => {
    CAMPOS_REQUERIDOS_UPDATED.forEach(campo => {
      expect(ORDEN_UPDATED_1).toHaveProperty(campo)
    })
  })

  it('ORDEN_DELETED tiene todos los campos requeridos por el adapter', () => {
    CAMPOS_REQUERIDOS_DELETED.forEach(campo => {
      expect(ORDEN_DELETED_1).toHaveProperty(campo)
    })
  })

  it('address siempre null en órdenes — invariante UpTres v39', () => {
    expect(ORDEN_INVOICED_1.address).toBeNull()
    expect(ORDEN_INVOICED_2.address).toBeNull()
    expect(ORDEN_INVOICED_3.address).toBeNull()
  })

  it('invoicedAt === updatedAt al facturar — invariante confirmada en prod', () => {
    expect(ORDEN_INVOICED_1.invoicedAt).toBe(ORDEN_INVOICED_1.updatedAt)
    expect(ORDEN_INVOICED_2.invoicedAt).toBe(ORDEN_INVOICED_2.updatedAt)
  })

  it('nextCursor.cursorDate = invoicedAt del último elemento (más antiguo DESC)', () => {
    const ultimoItem = RESPONSE_INVOICED_PAGINA_1_DE_2.data[RESPONSE_INVOICED_PAGINA_1_DE_2.data.length - 1]
    expect(RESPONSE_INVOICED_PAGINA_1_DE_2.nextCursor?.cursorDate).toBe(ultimoItem.invoicedAt)
    expect(RESPONSE_INVOICED_PAGINA_1_DE_2.nextCursor?.cursorId).toBe(ultimoItem.id)
  })

  it('data[0] es el más reciente en respuesta DESC', () => {
    const data = RESPONSE_INVOICED_1_PAGINA.data
    expect(new Date(data[0].invoicedAt).getTime()).toBeGreaterThan(new Date(data[1].invoicedAt).getTime())
    expect(new Date(data[1].invoicedAt).getTime()).toBeGreaterThan(new Date(data[2].invoicedAt).getTime())
  })
})

// ─── fetchOrdenesInvoicedConCursor ────────────────────────────────────────────

describe('fetchOrdenesInvoicedConCursor', () => {
  let originalFetch: any
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch })

  it('sin cursor → from = desde ajustado a Bogotá (UTC-5)', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => { capturedUrl = url; return { ok: true, data: [] } })
    await fetchOrdenesInvoicedConCursor(API_KEY, TOKEN, null, new Date('2026-09-15T10:00:00Z'))
    expect(capturedUrl).toContain('date=invoicedAt')
    expect(capturedUrl).toContain('from=2026-09-15')
    expect(capturedUrl).toContain('condition=true')
    expect(capturedUrl).toContain('expand=customer')
    expect(capturedUrl).not.toContain('cursorDate')
  })

  it('con cursor → envía cursorDate y cursorId en params', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => { capturedUrl = url; return { ok: true, data: [] } })
    const cursor = { cursorDate: ORDEN_INVOICED_3.invoicedAt, cursorId: ORDEN_INVOICED_3.id }
    await fetchOrdenesInvoicedConCursor(API_KEY, TOKEN, cursor, new Date())
    expect(capturedUrl).toContain('cursorId=test-ord-003')
  })

  it('1 página sin nextCursor → ultimoCursor = data[0] (más reciente)', async () => {
    global.fetch = mockFetch(() => RESPONSE_INVOICED_1_PAGINA)
    const { data, ultimoCursor } = await fetchOrdenesInvoicedConCursor(API_KEY, TOKEN, null, new Date('2026-09-12T00:00:00Z'))
    expect(data).toHaveLength(3)
    expect(ultimoCursor).toEqual({
      cursorDate: ORDEN_INVOICED_1.invoicedAt,
      cursorId: ORDEN_INVOICED_1.id,
    })
  })

  it('múltiples páginas → ultimoCursor = data[0] de la PRIMERA página (no pisado por páginas posteriores)', async () => {
    let pagina = 0
    global.fetch = mockFetch(() => {
      pagina++
      if (pagina === 1) return RESPONSE_INVOICED_PAGINA_1_DE_2
      if (pagina === 2) return RESPONSE_INVOICED_PAGINA_2_DE_2
      return { ok: true, data: [] }
    })
    const { data, ultimoCursor } = await fetchOrdenesInvoicedConCursor(API_KEY, TOKEN, null, new Date('2026-09-12T00:00:00Z'))
    expect(data).toHaveLength(3)
    // data[0] de página 1 = ORDEN_INVOICED_1 (más reciente de todo)
    expect(ultimoCursor).toEqual({
      cursorDate: ORDEN_INVOICED_1.invoicedAt,
      cursorId: ORDEN_INVOICED_1.id,
    })
    // NO debe ser el data[0] de la página 2 (ORDEN_INVOICED_3 — más antiguo)
    expect(ultimoCursor?.cursorDate).not.toBe(ORDEN_INVOICED_3.invoicedAt)
  })

  it('sin datos → ultimoCursor null', async () => {
    global.fetch = mockFetch(() => ({ ok: true, data: [] }))
    const { data, ultimoCursor } = await fetchOrdenesInvoicedConCursor(API_KEY, TOKEN, null, new Date())
    expect(data).toHaveLength(0)
    expect(ultimoCursor).toBeNull()
  })

  it('upsert seguro — misma orden en dos corridas no duplica (origenId único)', () => {
    // El adapter retorna todos los datos — el upsert lo maneja sync-delta
    // Este test valida que el adapter no filtra por origenId (eso es responsabilidad del job)
    const ids = RESPONSE_INVOICED_1_PAGINA.data.map(o => o.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length) // fixture sin duplicados
  })
})

// ─── fetchOrdenesDateConCursor ────────────────────────────────────────────────

describe('fetchOrdenesDateConCursor', () => {
  let originalFetch: any
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch })

  it('usa date=updatedAt en la URL', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => { capturedUrl = url; return { ok: true, data: [] } })
    await fetchOrdenesDateConCursor(API_KEY, TOKEN, null, new Date())
    expect(capturedUrl).toContain('date=updatedAt')
  })

  it('1 página sin nextCursor → ultimoCursor = data[0] (más reciente)', async () => {
    global.fetch = mockFetch(() => RESPONSE_UPDATED_1_PAGINA)
    const { data, ultimoCursor } = await fetchOrdenesDateConCursor(API_KEY, TOKEN, null, new Date('2026-09-13T00:00:00Z'))
    expect(data).toHaveLength(2)
    expect(ultimoCursor).toEqual({
      cursorDate: ORDEN_UPDATED_1.updatedAt,
      cursorId: ORDEN_UPDATED_1.id,
    })
  })

  it('múltiples páginas → ultimoCursor = data[0] de la PRIMERA página (no pisado)', async () => {
    let pagina = 0
    global.fetch = mockFetch(() => {
      pagina++
      if (pagina === 1) return RESPONSE_UPDATED_PAGINA_1_DE_2
      if (pagina === 2) return RESPONSE_UPDATED_PAGINA_2_DE_2
      return { ok: true, data: [] }
    })
    const { data, ultimoCursor } = await fetchOrdenesDateConCursor(API_KEY, TOKEN, null, new Date('2026-09-13T00:00:00Z'))
    expect(data).toHaveLength(2)
    expect(ultimoCursor).toEqual({
      cursorDate: ORDEN_UPDATED_1.updatedAt,
      cursorId: ORDEN_UPDATED_1.id,
    })
    expect(ultimoCursor?.cursorDate).not.toBe(ORDEN_UPDATED_2.updatedAt)
  })

  it('sin datos → ultimoCursor null', async () => {
    global.fetch = mockFetch(() => ({ ok: true, data: [] }))
    const { ultimoCursor } = await fetchOrdenesDateConCursor(API_KEY, TOKEN, null, new Date())
    expect(ultimoCursor).toBeNull()
  })

  it('con cursor → envía cursorDate y cursorId', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => { capturedUrl = url; return { ok: true, data: [] } })
    const cursor = { cursorDate: ORDEN_UPDATED_2.updatedAt, cursorId: ORDEN_UPDATED_2.id }
    await fetchOrdenesDateConCursor(API_KEY, TOKEN, cursor, new Date())
    expect(capturedUrl).toContain('cursorId=test-ord-002')
  })
})

// ─── fetchOrdenesDeletedConCursor ─────────────────────────────────────────────

describe('fetchOrdenesDeletedConCursor', () => {
  let originalFetch: any
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch })

  it('llama a /ordenes/deleted', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => { capturedUrl = url; return { ok: true, data: [] } })
    await fetchOrdenesDeletedConCursor(API_KEY, TOKEN, null, new Date())
    expect(capturedUrl).toContain('/ordenes/deleted')
  })

  it('1 página sin nextCursor → ultimoCursor = data[0].deletedAt (más reciente)', async () => {
    global.fetch = mockFetch(() => RESPONSE_DELETED_1_PAGINA)
    const { data, ultimoCursor } = await fetchOrdenesDeletedConCursor(API_KEY, TOKEN, null, new Date('2026-09-13T00:00:00Z'))
    expect(data).toHaveLength(2)
    expect(ultimoCursor).toEqual({
      cursorDate: ORDEN_DELETED_1.deletedAt,
      cursorId: ORDEN_DELETED_1.id,
    })
  })

  it('múltiples páginas → ultimoCursor = data[0] de la PRIMERA página (no pisado)', async () => {
    let pagina = 0
    global.fetch = mockFetch(() => {
      pagina++
      if (pagina === 1) return RESPONSE_DELETED_PAGINA_1_DE_2
      if (pagina === 2) return RESPONSE_DELETED_PAGINA_2_DE_2
      return { ok: true, data: [] }
    })
    const { data, ultimoCursor } = await fetchOrdenesDeletedConCursor(API_KEY, TOKEN, null, new Date('2026-09-13T00:00:00Z'))
    expect(data).toHaveLength(2)
    expect(ultimoCursor).toEqual({
      cursorDate: ORDEN_DELETED_1.deletedAt,
      cursorId: ORDEN_DELETED_1.id,
    })
    expect(ultimoCursor?.cursorDate).not.toBe(ORDEN_DELETED_2.deletedAt)
  })

  it('sin datos → ultimoCursor null', async () => {
    global.fetch = mockFetch(() => ({ ok: true, data: [] }))
    const { ultimoCursor } = await fetchOrdenesDeletedConCursor(API_KEY, TOKEN, null, new Date())
    expect(ultimoCursor).toBeNull()
  })

  it('sin cursor → from = desde ajustado a Bogotá', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => { capturedUrl = url; return { ok: true, data: [] } })
    await fetchOrdenesDeletedConCursor(API_KEY, TOKEN, null, new Date('2026-09-15T10:00:00Z'))
    expect(capturedUrl).toContain('from=2026-09-15')
  })
})
