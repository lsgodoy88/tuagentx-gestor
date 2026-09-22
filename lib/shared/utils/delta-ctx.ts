/**
 * DeltaCtx / DeltaResult — tipos compartidos para sync-delta por dominio
 * Importar desde @/lib/shared en cada lib/[dominio]/delta.ts
 */
import type { UpTresAdapter } from '@/lib/integracion/adapters/uptres'

export interface DeltaCtx {
  adapter: UpTresAdapter
  empresaId: string          // id empresa destino (puede diferir de integracion.empresaId en vinculadas)
  integracionId: string
  destino: string            // alias semántico de empresaId — siempre igual
  origenVinculadaId: string | null
  apiKey: string
  apiSecret: string
  schema: string             // DB_SCHEMA ('gestor' | 'gestor_staging')
  empresa: {
    ultimaSyncBodega: Date | null
    ultimaSyncClientes: Date | null
    sync_cursor_clientes: unknown
    sync_cursor_empleados: unknown
    sync_cursor_cartera: unknown
    sync_cursor_cartera_update: unknown
    sync_cursor_listas: unknown
    sync_cursor_proveedores: unknown
    sync_cursor_ordenes_date: unknown
    sync_cursor_ordenes_deleted: unknown
    sync_cursor_ordenes_invoiced: unknown
    fechaInicioBodega: Date | null
  } | null
}

export interface DeltaResult {
  ordenesRaw: any[]          // fetchVentas — compartido con reconciliadores
  ordenesDate: any[]         // fetchOrdenesDate — compartido con reconciliador antiguas
  ordenesNuevas: number
  ordenesDateActualizadas: number
  ordenesInvoicedCreadas: number
  ordenesEliminadas: number
  reconciliadas: number
  huecosRecuperados: number
  clientesNuevos: number
  empleadosActualizados: number
  listasActualizadas: number
  proveedoresActualizados: number
  deudasNuevasDelta: number
  saldosActualizados: number
  erroresParciales: string[]
  timings: Record<string, number>
}

export function emptyResult(): DeltaResult {
  return {
    ordenesRaw: [], ordenesDate: [],
    ordenesNuevas: 0, ordenesDateActualizadas: 0, ordenesInvoicedCreadas: 0,
    ordenesEliminadas: 0, reconciliadas: 0, huecosRecuperados: 0,
    clientesNuevos: 0, empleadosActualizados: 0,
    listasActualizadas: 0, proveedoresActualizados: 0,
    deudasNuevasDelta: 0, saldosActualizados: 0,
    erroresParciales: [], timings: {},
  }
}

export function mergeResults(a: DeltaResult, b: Partial<DeltaResult>): DeltaResult {
  return {
    ordenesRaw: b.ordenesRaw ?? a.ordenesRaw,
    ordenesDate: b.ordenesDate ?? a.ordenesDate,
    ordenesNuevas: a.ordenesNuevas + (b.ordenesNuevas ?? 0),
    ordenesDateActualizadas: a.ordenesDateActualizadas + (b.ordenesDateActualizadas ?? 0),
    ordenesInvoicedCreadas: a.ordenesInvoicedCreadas + (b.ordenesInvoicedCreadas ?? 0),
    ordenesEliminadas: a.ordenesEliminadas + (b.ordenesEliminadas ?? 0),
    reconciliadas: a.reconciliadas + (b.reconciliadas ?? 0),
    huecosRecuperados: a.huecosRecuperados + (b.huecosRecuperados ?? 0),
    clientesNuevos: a.clientesNuevos + (b.clientesNuevos ?? 0),
    empleadosActualizados: a.empleadosActualizados + (b.empleadosActualizados ?? 0),
    listasActualizadas: a.listasActualizadas + (b.listasActualizadas ?? 0),
    proveedoresActualizados: a.proveedoresActualizados + (b.proveedoresActualizados ?? 0),
    deudasNuevasDelta: a.deudasNuevasDelta + (b.deudasNuevasDelta ?? 0),
    saldosActualizados: a.saldosActualizados + (b.saldosActualizados ?? 0),
    erroresParciales: [...a.erroresParciales, ...(b.erroresParciales ?? [])],
    timings: { ...a.timings, ...(b.timings ?? {}) },
  }
}
