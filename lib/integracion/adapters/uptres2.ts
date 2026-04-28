import type { AdaptadorIntegracion, ClienteExterno, DeudaExterna, EmpleadoExterno, VentaExterna } from '../types'
import https from 'https'

const UPTRES2_URL = process.env.UPTRES2_URL ?? 'https://api2.uptres.top'
const agent = new https.Agent({ rejectUnauthorized: false })

const DANE: Record<number, string> = {
  5001: 'Medellín', 5045: 'Apartadó', 5088: 'Bello', 5266: 'Envigado', 5360: 'Itagüí',
  5615: 'Rionegro', 5690: 'Sabaneta',
  8001: 'Barranquilla', 8573: 'Soledad',
  11001: 'Bogotá D.C.',
  13001: 'Cartagena', 13430: 'Magangué',
  15001: 'Tunja', 17001: 'Manizales', 18001: 'Florencia', 19001: 'Popayán',
  20001: 'Valledupar', 23001: 'Montería',
  25175: 'Chía', 25269: 'Facatativá', 25295: 'Funza', 25307: 'Girardot',
  25473: 'Mosquera', 25754: 'Soacha',
  27001: 'Quibdó', 41001: 'Neiva', 44001: 'Riohacha', 47001: 'Santa Marta',
  50001: 'Villavicencio', 52001: 'Pasto', 52835: 'Tumaco', 54001: 'Cúcuta',
  63001: 'Armenia', 66001: 'Pereira', 66170: 'Dosquebradas',
  68001: 'Bucaramanga', 68081: 'Barrancabermeja', 68276: 'Floridablanca',
  68307: 'Girón', 68615: 'Piedecuesta',
  70001: 'Sincelejo', 73001: 'Ibagué',
  76001: 'Cali', 76109: 'Buenaventura', 76111: 'Buga', 76364: 'Jamundí',
  76520: 'Palmira', 76834: 'Tuluá', 76845: 'Yumbo',
  81001: 'Arauca', 85001: 'Yopal', 86001: 'Mocoa', 91001: 'Leticia',
  94001: 'Inírida', 95001: 'San José del Guaviare', 97001: 'Mitú', 99001: 'Puerto Carreño',
}

function mapCiudad(cityId?: number | string | null): string | undefined {
  if (cityId == null) return undefined
  const id = typeof cityId === 'string' ? parseInt(cityId, 10) : cityId
  return DANE[id] ?? `DANE-${id}`
}

export class UpTres2Adapter implements AdaptadorIntegracion {
  private token: string | null = null

  constructor(private apiKey: string, private apiSecret: string) {}

