/**
 * TuAgentX — Tipos compartidos del módulo Ingresos/Saldos
 */

export interface Fila {
  id?: string
  concepto: string
  ingreso: string
  egreso: string
  categoria: string
  relacionTexto: string
  esNueva?: boolean
}

export interface Categoria {
  id: string
  tipo: string
  nombre: string
}

export interface TabConfig {
  id: string
  key: string
  nombre: string
  emoji: string
  orden: number
}

export interface GrupoDia {
  fecha: string
  filas: Fila[]
}

export const FILAS_DEFAULT = 7

export function filaVacia(esNueva = false): Fila {
  return { concepto: '', ingreso: '', egreso: '', categoria: '', relacionTexto: '', esNueva }
}

export function filasIniciales(): Fila[] {
  return Array.from({ length: FILAS_DEFAULT }, () => filaVacia())
}
