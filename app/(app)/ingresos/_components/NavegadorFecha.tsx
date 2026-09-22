'use client'

import { Vista, fechaHoy, fmtFecha, labelNavegador, moverFecha } from '../_lib/fechas'

interface Props {
  vista: Vista
  fecha: string
  buscando: boolean
  onNavegar: (fecha: string, vista: Vista) => void
  onIrAHoy: () => void
  onFechaDirecta: (fecha: string) => void
}

export function NavegadorFecha({ vista, fecha, buscando, onNavegar, onIrAHoy, onFechaDirecta }: Props) {
  const hoy = fechaHoy()
  const esDiaActual = vista === 'Día' && fecha === hoy

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => onNavegar(moverFecha(fecha, vista, -1), vista)}
        style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #1e2a3d', background: 'rgba(13,18,32,0.9)', color: '#9ca3af', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >‹</button>

      <div style={{ flex: 1, position: 'relative' }}>
        {vista === 'Día' ? (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,18,32,0.9)', border: '1px solid ' + (esDiaActual ? '#1e2a3d' : 'rgba(245,158,11,0.4)'), borderRadius: 10, padding: '7px 12px', overflow: 'hidden' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: esDiaActual ? 'white' : '#f59e0b', pointerEvents: 'none', userSelect: 'none' }}>
              {buscando ? '…' : labelNavegador(vista, fecha)}
            </span>
            <input
              type="date"
              value={fecha}
              onChange={e => onFechaDirecta(e.target.value)}
              onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch {} }}
              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', background: 'transparent' }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,18,32,0.9)', border: '1px solid #1e2a3d', borderRadius: 10, padding: '7px 12px' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
              {buscando ? '…' : labelNavegador(vista, fecha)}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={() => onNavegar(moverFecha(fecha, vista, 1), vista)}
        style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #1e2a3d', background: 'rgba(13,18,32,0.9)', color: '#9ca3af', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >›</button>

      <button
        onClick={onIrAHoy}
        style={{ padding: '7px 16px', borderRadius: 10, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(30,42,61,0.90)', cursor: 'pointer', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}
      >Hoy</button>
    </div>
  )
}
