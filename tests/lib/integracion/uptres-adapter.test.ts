import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'

// Helper: mock global.fetch para devolver respuestas customizadas por test
function mockFetch(responder: (url: string, init?: RequestInit) => any) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const resultado = responder(url, init)
    if (resultado instanceof Error) throw resultado
    const text = typeof resultado === 'string' ? resultado : JSON.stringify(resultado)
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(text),
      text: async () => text,
    } as any
  })
}

describe('lib/integracion/adapters/uptres — UpTresAdapter', () => {
  let originalFetch: any
  beforeEach(() => {
    originalFetch = global.fetch
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('login', () => {
    it('POST a /auth/api con apiKey + apiSecret, guarda token', async () => {
      const calls: any[] = []
      global.fetch = mockFetch((url, init) => {
        calls.push({ url, body: JSON.parse(init!.body as string) })
        return { ok: true, token: 'jwt-xyz' }
      })
      const a = new UpTresAdapter('key-1', 'secret-1')
      await a.login()
      expect(calls[0].url).toBe('https://serviceuptres.cloud/external/v1/auth/api')
      expect(calls[0].body).toEqual({ apiKey: 'key-1', apiSecret: 'secret-1' })
      // El token queda guardado para futuras llamadas (Authorization header)
      global.fetch = mockFetch((url, init) => {
        const auth = (init?.headers as any)?.Authorization
        if (auth !== 'Bearer jwt-xyz') throw new Error('token incorrecto: ' + auth)
        return { ok: true, data: [] }
      })
      await a.fetchClientes() // ejecuta para verificar header
    })

    it('respuesta sin ok=true → throws', async () => {
      global.fetch = mockFetch(() => ({ ok: false, msg: 'credenciales inválidas' }))
      const a = new UpTresAdapter('k', 's')
      await expect(a.login()).rejects.toThrow(/credenciales/i)
    })

    it('respuesta sin token → throws', async () => {
      global.fetch = mockFetch(() => ({ ok: true })) // ok pero sin token
      const a = new UpTresAdapter('k', 's')
      await expect(a.login()).rejects.toThrow(/login uptres fallido/i)
    })
  })

  describe('headers de autenticación', () => {
    it('x-api-key + Authorization Bearer en cada request post-login', async () => {
      const headers: any[] = []
      global.fetch = mockFetch((url, init) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        headers.push(init?.headers)
        return { ok: true, data: [] }
      })
      const a = new UpTresAdapter('mi-key', 'mi-secret')
      await a.login()
      await a.fetchClientes()
      expect(headers[0]['x-api-key']).toBe('mi-key')
      expect(headers[0]['Authorization']).toBe('Bearer tok')
    })
  })

  describe('fetchClientes', () => {
    beforeEach(async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return { ok: true, data: [] }
      })
    })

    it('mapea campos de UpTres al formato interno', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return {
          ok: true,
          data: [{
            id: 'c-uptres-1',
            firstName: 'CARLOS',
            lastName: 'LOZADA',
            document: '900111',
            email: 'c@x.com',
            phone: '+573001234567',
            address: 'CRA 5 #10',
            cityId: '73001', // Ibagué
            neighborhood: 'Centro',
            tradeName: 'Tienda Carlos',
            updatedAt: '2026-05-01T00:00:00Z',
          }],
        }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const clientes = await a.fetchClientes()
      expect(clientes).toHaveLength(1)
      expect(clientes[0]).toMatchObject({
        uid: 'c-uptres-1',
        _id: 'c-uptres-1',
        doc: '900111',
        name: 'CARLOS',
        lastName: 'LOZADA',
        email: 'c@x.com',
        nCel: '+573001234567',
        dir: 'CRA 5 #10',
        ciudad: 'IBAGUE', // resuelto via municipios_dane.json
        barrio: 'Centro',
        nombreComercial: 'Tienda Carlos',
        fModificado: '2026-05-01T00:00:00Z',
      })
      expect(clientes[0].departamento).toBeTruthy() // resuelto via departamentos_dane
    })

    it('cityId desconocido → ciudad y departamento null', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return { ok: true, data: [{ id: 'c1', cityId: '00000' }] }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const clientes = await a.fetchClientes()
      expect(clientes[0].ciudad).toBeNull()
      expect(clientes[0].departamento).toBeNull()
    })

    it('cityId ausente → ambos null', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return { ok: true, data: [{ id: 'c1' }] }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const clientes = await a.fetchClientes()
      expect(clientes[0].ciudad).toBeNull()
      expect(clientes[0].departamento).toBeNull()
    })

    it('con desde → agrega param "desde" en formato YYYY-MM-DD', async () => {
      let capturedUrl = ''
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        capturedUrl = url
        return { ok: true, data: [] }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      await a.fetchClientes(new Date('2026-05-01T10:30:00Z'))
      expect(capturedUrl).toContain('desde=2026-05-01')
    })

    it('paginación con nextCursor → varias páginas concatenadas', async () => {
      let llamada = 0
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        llamada++
        if (llamada === 1) return {
          ok: true,
          data: [{ id: 'c1' }, { id: 'c2' }],
          nextCursor: { cursorDate: '2026-04-15', cursorId: 'c2' },
        }
        if (llamada === 2) return {
          ok: true,
          data: [{ id: 'c3' }],
          nextCursor: { cursorDate: '2026-04-20', cursorId: 'c3' },
        }
        return { ok: true, data: [] } // página final vacía
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const clientes = await a.fetchClientes()
      expect(clientes.map(c => c.uid)).toEqual(['c1', 'c2', 'c3'])
    })

    it('respuesta sin ok=true → corta el loop sin throw', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return { ok: false, msg: 'error temporal' }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const clientes = await a.fetchClientes()
      expect(clientes).toEqual([])
    })
  })

  describe('fetchDeudas', () => {
    it('mapea campos contables del API al formato DeudaExterna', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return {
          ok: true,
          data: [{
            id: 'ord-1',
            orderNumber: 101,
            invoiceNumber: 555,
            customerId: 'cli-1',
            employeeId: 'emp-1',
            total: '500000',
            balance: '300000',
            paymentType: 'credito',
            creditDay: '30',
            paidAt: null,
            createdAt: '2026-05-01T00:00:00Z',
            updatedAt: '2026-05-10T00:00:00Z',
          }],
        }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const deudas = await a.fetchDeudas()
      expect(deudas[0]).toMatchObject({
        uid: 'ord-1',
        numeroOrden: 101,
        numeroFacturado: 555,
        vTotal: '500000',
        vSaldo: '300000',
        vAbono: '200000', // total - balance
        dias: '30',
        cliente: { uid: 'cli-1' },
        empleado: { uid: 'emp-1' },
      })
    })

    it('sin paidAt pero con creditDay+createdAt → calcula fPago (createdAt + N días)', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return {
          ok: true,
          data: [{
            id: 'ord-1',
            total: '100',
            balance: '100',
            creditDay: '15',
            createdAt: '2026-05-01T00:00:00Z',
            paidAt: null,
          }],
        }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const deudas = await a.fetchDeudas()
      // 01-may + 15 días = 16-may
      expect(deudas[0].fPago).toBe('2026-05-16T00:00:00.000Z')
    })

    it('con paidAt → usa paidAt directo (sin calcular)', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return {
          ok: true,
          data: [{
            id: 'ord-1', total: '100', balance: '0',
            paidAt: '2026-05-08T12:00:00Z',
            creditDay: '99', createdAt: '2026-01-01',
          }],
        }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const deudas = await a.fetchDeudas()
      expect(deudas[0].fPago).toBe('2026-05-08T12:00:00Z')
    })

    it('con desde → agrega params from/to (rango)', async () => {
      let capturedUrl = ''
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        capturedUrl = url
        return { ok: true, data: [] }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      await a.fetchDeudas(new Date('2026-05-01T00:00:00Z'))
      expect(capturedUrl).toContain('from=2026-05-01')
      expect(capturedUrl).toContain('to=')
    })

    it('condition=true por default en fetchAll', async () => {
      let capturedUrl = ''
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        capturedUrl = url
        return { ok: true, data: [] }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      await a.fetchDeudas()
      // Sync completo usa fetchAllSinCondition — sin filtro condition (trae todas)
      expect(capturedUrl).not.toContain('condition=true')
      expect(capturedUrl).toContain('fields=')
    })
  })

  describe('fetchDeudasCliente', () => {
    it('llama al endpoint /cartera/cliente/:id con condition=true', async () => {
      let capturedUrl = ''
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        capturedUrl = url
        return { data: [{ id: 'ord-1', total: '100', balance: '50', creditDay: '0', createdAt: '2026-05-01' }] }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const deudas = await a.fetchDeudasCliente('cli-X')
      expect(capturedUrl).toContain('/cartera/cliente/cli-X')
      expect(capturedUrl).toContain('condition=true')
      expect(deudas[0].cliente.uid).toBe('cli-X')
    })

    it('respuesta sin data → array vacío (no throws)', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return {}
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const deudas = await a.fetchDeudasCliente('cli-X')
      expect(deudas).toEqual([])
    })
  })

  describe('fetchVentas', () => {
    it('combina activas (condition=true) y cerradas (condition=false) deduplicando por id', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        if (url.includes('condition=true')) return {
          ok: true,
          data: [
            { id: 'o1', orderNumber: 1, total: '100', customerId: 'c1', createdAt: '2026-05-01' },
            { id: 'o2', orderNumber: 2, total: '200', customerId: 'c1', createdAt: '2026-05-02' },
          ],
        }
        if (url.includes('condition=false')) return {
          ok: true,
          data: [
            { id: 'o2', orderNumber: 2, total: '200', customerId: 'c1', createdAt: '2026-05-02' }, // dup
            { id: 'o3', orderNumber: 3, total: '300', customerId: 'c1', createdAt: '2026-05-03' },
          ],
        }
        return { ok: true, data: [] }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const ventas = await a.fetchVentas()
      // 3 distintas, no 4 (o2 deduplicada)
      expect(ventas.map(v => v.uid).sort()).toEqual(['o1', 'o2', 'o3'])
    })

    it('expand=customer mapea clienteNombreApi de firstName+lastName', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return {
          ok: true,
          data: [{
            id: 'o1', total: '100', customerId: 'c1', createdAt: '2026-05-01',
            customer: { firstName: 'ANA', lastName: 'PEREZ' },
          }],
        }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const ventas = await a.fetchVentas()
      expect(ventas[0].clienteNombreApi).toBe('ANA PEREZ')
    })

    it('customer sin firstName/lastName → tradeName como fallback', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return {
          ok: true,
          data: [{
            id: 'o1', total: '100', customerId: 'c1', createdAt: '2026-05-01',
            customer: { tradeName: 'Tienda La Esquina' },
          }],
        }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const ventas = await a.fetchVentas()
      expect(ventas[0].clienteNombreApi).toBe('Tienda La Esquina')
    })

    it('sin customer expandido → clienteNombreApi null', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return {
          ok: true,
          data: [{ id: 'o1', total: '100', customerId: 'c1', createdAt: '2026-05-01' }],
        }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const ventas = await a.fetchVentas()
      expect(ventas[0].clienteNombreApi).toBeNull()
    })

    it('sin desde explícito → desde 90 días atrás (ventana móvil)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-12T00:00:00Z'))
      let capturedUrl = ''
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        if (!capturedUrl) capturedUrl = url
        return { ok: true, data: [] }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      await a.fetchVentas()
      // 90 días antes del 2026-05-12 ≈ 2026-02-11
      expect(capturedUrl).toContain('from=2026-02-11')
      vi.useRealTimers()
    })

    it('con customerId → agrega filtro', async () => {
      let capturedUrl = ''
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        if (url.includes('condition=true')) capturedUrl = url
        return { ok: true, data: [] }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      await a.fetchVentas(undefined, 'cli-X')
      expect(capturedUrl).toContain('customerId=cli-X')
    })
  })

  describe('fetchEmpleados', () => {
    it('mapea campos del API al formato interno', async () => {
      global.fetch = mockFetch((url) => {
        if (url.includes('/auth/api')) return { ok: true, token: 'tok' }
        return {
          ok: true,
          data: [{
            id: 'emp-1', firstName: 'CARLOS', lastName: 'LOZADA',
            document: '79123456', email: 'cl@x.com',
            phone: '+573001112233', cityId: '73001',
            updatedAt: '2026-05-01',
          }],
        }
      })
      const a = new UpTresAdapter('k', 's')
      await a.login()
      const empleados = await a.fetchEmpleados()
      expect(empleados[0]).toMatchObject({
        uid: 'emp-1', name: 'CARLOS', lastName: 'LOZADA',
        doc: '79123456', email: 'cl@x.com',
        nCel: '+573001112233', ciudad: 'IBAGUE',
        fModificado: '2026-05-01',
      })
    })
  })
})
