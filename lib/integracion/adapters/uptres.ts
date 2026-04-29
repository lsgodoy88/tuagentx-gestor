import type { AdaptadorIntegracion, ClienteExterno, DeudaExterna, EmpleadoExterno, VentaExterna } from '../types'
import fs from 'fs'
import path from 'path'

const BASE = 'https://serviceuptres.cloud/external/v1/api'
const AUTH_URL = 'https://serviceuptres.cloud/external/v1/auth/api'

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

export class UpTresAdapter implements AdaptadorIntegracion {
  private token: string = ''

  constructor(private apiKey: string, private apiSecret: string) {}

  async login(): Promise<void> {
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: this.apiKey, apiSecret: this.apiSecret }),
    })
    const d = await res.json()
    if (!d.ok || !d.token) throw new Error('Login UpTres fallido: ' + (d.msg || ''))
    this.token = d.token
  }

  private get headers() {
    return { 'x-api-key': this.apiKey, 'Authorization': this.token }
  }

  private async fetchAll(endpoint: string, extraParams: Record<string, string> = {}): Promise<any[]> {
    const todos: any[] = []
    let cursorDate: string | null = null
    let cursorId: string | null = null

    while (true) {
      const p = new URLSearchParams({ limit: '100', condition: 'true', ...extraParams })
      if (cursorDate && cursorId) {
        p.set('cursorDate', cursorDate)
        p.set('cursorId', cursorId)
      }
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

  async fetchClientes(desde?: Date): Promise<ClienteExterno[]> {
    const params: Record<string, string> = {
      fields: 'id,firstName,lastName,document,email,phone,address,cityId,neighborhood,tradeName,updatedAt',
      includeTotal: 'false',
    }
    if (desde) params.desde = desde.toISOString().split('T')[0]
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
    if (desde) params.desde = desde.toISOString().split('T')[0]
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
      fields: 'id,orderNumber,invoiceNumber,customerId,employeeId,total,balance,paymentType,creditDay,createdAt,updatedAt',
      includeTotal: 'false',
    }
    const fromDate = desde ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    params.from = fromDate.toISOString().split('T')[0]
    params.to = new Date().toISOString().split('T')[0]
    const data = await this.fetchAll('cartera', params)
    return data.map((o: any) => ({
      uid: o.id,
      _id: o.id,
      numeroOrden: o.orderNumber,
      numeroFacturado: o.invoiceNumber || null,
      vTotal: o.total,
      vSaldo: o.balance,
      mediopago: o.paymentType,
      fCreado: o.createdAt,
      fModificado: o.updatedAt,
      condition: true,
      cliente: { uid: o.customerId },
      empleado: { uid: o.employeeId },
    }))
  }

  async fetchDeudasCliente(clienteId: string): Promise<DeudaExterna[]> {
    const res = await fetch(
      `${BASE}/cartera/cliente/${clienteId}?fields=id,orderNumber,total,balance,paymentType,createdAt,updatedAt&condition=true`,
      { headers: this.headers }
    )
    const d = await res.json()
    return (d.data || []).map((o: any) => ({
      uid: o.id,
      _id: o.id,
      numeroOrden: o.orderNumber,
      vTotal: o.total,
      vSaldo: o.balance,
      mediopago: o.paymentType,
      fCreado: o.createdAt,
      fModificado: o.updatedAt,
      condition: true,
      cliente: { uid: clienteId },
      empleado: { uid: null },
    }))
  }

  async fetchVentas(desde?: Date): Promise<VentaExterna[]> {
    const params: Record<string, string> = {
      fields: 'id,orderNumber,invoiceNumber,customerId,employeeId,total,balance,paymentType,isDelivered,isShipped,items,createdAt,updatedAt',
      expand: 'customer,items',
      includeTotal: 'false',
    }
    const fromDate = desde ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    params.from = fromDate.toISOString().split('T')[0]
    params.to = new Date().toISOString().split('T')[0]
    const data = await this.fetchAll('ordenes', params)
    return data.map((o: any) => ({
      uid: o.id,
      _id: o.id,
      numeroOrden: o.orderNumber,
      numeroFacturado: o.invoiceNumber || null,
      vTotal: o.total,
      fCreado: o.createdAt,
      fModificado: o.updatedAt,
      condition: true,
      cliente: { uid: o.customerId },
      empleado: { uid: o.employeeId },
      productos: o.items || [],
    }))
  }
}
