import type { AdaptadorIntegracion, ClienteExterno, DeudaExterna, EmpleadoExterno, VentaExterna } from '../types'
import fs from 'fs'
import path from 'path'

const BASE = 'https://serviceuptres.cloud/external/v1/api'
const AUTH_URL = 'https://serviceuptres.cloud/external/v1/auth/api'

/**
 * UpTres entrega fechas (createdAt, invoicedAt) como string ISO con sufijo "Z",
 * pero el valor numérico YA es hora Bogotá local, no UTC real (confirmado contra
 * la fuente original 24/06: UpTres muestra "2026-06-19 16:11:18" como la hora real
 * de creación, sin offset — exactamente igual al string que entrega vía API).
 *
 * Esta función interpreta el string ignorando el sufijo "Z" engañoso, y construye
 * el instante UTC correcto sumando el offset de Bogotá (+5h). Usar SIEMPRE esta
 * función al guardar fechaOrden/fechaFactura desde datos de UpTres — nunca
 * `new Date(stringDeUptres)` directo, y nunca restar/sumar 5h manualmente después.
 */
export function parseFechaUptresBogota(fechaUptres: string | null | undefined): Date | null {
  if (!fechaUptres) return null
  // Extrae componentes ignorando timezone que el string pueda llevar (Z, +00:00, etc.)
  const m = fechaUptres.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, anio, mes, dia, hora, min, seg] = m.map(Number) as unknown as number[]
  // Date.UTC con estos componentes + 5h da el instante UTC real equivalente a esa hora Bogotá
  return new Date(Date.UTC(anio, mes - 1, dia, hora, min, seg) + 5 * 60 * 60 * 1000)
}

// Cargar tablas DANE
const municipiosPath = path.join(process.cwd(), 'public/municipios_dane.json')
const departamentosPath = path.join(process.cwd(), 'public/departamentos_dane.json')
const municipiosDANE: Record<string, string> = JSON.parse(fs.readFileSync(municipiosPath, 'utf-8'))
const departamentosDANE: Record<string, string> = JSON.parse(fs.readFileSync(departamentosPath, 'utf-8'))

function getCiudad(cityId?: string | number | null): string | null {
  if (!cityId) return null
  const key = String(cityId)
  return municipiosDANE[key] || null
}

function getDepartamento(cityId?: string | number | null): string | null {
  if (!cityId) return null
  const key = String(cityId)
  const depKey = key.length === 5 ? key.slice(0, 2) : key.length === 4 ? key.slice(0, 1) : null
  if (!depKey) return null
  return departamentosDANE[depKey] || null
}

// Cache global de tokens UpTres (vida ~1h). Clave: apiKey
const tokenCache = new Map<string, { token: string; expiraEn: number }>()

export class UpTresAdapter implements AdaptadorIntegracion {
  private token: string = ''

  constructor(private apiKey: string, private apiSecret: string) {}

