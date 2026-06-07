/**
 * Tipos compartidos del módulo Cartera
 * 
 * Guardián: si renombras cualquier propiedad, TypeScript falla
 * en la API y en el frontend simultáneamente.
 */

// ── Líneas de pago ────────────────────────────────────────────────

export interface LineaPago {
  metodoPago: string
  monto: number
  descuento: number
  voucherKey: string | null
  voucherDatosIA: string | null
}

// ── Pago de cartera ───────────────────────────────────────────────

export interface PagoCartera {
  id: string
  /** Número de recibo generado — ej: CL2605001 */
  numeroRecibo: string | null
  monto: number
  descuento: number
  tipo: 'total' | 'abono'
  metodopago: string | null
  /** Alias tipado — mismo campo que metodopago */
  metodoPago?: string | null
  /** Cliente congelado al momento del pago */
  clienteNombre: string | null
  clienteApiId: string | null
  /** Vendedor congelado al momento del pago */
  vendedorNombre: string | null
  numeroFactura: string | null
  /** Saldo antes del pago — congelado, inmutable */
  saldoAnterior: number | null
  /** Valor original de la factura — congelado */
  valorFactura: number | null
  lineasPago: LineaPago[] | null
  notas: string | null
  reciboToken: string | null
  tokenExpira: string | null
  createdAt: string
}

// ── Respuesta de /api/cartera/pago-sync ──────────────────────────

export interface PagoSyncResponse {
  pago: PagoCartera
  anchoPapel: number | null
}

// ── Recibo público ────────────────────────────────────────────────

export interface ReciboCliente {
  id: string
  nombre: string
  nit?: string | null
  telefono?: string | null
}

export interface ReciboDetalleCartera {
  numeroFactura: string | null
  valorFactura: number
  /** Saldo actual de esta factura */
  saldoActual: number
}

export interface ReciboCarteraData {
  cliente: ReciboCliente
  empresa: { nombre: string; nit?: string | null }
  DetalleCartera: ReciboDetalleCartera[]
  /** Saldo pendiente después del pago */
  saldoPendiente: number
  /** Saldo anterior al pago (congelado o calculado) */
  saldoAnterior: number
  valorFacturasPagadas: number
  _modo: 'sync'
}

export interface ReciboNormalizado extends PagoCartera {
  /** Alias de numeroRecibo para el template del recibo */
  consecutivo: string | null
  cartera: ReciboCarteraData | null
  empleado: { id: string; nombre: string; rol: string } | null
}

export interface ReciboPublicoResponse {
  pago: ReciboNormalizado
}

// ── Pago en listado (tab Pagos) ───────────────────────────────────

export interface PagoListado {
  id: string
  numeroRecibo: string | null
  numeroFactura: string | null
  monto: number
  descuento: number
  clienteNombre: string | null
  vendedorNombre: string | null
  metodopago: string | null
  tipo: string
  saldoAnterior: number | null
  lineasPago: LineaPago[] | null
  createdAt: string
  Cartera?: {
    Cliente?: { nombre: string } | null
  } | null
  Empleado?: { nombre: string; rol: string } | null
}

export interface RecaudosResponse {
  pagos: PagoListado[]
  total?: number
  page?: number
  pages?: number
  nextCursor?: string | null
  hasMore?: boolean
}

// ── Comisiones ────────────────────────────────────────────────────

export interface ComisionVendedor {
  id: string
  nombre: string
  porcentaje: number
  formula: string
  recaudado: number
  descuentos: number
  pagosCount: number
  /** Comisión calculada = recaudado * porcentaje / 100 */
  comision: number
}

export interface ComisionCalculo {
  id: string
  nombre: string
  mes: number
  anio: number
  formula: string | null
  resultados: Record<string, unknown>
  createdAt: string
}

export interface ComisionesResponse {
  vendedores: ComisionVendedor[]
  calculo: ComisionCalculo | null
}
