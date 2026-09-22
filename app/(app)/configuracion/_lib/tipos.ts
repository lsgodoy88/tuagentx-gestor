// tipos UI-only — configuracion

export type FaseConexion = 'idle' | 'validando' | 'conectando' | 'sincronizando' | 'listo' | 'error'
export type EstadoEndpoint = 'pendiente' | 'ok' | 'error' | 'cargando'
export type TransprensaTest = 'idle' | 'ok' | 'error'
export type PasoApi = 1 | 2 | 3
export type ModoIntegracion = 'erp' | 'api'

export interface TemaPreset {
  hue: number
  sat: number
  lit: number
  label: string
}

export interface Validacion {
  ok: boolean
  endpoints: Record<string, boolean>
  counts: Record<string, number>
  activeCount: number
}

export interface EmpresaVinculada {
  id: string
  nombre: string
  color: string
  activa: boolean
  apiKey?: string
  conectadaAt?: string
  fechaInicioBodega?: string
  configDuena?: {
    horaInicioRuta?: string
    horaFinRuta?: string
    ciudadEntregaLocal?: string
    diasHistorialBodega?: number
    bodegaPuedeEnviar?: boolean
    autoAbrirTurno?: boolean
  }
  nombreEmpresaPrincipal?: string
}

export interface SyncLogEntry {
  id: string
  inicio: string
  estado: string
  disparadoPor: string
  deudasSincronizadas: number
  zombis: number
  pagosConfrontados: number
  duracionMs?: number
  errores?: { message?: string }
}
