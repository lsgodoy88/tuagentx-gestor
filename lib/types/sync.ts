/**
 * Tipos compartidos del adapter UpTres y sync de bodega
 *
 * Guardián crítico: el adapter recibe JSON de UpTres y lo mapea
 * a estos tipos. Si UpTres cambia un campo o nosotros lo renombramos,
 * TypeScript detecta la rotura inmediatamente.
 *
 * LECCIÓN APRENDIDA: o.empleadoId NO existe — es o.empleado.uid
 * El tipo VentaExterna documenta esto explícitamente.
 */

// ── Raw de UpTres (lo que devuelve la API externa) ────────────────

export interface UpTresOrdenRaw {
  id: string
  orderNumber: number
  invoiceNumber: number | null
  /** true = facturada en UpTres. Usar para isFacturada en BD */
  isInvoiced: boolean
  /** Fecha exacta de facturación — usar para fechaFactura en BD */
  invoicedAt: string | null
  customerId: string
  /** ID del empleado en UpTres — viene directo como string */
  employeeId: string | null
  total: string | number
  createdAt: string
  updatedAt: string | null
  cityId?: string | number | null
  address?: string | null
  phone?: string | null
  items?: UpTresItemRaw[]
  customer?: UpTresClienteRaw | null
}

export interface UpTresItemRaw {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  total: number
}

export interface UpTresClienteRaw {
  id: string
  firstName?: string
  lastName?: string
  tradeName?: string
  document?: string
  phone?: string
  address?: string
  cityId?: string | number
}

// ── Tipos mapeados (lo que retorna el adapter) ────────────────────

/**
 * VentaExterna — resultado de fetchVentas()
 *
 * CRÍTICO: el empleado viene como { uid: string }
 * NUNCA usar o.empleadoId — no existe en este tipo
 * SIEMPRE usar o.empleado?.uid para comparar con miApiId
 */
export interface VentaExterna {
  uid: string
  _id: string
  numeroOrden: number
  /** null = no facturada aún */
  numeroFacturado: number | null
  /** Sincronizar a OrdenDespacho.isFacturada */
  isInvoiced: boolean
  /** Sincronizar a OrdenDespacho.fechaFactura */
  invoicedAt: string | null
  vTotal: string | number | null
  fCreado: string
  fModificado: string | null
  /** USAR ESTO para filtrar por vendedor — NO usar empleadoId directo */
  empleado: { uid: string | null }
  cliente: { uid: string | null }
  productos: UpTresItemRaw[]
  clienteNombreApi: string | null
  cityId: string | number | null
  direccion: string | null
  telefono: string | null
  clienteNit: string | null
}

export interface DeudaExterna {
  uid: string
  _id: string
  numeroOrden?: number
  numeroFacturado?: number | null
  vTotal: string | number
  vSaldo: string | number
  vAbono?: string | number
  dias?: string | number
  mediopago?: string | null
  fCreado?: string
  fPago?: string
  fModificado?: string
  condition?: boolean
  cliente: { uid: string | null }
  empleado: { uid: string | null }
}

export interface ClienteExterno {
  uid: string
  _id: string
  doc: string | null
  name: string
  lastName: string
  email: string | null
  nCel: string | null
  dir: string | null
  ciudad: string | null
  departamento: string | null
  barrio: string | null
  nombreComercial: string | null
  fModificado: string
  employeeId: string | null
}

export interface EmpleadoExterno {
  uid: string
  _id: string
  name: string
  lastName: string
  doc: string | null
  email: string | null
  nCel: string | null
  ciudad: string | null
  fModificado: string
}

// ── Lo que guarda bodega/sync-auto ────────────────────────────────

/**
 * Orden normalizada lista para insertar en OrdenDespacho
 */
export interface OrdenParaSync {
  numeroFacturado: string | number | null
  /** isInvoiced de UpTres → OrdenDespacho.isFacturada */
  isInvoiced: boolean
  /** invoicedAt de UpTres → OrdenDespacho.fechaFactura */
  invoicedAt: string | null
  vTotal: string | number | null
  empleado: { uid: string | null }
  cliente: { uid: string | null }
  uid: string
  numeroOrden: number
  fCreado: string
  clienteNombreApi: string | null
}
