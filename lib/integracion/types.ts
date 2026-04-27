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
  uid?: string
  _id?: string
  numeroOrden?: number
  numeroFacturado?: number
  vTotal?: string | number
  fCreado?: string
  fModificado?: string
  condition?: boolean
  tipo?: string
  cliente?: { uid?: string }
  empleado?: { uid?: string }
  productos?: any[]
  [key: string]: unknown
}

export interface AdaptadorIntegracion {
  fetchClientes(): Promise<ClienteExterno[]>
  fetchDeudas(desde?: Date): Promise<DeudaExterna[]>
  fetchDeudasCliente(nit: string): Promise<DeudaExterna[]>
  fetchEmpleados(): Promise<EmpleadoExterno[]>
  fetchVentas(desde?: Date): Promise<VentaExterna[]>
}
