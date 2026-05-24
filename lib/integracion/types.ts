export interface DeudaExterna {
  uid: string
  _id?: string
  numeroOrden?: number
  numeroFacturado?: number
  vTotal?: string | number
  vSaldo?: string | number
  vAbono?: string | number
  dias?: string | number
  fPago?: string
  fCreado?: string
  fModificado?: string
  condition?: boolean
  cliente?: { uid?: string }
  empleado?: { uid?: string }
  [key: string]: unknown
}

export interface ClienteExterno {
  uid?: string
  _id?: string
  doc?: string
  [key: string]: unknown
}

export interface EmpleadoExterno {
  uid?: string
  _id?: string
  name?: string
  lastName?: string
  email?: string
  [key: string]: unknown
}

export interface VentaExterna {
  uid: string
  _id?: string
  numeroOrden: number
  numeroFacturado: number | null
  /** true = facturada en UpTres → OrdenDespacho.isFacturada */
  isInvoiced: boolean
  /** Fecha de facturación → OrdenDespacho.fechaFactura */
  invoicedAt: string | null
  vTotal: string | number | null
  fCreado: string
  fModificado?: string | null
  condition?: boolean
  /**
   * CRÍTICO: el empleado viene como objeto { uid }
   * NUNCA acceder como o.empleadoId — no existe
   * SIEMPRE usar o.empleado?.uid para comparar con miApiId
   */
  empleado: { uid: string | null }
  cliente: { uid: string | null }
  productos?: any[]
  clienteNombreApi?: string | null
  cityId?: string | number | null
  direccion?: string | null
  telefono?: string | null
  clienteNit?: string | null
}

export interface AdaptadorIntegracion {
  login(): Promise<void>
  fetchClientes(desde?: Date): Promise<ClienteExterno[]>
  fetchDeudas(desde?: Date): Promise<DeudaExterna[]>
  fetchDeudasCliente(nit: string): Promise<DeudaExterna[]>
  fetchDeudasEmpleado(empleadoApiId: string): Promise<DeudaExterna[]>
  fetchEmpleados(desde?: Date): Promise<EmpleadoExterno[]>
  fetchVentas(desde?: Date): Promise<VentaExterna[]>
}
