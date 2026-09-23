export type Pago = {
  id: string
  monto: number | string
  descuento: number | string | null
  tipo: string | null
  metodopago: string | null
  notas: string | null
  reciboUrl: string | null
  reciboToken: string | null
  voucherKey: string | null
  saldoAnterior: number | string | null
  vendedorNombre: string | null
  voucherDatosIA: any
  createdAt: string
  envioEstado: string
  envioFecha: string | null
  envioRef: string | null
  envioVariacion: any
  numeroRecibo: string | null
  numeroFactura: number | null
  reciboPago: any
  Cartera: {
    Cliente: { id: string; nombre: string; nit: string | null; telefono: string | null }
  }
  Empleado: { id: string; nombre: string; rol: string }
}

export type Vendedor = { id: string; nombre: string }

export const TABS = [
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'enviado',   label: 'Enviados'   },
  { key: 'revisar',   label: 'Revisar'    },
]

export const PAGE_SIZE = 50
