'use client'
import type { GpsEstado } from './useGpsEnDemanda'

export function GpsIndicator({ estado, intento, max, pos }: { estado: GpsEstado, intento: number, max: number, pos: any }) {
  if (estado === 'inactivo') return null
  if (estado === 'buscando') return (
    <div className="text-xs text-amber-400 flex items-center gap-1.5">
      <span className="animate-pulse">📍</span>
      <span>Ubicando... intento {intento}/{max}</span>
    </div>
  )
  if (estado === 'ok') return (
    <div className="text-xs text-emerald-400 flex items-center gap-1.5">
      <span>📍</span>
      <span>Ubicación lista{pos?.accuracy ? ` (±${Math.round(pos.accuracy)}m)` : ''}</span>
    </div>
  )
  return (
    <div className="text-xs text-red-400 flex items-center gap-1.5">
      <span>⚠️</span>
      <span>Sin GPS</span>
    </div>
  )
}