  async login(): Promise<string> {
    const res = await fetch(`${UPTRES2_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: this.apiKey, apiSecret: this.apiSecret }),
      // @ts-ignore
      agent,
    })
    const data = await res.json()
    if (!data.ok || !data.token) throw new Error(data.message ?? 'Login fallido')
    this.token = data.token
    return data.token
  }

  getToken(): string | null { return this.token }

  private async fetchCursor(path: string, key: string): Promise<any[]> {
    if (!this.token) await this.login()
    const todos: any[] = []
    let cursor: string | null = null
    while (true) {
      const sep = path.includes('?') ? '&' : '?'
      const url: string = cursor
        ? `${UPTRES2_URL}${path}${sep}cursor=${encodeURIComponent(cursor)}`
        : `${UPTRES2_URL}${path}`
      const res = await fetch(url, {
        // @ts-ignore
        agent,
        headers: { Authorization: `Bearer ${this.token}` },
      })
      const d = await res.json()
      if (!d.ok) break
      const items: any[] = d[key] ?? d.data ?? d.items ?? []
      if (!items.length) break
      todos.push(...items)
      cursor = d.nextCursor ?? d.next ?? null
      if (!cursor) break
    }
    return todos
  }

  async fetchClientes(): Promise<ClienteExterno[]> {
    const raw = await this.fetchCursor('/clientes?size=50', 'clientes')
    return raw.map((c: any) => ({
      uid: c.id ?? c._id,
      _id: c._id ?? c.id,
      doc: c.document ?? c.nit ?? c.doc,
      nombre: c.firstName && c.lastName
        ? `${c.firstName} ${c.lastName}`.trim()
        : (c.name ?? ''),
      ciudad: mapCiudad(c.cityId),
      ...c,
    }))
  }

  async fetchEmpleados(): Promise<EmpleadoExterno[]> {
    const raw = await this.fetchCursor('/empleados?size=50', 'empleados')
    return raw.map((e: any) => ({
      uid: e.id ?? e._id,
      _id: e._id ?? e.id,
      name: e.firstName ?? e.name ?? '',
      lastName: e.lastName ?? '',
      email: e.email ?? '',
      ...e,
    }))
  }

  async fetchDeudas(desde?: Date): Promise<DeudaExterna[]> {
    const desdeTs = desde ? Math.floor(desde.getTime() / 1000) : 0
    const raw = await this.fetchCursor(`/cartera?size=50&desde=${desdeTs}`, 'cartera')
    return raw
      .filter((o: any) => {
        const saldo = parseFloat(String(o.balance ?? o.vSaldo ?? '0'))
        return o.active !== false && saldo > 0
      })
      .map((o: any) => ({
        uid: o.id ?? o._id,
        _id: o._id ?? o.id,
        numeroOrden: o.orderNumber ?? o.numeroOrden,
        numeroFacturado: o.invoiceNumber ?? o.numeroFacturado,
        vTotal: o.total ?? o.vTotal,
        vSaldo: o.balance ?? o.vSaldo,
        vAbono: o.paid ?? o.vAbono ?? 0,
        dias: o.creditDays ?? o.dias,
        fPago: o.dueDate ?? o.fPago,
        fCreado: o.createdAt ?? o.fCreado,
        fModificado: o.updatedAt ?? o.fModificado,
        condition: o.active !== false,
        cliente: { uid: o.customerId ?? o.clientId ?? o.cliente?.uid },
        empleado: { uid: o.employeeId ?? o.empleado?.uid },
        ...o,
      }))
  }

  async fetchDeudasCliente(nit: string): Promise<DeudaExterna[]> {
    const raw = await this.fetchCursor(
      `/cartera?size=50&search=${encodeURIComponent(nit)}`,
      'cartera'
    )
    return raw
      .filter((o: any) => {
        const saldo = parseFloat(String(o.balance ?? o.vSaldo ?? '0'))
        return o.active !== false && saldo > 0
      })
      .map((o: any) => ({
        uid: o.id ?? o._id,
        _id: o._id ?? o.id,
        vSaldo: o.balance ?? o.vSaldo,
        condition: o.active !== false,
        cliente: { uid: o.customerId ?? o.clientId ?? o.cliente?.uid },
        empleado: { uid: o.employeeId ?? o.empleado?.uid },
        ...o,
      }))
  }

  async fetchVentas(desde?: Date): Promise<VentaExterna[]> {
    const desdeTs = desde ? Math.floor(desde.getTime() / 1000) : 0
    const raw = await this.fetchCursor(`/ordenes?size=50&desde=${desdeTs}`, 'ordenes')
    return raw.map((o: any) => ({
      uid: o.id ?? o._id,
      _id: o._id ?? o.id,
      numeroOrden: o.orderNumber ?? o.numeroOrden,
      vTotal: o.total ?? o.vTotal,
      fCreado: o.createdAt ?? o.fCreado,
      fModificado: o.updatedAt ?? o.fModificado,
      condition: o.active !== false,
      cliente: { uid: o.customerId ?? o.clientId ?? o.cliente?.uid },
      empleado: { uid: o.employeeId ?? o.empleado?.uid },
      productos: o.items ?? o.productos ?? [],
      ...o,
    }))
  }
}
