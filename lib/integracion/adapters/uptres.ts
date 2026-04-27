import type { AdaptadorIntegracion, ClienteExterno, DeudaExterna, EmpleadoExterno, VentaExterna } from '../types'

import https from 'https'
const UPTRES_URL = 'https://www.uptres.top'
const agent = new https.Agent({ rejectUnauthorized: false })

export class UpTresAdapter implements AdaptadorIntegracion {
  private email: string
  private password: string
  private token: string = ''

  private apiToken: string | null = null
  constructor(email: string, password: string, apiToken?: string) {
    this.email = email
    this.password = password
    this.apiToken = apiToken ?? null
  }

  async login(): Promise<void> {
    if (this.apiToken) { this.token = this.apiToken; return }
    const data = await new Promise<any>((resolve, reject) => {
      const body = JSON.stringify({ email: this.email, password: this.password, version: '1.6.7.2', rememberMe: false })
      const req = https.request({
        hostname: 'www.uptres.top',
        path: '/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        rejectUnauthorized: false,
      }, res => {
        let raw = ''
        res.on('data', c => raw += c)
        res.on('end', () => { try { resolve(JSON.parse(raw)) } catch(e) { reject(e) } })
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
    if (!data.token) throw new Error('Login fallido en UpTres')
    this.token = data.token
  }

  getToken(): string { return this.token }

  private async fetchPaginas(url: string, key: string): Promise<any[]> {
    const todos: any[] = []
    let pagina = 0
    while (true) {
      const res = await fetch(`${url}&page=${pagina}`, { headers: { 'x-token': this.token }, agent } as any)
      const d = await res.json()
      if (!d.ok) break
      const items = d[key] || d.dataDBArray || []
      if (!items.length) break
      todos.push(...items)
      const lastPage = d.pagination?.lastPage ?? 0
      if (pagina >= lastPage) break
      pagina++
    }
    return todos
  }

  async fetchClientes(): Promise<ClienteExterno[]> {
    return this.fetchPaginas(
      `${UPTRES_URL}/clientes?desde=0&size=50&sort=name&order=asc&search=`,
      'clientes'
    )
  }

  async fetchDeudas(desde?: Date): Promise<DeudaExterna[]> {
    const desdeTs = desde ? Math.floor(desde.getTime() / 1000) : 0
    const todas = await this.fetchPaginas(
      `${UPTRES_URL}/ordenventa?desde=${desdeTs}&size=50&sort=numeroOrden&order=desc&search=&tipobusqueda=todos`,
      'dataDBArray'
    )
    return todas.filter((o: any) => {
      const saldo = parseFloat(o.vSaldo || 0)
      return (o.condition === true || o.condition === undefined) && saldo > 0
    }) as DeudaExterna[]
  }

  async fetchEmpleados(): Promise<EmpleadoExterno[]> {
    return this.fetchPaginas(
      `${UPTRES_URL}/empleados?desde=0&size=50&sort=name&order=asc&search=`,
      'empleados'
    )
  }

  async fetchVentas(desde?: Date): Promise<VentaExterna[]> {
    const desdeTs = desde ? Math.floor(desde.getTime() / 1000) : 0
    return this.fetchPaginas(
      `${UPTRES_URL}/ordenesventa?desde=${desdeTs}&size=50&sort=numeroOrden&order=desc&search=&tipobusqueda=todos`,
      'dataDBArray'
    )
  }

  async fetchDeudasCliente(nit: string): Promise<DeudaExterna[]> {
    const todas = await this.fetchPaginas(
      `${UPTRES_URL}/ordenventa?desde=0&size=50&sort=numeroOrden&order=desc&search=${encodeURIComponent(nit)}&tipobusqueda=todos`,
      'dataDBArray'
    )
    return todas.filter((o: any) => {
      const saldo = parseFloat(o.vSaldo || 0)
      return (o.condition === true || o.condition === undefined) && saldo > 0
    }) as DeudaExterna[]
  }
}