  async login(): Promise<void> {
    // Reusar token cacheado si está vigente (margen 5 min)
    const cached = tokenCache.get(this.apiKey)
    if (cached && cached.expiraEn > Date.now() + 5 * 60 * 1000) {
      this.token = cached.token
      return
    }
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: this.apiKey, apiSecret: this.apiSecret }),
    })
    const d = await res.json()
    if (!d.ok || !d.token) throw new Error('Login UpTres fallido: ' + (d.msg || ''))
    this.token = d.token
    // UpTres firma JWT con expiración ~1h; cacheamos por 55min
    tokenCache.set(this.apiKey, { token: d.token, expiraEn: Date.now() + 55 * 60 * 1000 })
  }

  private get headers() {
    return { 'x-api-key': this.apiKey, 'Authorization': `Bearer ${this.token}` }
  }

  private async fetchAllSinCondition(endpoint: string, extraParams: Record<string, string> = {}): Promise<any[]> {
    const todos: any[] = []
    let cursorDate: string | null = null
    let cursorId: string | null = null
    let pagina = 0
    const MAX_PAGINAS = 200 // guardia anti-loop infinito — 200 × 100 = 20k registros
    while (pagina++ < MAX_PAGINAS) {
      const p = new URLSearchParams({ limit: '100', ...extraParams })
      if (cursorDate && cursorId) { p.set('cursorDate', cursorDate); p.set('cursorId', cursorId) }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
      const res = await fetch(`${BASE}/${endpoint}?${p.toString()}`, { headers: this.headers, signal: controller.signal })
      clearTimeout(timer)
      const text = await res.text()
      if (!text) break
      const d = JSON.parse(text)
      if (!d.ok || !Array.isArray(d.data) || d.data.length === 0) break
      todos.push(...d.data)
      if (!d.nextCursor?.cursorDate || !d.nextCursor?.cursorId) break
      cursorDate = d.nextCursor.cursorDate
      cursorId = d.nextCursor.cursorId
    }
    return todos
  }

  private async fetchAll(endpoint: string, extraParams: Record<string, string> = {}): Promise<any[]> {
    const todos: any[] = []
    let cursorDate: string | null = null
    let cursorId: string | null = null
    let pagina = 0
    const MAX_PAGINAS = 200
    const MAX_REINTENTOS = 3
    while (pagina++ < MAX_PAGINAS) {
      const p = new URLSearchParams({ limit: '100', ...extraParams })
      if (cursorDate && cursorId) {
        p.set('cursorDate', cursorDate)
        p.set('cursorId', cursorId)
      }
      let texto = ''
      let exitoso = false
      for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 30000)
          const res = await fetch(`${BASE}/${endpoint}?${p.toString()}`, { headers: this.headers, signal: controller.signal })
          clearTimeout(timer)
          texto = await res.text()
          exitoso = true
          break
        } catch {
          if (intento < MAX_REINTENTOS - 1) await new Promise(r => setTimeout(r, 2000 * (intento + 1)))
        }
      }
      if (!exitoso || !texto) {
        throw new Error(`UpTres no respondió tras ${MAX_REINTENTOS} reintentos — endpoint: ${endpoint}`)
      }
      let d: any
      try { d = JSON.parse(texto) } catch { 
        throw new Error(`UpTres respuesta inválida (no JSON) — endpoint: ${endpoint}`)
      }
      if (!d.ok) {
        throw new Error(`UpTres error — ${d.msg || d.message || 'sin mensaje'} — endpoint: ${endpoint}`)
      }
      if (!Array.isArray(d.data) || d.data.length === 0) break
      todos.push(...d.data)
      if (!d.nextCursor?.cursorDate || !d.nextCursor?.cursorId) break
      cursorDate = d.nextCursor.cursorDate
      cursorId = d.nextCursor.cursorId
    }
    return todos
  }



  async fetchClientes(desde?: Date): Promise<ClienteExterno[]> {
    const params: Record<string, string> = {
      fields: 'id,firstName,lastName,document,email,phone,address,cityId,neighborhood,tradeName,updatedAt',
      includeTotal: 'false',
    }
    if (desde) params.desde = desde.toISOString()  // ISO completo con hora para no perder clientes del mismo día
    const data = await this.fetchAll('clientes', params)
    return data.map((c: any) => ({
      uid: c.id,
      _id: c.id,
      doc: c.document || null,
      name: c.firstName || '',
      lastName: c.lastName || '',
      email: c.email || null,
      nCel: c.phone || null,
      dir: c.address || null,
      ciudad: getCiudad(c.cityId),
      departamento: getDepartamento(c.cityId),
      barrio: c.neighborhood || null,
      nombreComercial: c.tradeName || null,
      fModificado: c.updatedAt,
    }))
  }

  async fetchEmpleados(desde?: Date): Promise<EmpleadoExterno[]> {
    const params: Record<string, string> = {
      fields: 'id,firstName,lastName,document,email,phone,cityId,updatedAt',
      includeTotal: 'false',
    }
    if (desde) params.desde = desde.toISOString()  // ISO completo
    const data = await this.fetchAll('empleados', params)
    return data.map((e: any) => ({
      uid: e.id,
      _id: e.id,
      name: e.firstName || '',
      lastName: e.lastName || '',
      doc: e.document || null,
      email: e.email || null,
      nCel: e.phone || null,
      ciudad: getCiudad(e.cityId),
      fModificado: e.updatedAt,
    }))
  }

  async fetchDeudas(desde?: Date): Promise<DeudaExterna[]> {
    const params: Record<string, string> = {
      fields: 'id,orderNumber,invoiceNumber,customerId,employeeId,total,balance,paymentType,creditDay,paidAt,createdAt,updatedAt',
      includeTotal: 'false',
    }
    if (desde) {
      // Delta: convertir a fecha Bogotá (UTC-5) antes de truncar — evita desfase de día
      const desdeBogota = new Date(desde.getTime() - 5 * 60 * 60 * 1000)
      params.from = desdeBogota.toISOString().split('T')[0]
      const manana = new Date(); manana.setDate(manana.getDate() + 1)
      params.to = manana.toISOString().split('T')[0]
    }
    // Sin filtro condition — traemos todo y filtramos internamente por saldo > 0
    const data = await this.fetchAll('cartera', params)
    return this._mapearDeudas(data)
  }

  private _mapearDeudas(data: any[]): DeudaExterna[] {
    return data.map((o: any) => {
      let fPago: string | null = o.paidAt || null
      if (!fPago && o.creditDay && o.createdAt) {
        const dias = parseInt(o.creditDay || '0')
        if (dias > 0) {
          const fecha = new Date(o.createdAt)
          fecha.setDate(fecha.getDate() + dias)
          fPago = fecha.toISOString()
        }
      }
      return {
        uid: o.id,
        _id: o.id,
        numeroOrden: o.orderNumber,
        numeroFacturado: o.invoiceNumber || null,
        vTotal: o.total,
        vSaldo: o.balance,
        vAbono: String(parseFloat(o.total || '0') - parseFloat(o.balance || '0')),
        dias: o.creditDay || '0',
        mediopago: o.paymentType,
        fCreado: o.createdAt,
        fPago: fPago ?? undefined,
        fModificado: o.updatedAt,
        receivableAt: o.receivableAt || null,
        cliente: { uid: o.customerId },
        empleado: { uid: o.employeeId },
        condicionUpTres: o._condicionUpTres !== false,
      }
    })
  }

  // Delta de cartera — solo deudas con pagos desde 'desde' (filtra por receivableAt)
  // Usa /cartera/update — receivableAt ya viene en hora Bogotá, sin conversión
  async fetchDeudasDesde(desde: Date): Promise<DeudaExterna[]> {
    const manana = new Date(); manana.setDate(manana.getDate() + 1)
    const params: Record<string, string> = {
      fields: 'id,orderNumber,invoiceNumber,customerId,employeeId,total,balance,paymentType,creditDay,paidAt,createdAt,updatedAt,receivableAt,condition',
      from: desde.toISOString().split('T')[0],
      to: manana.toISOString().split('T')[0],
      includeTotal: 'false',
    }
    const data = await this.fetchAll('cartera/update', params)
    return data.map((o: any) => ({
      uid: o.id,
      _id: o.id,
      numeroOrden: o.orderNumber,
      numeroFacturado: o.invoiceNumber || null,
      vTotal: o.total,
      vSaldo: o.balance,
      vAbono: String(parseFloat(o.total || '0') - parseFloat(o.balance || '0')),
      dias: o.creditDay || '0',
      fCreado: o.createdAt,
      fModificado: o.updatedAt,
      receivableAt: o.receivableAt || null,
      condicionUpTres: o.condition !== false,
      cliente: { uid: o.customerId },
      empleado: { uid: o.employeeId },
    }))
  }

  async fetchDeudasEmpleado(empleadoApiId: string): Promise<DeudaExterna[]> {
    // Solo deudas activas en UpTres (condition=true)
    const fields = 'id,orderNumber,invoiceNumber,customerId,employeeId,total,balance,paymentType,creditDay,paidAt,createdAt,updatedAt'
    const todas: any[] = []
    let cursorDate: string | null = null
    let cursorId: string | null = null
    while (true) {
      const p = new URLSearchParams({ limit: '100', condition: 'true', includeTotal: 'false', fields })
      if (cursorDate && cursorId) { p.set('cursorDate', cursorDate); p.set('cursorId', cursorId) }
      const res = await fetch(`${BASE}/cartera/empleado/${empleadoApiId}?${p.toString()}`, { headers: this.headers })
      const d = await res.json()
      if (!d.ok || !Array.isArray(d.data) || d.data.length === 0) break
      todas.push(...d.data)
      if (!d.nextCursor?.cursorDate || !d.nextCursor?.cursorId) break
      cursorDate = d.nextCursor.cursorDate
      cursorId = d.nextCursor.cursorId
    }
    return todas.map((o: any) => {
      let fPago: string | null = o.paidAt || null
      if (!fPago && o.creditDay && o.createdAt) {
        const dias = parseInt(o.creditDay || '0')
        if (dias > 0) {
          const fecha = new Date(o.createdAt)
          fecha.setDate(fecha.getDate() + dias)
          fPago = fecha.toISOString()
        }
      }
      return {
        uid: o.id,
        _id: o.id,
        numeroOrden: o.orderNumber,
        numeroFacturado: o.invoiceNumber || null,
        vTotal: o.total,
        vSaldo: o.balance,
        vAbono: String(parseFloat(o.total || '0') - parseFloat(o.balance || '0')),
        dias: o.creditDay || '0',
        mediopago: o.paymentType,
        fCreado: o.createdAt,
        fPago: fPago ?? undefined,
        fModificado: o.updatedAt,
        receivableAt: o.receivableAt || null,
        cliente: { uid: o.customerId },
        empleado: { uid: o.employeeId },
        condicionUpTres: o._condicionUpTres !== false, // true=activa, false=cerrada con saldo
      }
    })
  }

  async fetchDeudasClienteInactivas(clienteId: string): Promise<DeudaExterna[]> {
    // Igual que fetchDeudasCliente pero con condition=false — para actualizar saldos desactualizados
    const res = await fetch(
      `${BASE}/cartera/cliente/${clienteId}?fields=id,orderNumber,invoiceNumber,total,balance,paymentType,creditDay,paidAt,createdAt,updatedAt&condition=false`,
      { headers: this.headers }
    )
    const d = await res.json()
    return (d.data || []).map((o: any) => this._mapDeudaExterna(o))
  }

  async fetchDeudasCliente(clienteId: string): Promise<DeudaExterna[]> {
    const res = await fetch(
      `${BASE}/cartera/cliente/${clienteId}?fields=id,orderNumber,invoiceNumber,total,balance,paymentType,creditDay,paidAt,createdAt,updatedAt&condition=true`,
      { headers: this.headers }
    )
    const d = await res.json()
    return (d.data || []).map((o: any) => this._mapDeudaExterna(o, clienteId))
  }

  private _mapDeudaExterna(o: any, clienteId?: string): DeudaExterna {
    let fPago: string | null = o.paidAt || null
    if (!fPago && o.creditDay && o.createdAt) {
      const dias = parseInt(o.creditDay || '0')
      if (dias > 0) {
        const fecha = new Date(o.createdAt)
        fecha.setDate(fecha.getDate() + dias)
        fPago = fecha.toISOString()
      }
    }
    return {
      uid: o.id,
      _id: o.id,
      numeroOrden: o.orderNumber,
      numeroFacturado: o.invoiceNumber || null,
      vTotal: o.total,
      vSaldo: o.balance,
      dias: o.creditDay || '0',
      mediopago: o.paymentType,
      fCreado: o.createdAt,
      fPago: fPago ?? undefined,
      fModificado: o.updatedAt,
      receivableAt: o.receivableAt || null,
      cliente: { uid: clienteId || o.customerId || '' },
      empleado: { uid: o.employeeId || null },
    }
  }

  async fetchOrdenPorId(origenId: string): Promise<{ isInvoiced: boolean; invoiceNumber: string | null; invoicedAt: string | null; total: string } | null> {
    await this.login()
    const fields = 'id,orderNumber,invoiceNumber,isInvoiced,invoicedAt,total'
    try {
      const res = await fetch(`${BASE}/ordenes/${origenId}?fields=${fields}`, { headers: this.headers })
      if (!res.ok) return null
      const d = await res.json()
      if (!d.ok || !d.data) return null
      return {
        isInvoiced: d.data.isInvoiced === true,
        invoiceNumber: d.data.invoiceNumber ? String(d.data.invoiceNumber) : null,
        invoicedAt: d.data.invoicedAt && d.data.invoicedAt > '2001' ? d.data.invoicedAt : null,
        total: d.data.total,
      }
    } catch (e) { return null }
  }

  // Trae una orden completa por origenId — campos suficientes para insertar en BD
  // Usado por el reconciliador de consecutivos cuando detecta huecos
  async fetchOrdenCompletaPorId(origenId: string): Promise<{
    origenId: string
    numeroOrden: string
    numeroFactura: string | null
    isFacturada: boolean
    fechaFactura: string | null
    totalOrden: number | null
    balance: number | null
    paymentType: string | null
    paymentMethod: string | null
    clienteApiId: string | null
    clienteNit: string | null
    clienteNombre: string | null
    vendedorApiId: string | null
    createdAt: string | null
  } | null> {
    await this.login()
    const fields = 'id,orderNumber,invoiceNumber,isInvoiced,invoicedAt,total,balance,paymentType,paymentMethod,customerId,employeeId,createdAt,creditDay'
    try {
      const res = await fetch(`${BASE}/ordenes/${origenId}?fields=${fields}&expand=customer`, { headers: this.headers })
      if (!res.ok) return null
      const d = await res.json()
      if (!d.ok || !d.data) return null
      const o = d.data
      const c = o.customer || {}
      return {
        origenId,
        numeroOrden: String(o.orderNumber || ''),
        numeroFactura: o.invoiceNumber ? String(o.invoiceNumber) : null,
        isFacturada: o.isInvoiced === true,
        fechaFactura: o.invoicedAt && o.invoicedAt > '2001' ? o.invoicedAt : null,
        totalOrden: o.total ? parseFloat(o.total) : null,
        balance: o.balance ? parseFloat(o.balance) : null,
        paymentType: o.paymentType || null,
        paymentMethod: o.paymentMethod || null,
        clienteApiId: o.customerId || null,
        clienteNit: c.document ? String(c.document) : null,
        clienteNombre: c.firstName ? `${c.firstName} ${c.lastName || ''}`.trim() : null,
        vendedorApiId: o.employeeId || null,
        createdAt: o.createdAt || null,
      }
    } catch (e) { return null }
  }

  async fetchVentas(desde?: Date, customerId?: string): Promise<VentaExterna[]> {
    const baseParams: Record<string, string> = {
      fields: 'id,orderNumber,invoiceNumber,isInvoiced,invoicedAt,customerId,employeeId,total,discount,balance,paymentType,paymentMethod,isDelivered,isShipped,isCompleted,amountItems,comment,createdAt,updatedAt,cityId,address,phone,items',
      expand: 'customer,items',
      includeTotal: 'false',
    }
    const fromDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // siempre 10 días — cubre facturas creadas antes y facturadas hoy
    baseParams.from = fromDate.toISOString().split('T')[0]
    const manana = new Date(); manana.setDate(manana.getDate() + 1)
    baseParams.to = manana.toISOString().split('T')[0]
    if (customerId) baseParams.customerId = customerId

    // Traer condition=true (activas) y condition=false (cerradas) — combinar ambas
    const [activas, cerradas] = await Promise.all([
      this.fetchAllSinCondition('ordenes', { ...baseParams, condition: 'true' }),
      this.fetchAllSinCondition('ordenes', { ...baseParams, condition: 'false' }),
    ])


    // Deduplicar por id
    const mapaOrdenes = new Map<string, any>()
    for (const o of [...activas, ...cerradas]) mapaOrdenes.set(o.id, o)
    const data = Array.from(mapaOrdenes.values())

    // Marcar isActiva: true si vino de condition=true, false si de condition=false
    const idsActivas = new Set(activas.map((o: any) => o.id))
    return data.map((o: any) => ({
      uid: o.id,
      _id: o.id,
      numeroOrden: o.orderNumber,
      numeroFacturado: o.invoiceNumber || null,
      isInvoiced: o.isInvoiced === true,
      invoicedAt: o.invoicedAt || null,
      isActiva: idsActivas.has(o.id),
      vTotal: o.total,
      fCreado: o.createdAt,
      fModificado: o.updatedAt,
      // Nuevos campos UpTres
      discount: o.discount || null,
      balance: o.balance || null,
      paymentType: o.paymentType || null,
      paymentMethod: o.paymentMethod || null,
      isDelivered: o.isDelivered ?? null,
      isShipped: o.isShipped ?? null,
      isCompleted: o.isCompleted ?? null,
      amountItems: o.amountItems ? Number(o.amountItems) : null,
      cliente: { uid: o.customerId },
      empleado: { uid: o.employeeId },
      productos: o.items || [],
      clienteNombreApi: o.customer ? (`${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim() || o.customer.tradeName || o.customer.name || null) : null,
      cityId: o.cityId || o.customer?.cityId || null,
      direccion: o.address || o.customer?.address || null,
      telefono: o.phone || o.customer?.phone || null,
      clienteNit: o.customer?.document || null,
    }))
  }
}

// Exportar fetchProductos fuera de la clase para uso directo en jobs
// (igual que fetchAll interno pero público)
export async function fetchProductosUptres(
  apiKey: string,
  token: string,
  desde?: Date
): Promise<import('../types').ProductoExterno[]> {
  const todos: import('../types').ProductoExterno[] = []
  let cursorDate: string | null = null
  let cursorId: string | null = null
  let pagina = 0
  const MAX_PAGINAS = 100 // 100 × 80 = 8000 productos máx

  while (pagina++ < MAX_PAGINAS) {
    const p = new URLSearchParams({
      condition: 'true',
      fields: '',
      limit: '80',
    })
    if (desde) p.set('from', desde.toISOString().slice(0, 10))
    if (cursorDate && cursorId) {
      p.set('cursorDate', cursorDate)
      p.set('cursorId', cursorId)
    }

    let texto = ''
    let exitoso = false
    for (let intento = 0; intento < 3; intento++) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 30000)
        const res = await fetch(`${BASE}/productos?${p.toString()}`, {
          headers: { 'x-api-key': apiKey, Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        clearTimeout(timer)
        texto = await res.text()
        exitoso = true
        break
      } catch {
        if (intento < 2) await new Promise(r => setTimeout(r, 2000 * (intento + 1)))
      }
    }
    if (!exitoso || !texto) throw new Error('UpTres productos no respondió tras 3 reintentos')

    let d: any
    try { d = JSON.parse(texto) } catch { throw new Error('UpTres productos respuesta inválida') }
    if (!d.ok) throw new Error(`UpTres productos error: ${d.msg || d.message || ''}`)
    if (!Array.isArray(d.data) || d.data.length === 0) break

    todos.push(...d.data.map((p: any) => ({
      id: p.id,
      condition: p.condition ?? true,
      name: p.name || '',
      barcode: p.barcode || null,
      inventory: typeof p.inventory === 'number' ? p.inventory : parseFloat(p.inventory ?? '0') || 0,
      price: p.price != null ? parseFloat(p.price) : null,
      prices: p.prices || null,
      purchasePrice: p.purchasePrice != null ? parseFloat(p.purchasePrice) : null,
      taxable: p.taxable ?? false,
      tax: p.tax != null ? parseFloat(p.tax) : null,
      type: p.type || null,
      brand: p.brand || null,
      line: p.line || null,
      point: p.point || null,
      invima: p.invima || null,
      unit: p.unit || null,
      description: p.description || null,
      updatedAt: p.updatedAt || null,
    })))

    if (!d.nextCursor?.cursorDate || !d.nextCursor?.cursorId) break
    cursorDate = d.nextCursor.cursorDate
    cursorId = d.nextCursor.cursorId
  }
  return todos
}
