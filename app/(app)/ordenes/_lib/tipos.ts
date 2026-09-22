export type TabActivo = 'pendiente' | 'alistado' | 'despachado'
export type ModoEnvio = 'local' | 'transportadora' | 'personal'
export type OrdenDesc = 'asc' | 'desc' | null

export interface GaleriaState {
  fotos: string[]
  index: number
  fecha?: string | null
  esFirma?: boolean
}

export interface EditTransporte {
  transportadora: string
  guia: string
}

export const BORDER: Record<string, string> = {
  pendiente:   'border-l-amber-400',
  alistado:    'border-l-emerald-500',
  en_entrega:  'border-l-blue-500',
  en_transito: 'border-l-zinc-500',
  entregado:   'border-l-zinc-600',
}

export const BADGE: Record<string, string> = {
  pendiente:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
  alistado:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  en_entrega:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  en_transito: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  entregado:   'bg-zinc-700/30 text-zinc-300 border-zinc-700/30',
}

export const LABEL: Record<string, string> = {
  pendiente: 'Pendiente', alistado: 'Alistado', en_entrega: 'En entrega',
  en_transito: 'En tránsito', entregado: 'Entregado',
}

export const FILTRO_ESTADOS = [
  { ic: '', lbl: 'Todos los estados' },
  { ic: '🟢', lbl: 'Entregado' },
  { ic: '🔵', lbl: 'Distribución' },
  { ic: '🟡', lbl: 'Bodega Destino' },
  { ic: '🔴', lbl: 'Novedad' },
  { ic: '🚛', lbl: 'En tránsito' },
  { ic: '⚪', lbl: 'Sin cajas' },
  { ic: '✅', lbl: 'Entregado manual' },
  { ic: 'BARCODE', lbl: 'Sin guía' },
]
