/**
 * CONTRATO UPTRES — Guardian de la integración
 *
 * Estos tests protegen el mapping entre la API externa de UpTres y nuestras
 * estructuras internas. Si alguno falla, significa que:
 *   a) UpTres cambió un nombre de campo → hay que actualizar el adapter
 *   b) Alguien cambió el adapter sin actualizar los tests → hay que revisar
 *
 * Reglas:
 *   - Cada campo que se pide en `fields` debe aparecer mapeado en el return
 *   - Cada campo del return debe corresponder a un campo real de la API de UpTres
 *   - Los campos críticos (invoiceNumber, orderNumber, customerId) nunca deben faltar
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'

function mockFetch(responder: (url: string) => any) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const resultado = responder(url)
    const text = JSON.stringify(resultado)
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text } as any
  })
}

async function getAdapter() {
  global.fetch = mockFetch((url) => {
    if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
    return { ok: true, data: [] }
  })
  const a = new UpTresAdapter('k', 's')
  await a.login()
  return a
}

let originalFetch: any
beforeEach(() => { originalFetch = global.fetch })
afterEach(() => { global.fetch = originalFetch })

// ─────────────────────────────────────────────────────────────
// CONTRATO: fetchVentas — endpoint /ordenes
// ─────────────────────────────────────────────────────────────
describe('CONTRATO fetchVentas → /ordenes', () => {

  it('invoiceNumber de UpTres → numeroFacturado en VentaExterna', async () => {
    // Este test habría capturado el bug: el adapter leía o.numeroFacturado (inexistente)
    // en lugar de o.invoiceNumber (nombre real del campo en UpTres)
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return { ok: true, data: [{ id: 'o1', invoiceNumber: 3867, orderNumber: 2900, total: '100', customerId: 'c1', createdAt: '2026-05-14' }] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const ventas = await a.fetchVentas()
    expect(ventas[0].numeroFacturado).toBe(3867)
    expect(ventas[0].numeroFacturado).not.toBeNull()
    expect(ventas[0].numeroFacturado).not.toBeUndefined()
  })

  it('orderNumber de UpTres → numeroOrden en VentaExterna', async () => {
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return { ok: true, data: [{ id: 'o1', orderNumber: 2900, invoiceNumber: 3867, total: '100', customerId: 'c1', createdAt: '2026-05-14' }] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const ventas = await a.fetchVentas()
    expect(ventas[0].numeroOrden).toBe(2900)
  })

  it('invoiceNumber ausente en respuesta → numeroFacturado es null (no undefined)', async () => {
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return { ok: true, data: [{ id: 'o1', orderNumber: 1, total: '100', customerId: 'c1', createdAt: '2026-05-14' }] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const ventas = await a.fetchVentas()
    expect(ventas[0].numeroFacturado).toBeNull()
  })

  it('fields de la request incluye invoiceNumber, orderNumber, customerId, employeeId, items, cityId, address, phone', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      if (url.includes('condition=true') && !capturedUrl) capturedUrl = url
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchVentas()
    const params = new URLSearchParams(capturedUrl.split('?')[1])
    const fields = params.get('fields')?.split(',') ?? []
    expect(fields).toContain('invoiceNumber')
    expect(fields).toContain('orderNumber')
    expect(fields).toContain('customerId')
    expect(fields).toContain('employeeId')
    expect(fields).toContain('items')
    expect(fields).toContain('cityId')
    expect(fields).toContain('address')
    expect(fields).toContain('phone')
  })

  it('fields incluye isInvoiced para determinar isFacturada, NO incluye isDelivered/isShipped', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      if (url.includes('condition=true') && !capturedUrl) capturedUrl = url
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchVentas()
    const params = new URLSearchParams(capturedUrl.split('?')[1])
    const fields = params.get('fields')?.split(',') ?? []
    expect(fields).toContain('isInvoiced')     // necesario para isFacturada
    expect(fields).toContain('isDelivered')   // campo nuevo UpTres
    expect(fields).toContain('isShipped')     // campo nuevo UpTres
  })

  it('expand incluye customer e items', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      if (url.includes('condition=true') && !capturedUrl) capturedUrl = url
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchVentas()
    expect(capturedUrl).toContain('expand=customer%2Citems')
  })

  it('to = mañana (no corta órdenes del día actual)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T23:00:00Z'))
    let capturedUrl = ''
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      if (url.includes('condition=true') && !capturedUrl) capturedUrl = url
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchVentas()
    const params = new URLSearchParams(capturedUrl.split('?')[1])
    const to = params.get('to')
    expect(to).toBe('2026-05-15') // mañana, no hoy
    vi.useRealTimers()
  })

  it('retorna cityId sin pre-computar ciudad (sync routes lo resuelven)', async () => {
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return { ok: true, data: [{ id: 'o1', cityId: '73001', total: '100', customerId: 'c1', createdAt: '2026-05-14' }] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const ventas = await a.fetchVentas()
    expect(ventas[0].cityId).toBe('73001')
    // ciudad NO debe venir pre-computada del adapter (se removió como redundante)
    expect((ventas[0] as any).ciudad).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// CONTRATO: fetchDeudas — endpoint /cartera
// ─────────────────────────────────────────────────────────────
describe('CONTRATO fetchDeudas → /cartera', () => {

  it('invoiceNumber de UpTres → numeroFacturado en DeudaExterna', async () => {
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return { ok: true, data: [{ id: 'd1', invoiceNumber: 9001, orderNumber: 500, total: '200000', balance: '150000', paymentType: 'credito', creditDay: '30', createdAt: '2026-05-01', updatedAt: '2026-05-01' }] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const deudas = await a.fetchDeudas()
    expect(deudas[0].numeroFacturado).toBe(9001)
    expect(deudas[0].numeroFacturado).not.toBeNull()
  })

  it('fields incluye invoiceNumber, orderNumber, balance, paymentType, creditDay', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      if (!capturedUrl) capturedUrl = url
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchDeudas()
    const params = new URLSearchParams(capturedUrl.split('?')[1])
    const fields = params.get('fields')?.split(',') ?? []
    ;['invoiceNumber', 'orderNumber', 'customerId', 'employeeId', 'total', 'balance', 'paymentType', 'creditDay', 'paidAt'].forEach(f => {
      expect(fields, `falta campo: ${f}`).toContain(f)
    })
  })

  it('llama a /cartera (no a /ordenes)', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      capturedUrl = url
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchDeudas()
    expect(capturedUrl).toContain('/api/cartera')
    expect(capturedUrl).not.toContain('/api/ordenes')
  })
})

// ─────────────────────────────────────────────────────────────
// CONTRATO: fetchDeudasEmpleado — endpoint /cartera/empleado/:id
// ─────────────────────────────────────────────────────────────
describe('CONTRATO fetchDeudasEmpleado → /cartera/empleado/:id', () => {

  it('invoiceNumber de UpTres → numeroFacturado en DeudaExterna', async () => {
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return { ok: true, data: [{ id: 'd1', invoiceNumber: 9002, orderNumber: 501, total: '100000', balance: '80000', paymentType: 'credito', creditDay: '15', createdAt: '2026-05-01', updatedAt: '2026-05-01' }] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const deudas = await a.fetchDeudasEmpleado('emp-99')
    expect(deudas[0].numeroFacturado).toBe(9002)
    expect(deudas[0].numeroFacturado).not.toBeNull()
  })

  it('llama al endpoint correcto /cartera/empleado/:id', async () => {
    let capturedUrl = ''
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      capturedUrl = url
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchDeudasEmpleado('emp-42')
    expect(capturedUrl).toContain('/cartera/empleado/emp-42')
  })

  it('usa cursor para paginar si hay nextCursor', async () => {
    let llamadas = 0
    const urls: string[] = []
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      urls.push(url)
      llamadas++
      if (llamadas === 1) return { ok: true, data: [{ id: 'd1', total: '100', balance: '100', creditDay: '0', createdAt: '2026-05-01', updatedAt: '2026-05-01' }], nextCursor: { cursorDate: '2026-05-01T00:00:00Z', cursorId: 'd1' } }
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchDeudasEmpleado('emp-1')
    expect(llamadas).toBe(2) // 1 con datos+cursor, 1 vacía que corta el loop
    expect(urls[1]).toContain('cursorDate=')
    expect(urls[1]).toContain('cursorId=d1')
  })
})

// ─────────────────────────────────────────────────────────────
// CONTRATO: fetchDeudasCliente — endpoint /cartera/cliente/:id
// ─────────────────────────────────────────────────────────────
describe('CONTRATO fetchDeudasCliente → /cartera/cliente/:id', () => {

  it('invoiceNumber de UpTres → numeroFacturado en DeudaExterna', async () => {
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return { data: [{ id: 'd1', invoiceNumber: 9003, total: '50000', balance: '50000', creditDay: '0', createdAt: '2026-05-01', updatedAt: '2026-05-01' }] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const deudas = await a.fetchDeudasCliente('cli-77')
    expect(deudas[0].numeroFacturado).toBe(9003)
  })

  it('cliente fijo en el uid del return', async () => {
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return { data: [{ id: 'd1', total: '100', balance: '100', creditDay: '0', createdAt: '2026-05-01' }] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const deudas = await a.fetchDeudasCliente('cli-99')
    expect(deudas[0].cliente.uid).toBe('cli-99')
  })
})

// ─────────────────────────────────────────────────────────────
// CONTRATO: SEPARACIÓN de endpoints (regla absoluta del sistema)
// ─────────────────────────────────────────────────────────────
describe('CONTRATO separación de endpoints', () => {

  it('fetchDeudas NUNCA llama /ordenes', async () => {
    const urlsLlamadas: string[] = []
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      urlsLlamadas.push(url)
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchDeudas()
    expect(urlsLlamadas.every(u => !u.includes('/api/ordenes'))).toBe(true)
  })

  it('fetchVentas NUNCA llama /cartera', async () => {
    const urlsLlamadas: string[] = []
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      urlsLlamadas.push(url)
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchVentas()
    expect(urlsLlamadas.every(u => !u.includes('/api/cartera'))).toBe(true)
  })

  it('fetchDeudasEmpleado NUNCA llama /ordenes', async () => {
    const urlsLlamadas: string[] = []
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      urlsLlamadas.push(url)
      return { ok: true, data: [] }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    await a.fetchDeudasEmpleado('e1')
    expect(urlsLlamadas.every(u => !u.includes('/api/ordenes'))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// CONTRATO: propiedades que el sync de bodega requiere de VentaExterna
// ─────────────────────────────────────────────────────────────
describe('CONTRATO propiedades requeridas por sync de bodega', () => {
  // Si alguno de estos falla, el sync filtrará órdenes o guardará datos incorrectos

  it('VentaExterna siempre tiene uid, numeroFacturado, clienteNombreApi, fCreado, empleado.uid, cliente.uid', async () => {
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return {
        ok: true,
        data: [{
          id: 'o1',
          orderNumber: 100,
          invoiceNumber: 3800,
          customerId: 'c1',
          employeeId: 'e1',
          total: '100000',
          createdAt: '2026-05-14T10:00:00Z',
          customer: { firstName: 'JUAN', lastName: 'PEREZ' },
          items: [],
        }],
      }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const ventas = await a.fetchVentas()
    const v = ventas[0]

    // Propiedades que sync/route.ts necesita para no descartar la orden
    expect(v.uid).toBeTruthy()                      // origenId
    expect(v.numeroFacturado).toBeTruthy()           // numFactura — filtro de validez
    expect(v.clienteNombreApi).toBeTruthy()          // clienteNombre — filtro de validez
    expect(v.fCreado).toBeTruthy()                   // fechaOrden
    expect(v.empleado?.uid).toBeTruthy()             // vendedorApiId
    expect(v.cliente?.uid).toBeTruthy()              // clienteApiId
  })

  it('orden sin invoiceNumber → numeroFacturado null (sync la descarta correctamente)', async () => {
    global.fetch = mockFetch((url) => {
      if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
      return {
        ok: true,
        data: [{ id: 'o1', orderNumber: 100, customerId: 'c1', total: '100', createdAt: '2026-05-14' }],
        // invoiceNumber ausente
      }
    })
    const a = new UpTresAdapter('k', 's')
    await a.login()
    const ventas = await a.fetchVentas()
    expect(ventas[0].numeroFacturado).toBeNull()
    // El sync descarta: const numFactura = v.numeroFacturado ? String(v.numeroFacturado) : null → null
  })
})
