/**
 * Selects reutilizables de Prisma — evitan duplicar la lista de campos
 * en múltiples endpoints.
 */

export const CLIENTE_BASICO = {
  id: true,
  nombre: true,
  nit: true,
  telefono: true,
} as const

export const CLIENTE_COMPLETO = {
  id: true,
  nombre: true,
  nit: true,
  telefono: true,
  ciudad: true,
  direccion: true,
  apiId: true,
} as const

export const EMPLEADO_BASICO = {
  id: true,
  nombre: true,
  rol: true,
} as const

export const EMPLEADO_RECIBO = {
  id: true,
  nombre: true,
  configRecibos: true,
} as const

export const EMPRESA_RECIBO = {
  id: true,
  nombre: true,
  telefono: true,
  configRecibos: true,
} as const
