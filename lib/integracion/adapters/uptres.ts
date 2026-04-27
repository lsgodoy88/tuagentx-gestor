import type { AdaptadorIntegracion, ClienteExterno, DeudaExterna, EmpleadoExterno, VentaExterna } from '../types'

import https from 'https'
const UPTRES_URL = 'https://www.uptres.top'
const agent = new https.Agent({ rejectUnauthorized: false })

export class UpTresAdapter implements AdaptadorIntegracion {
  constructor(private token: string) {}

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
