'use client'
import { useState } from 'react'
import { fetchApi } from '@/lib/fetchApi'

interface TurnoBlockProps {
  turno: any
  cargando: boolean
  bloqueado: boolean
  obteniendoGps: boolean
  onIniciar: () => void
  onCerrar: () => void
  onPausar?: (motivo: string, duracion: number) => void
  onReanudar?: () => void
}

function fmt(ts: string | null | undefined) {
  if (!ts) return '--'
  return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' })
}

function calcPausaFin(pausaInicio: string, pausaDuracionMin: number) {
  return new Date(new Date(pausaInicio).getTime() + pausaDuracionMin * 60000)
    .toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' })
}

export default function TurnoBlock({ turno, cargando, bloqueado, obteniendoGps, onIniciar, onCerrar, onPausar, onReanudar }: TurnoBlockProps) {
  const [expandido, setExpandido] = useState(false)
  const [mostrarPausa, setMostrarPausa] = useState(false)
  const [pausaMotivo, setPausaMotivo] = useState('')
  const [pausaMotivoCustom, setPausaMotivoCustom] = useState('')
  const [pausaDuracion, setPausaDuracion] = useState(30)
  const [pausaDurCustom, setPausaDurCustom] = useState(false)

  if (cargando) return (
    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, overflow: 'hidden' }}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex-1 h-8 rounded-xl bg-zinc-700/50" />
        <div className="w-10 h-8 rounded-xl bg-zinc-700/50 flex-shrink-0" />
      </div>
    </div>
  )

  // Sin turno — botón iniciar
  if (!turno) return (
    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, overflow: 'hidden' }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button onClick={onIniciar} disabled={bloqueado || obteniendoGps}
          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
          {obteniendoGps
            ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Buscando GPS...</>
            : <>⚡ Iniciar turno</>}
        </button>
        <a href="/historial-turnos" className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold px-3 py-2 rounded-xl flex-shrink-0">📅</a>
      </div>
    </div>
  )

  // Turno pausado
  if (turno.pausado) return (
    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, overflow: 'hidden' }}>
      <button onClick={() => setExpandido(e => !e)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 flex-shrink-0" />
        <span className="text-amber-400 text-sm font-semibold flex-1">⏸ Pausado — {turno.pausaMotivo}</span>
        <span className={`text-zinc-600 text-[10px] ${expandido ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {expandido && (
        <div className="border-t border-amber-500/20 px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg p-2" style={{ background: 'rgba(148,160,185,0.28)', border: '1px solid rgba(148,180,255,0.25)' }}>
              <p className="text-zinc-500 text-xs">Inicio turno</p>
              <p className="text-sm font-bold text-white">{fmt(turno.inicio)}</p>
            </div>
            <div className="rounded-lg p-2" style={{ background: 'rgba(148,160,185,0.28)', border: '1px solid rgba(148,180,255,0.25)' }}>
              <p className="text-zinc-500 text-xs">Inicio pausa</p>
              <p className="text-amber-400 text-sm font-bold">{fmt(turno.pausaInicio)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {onReanudar && <button onClick={onReanudar} className="flex-1 bg-zinc-800 border border-emerald-500/30 text-emerald-400 text-sm font-semibold py-2.5 rounded-xl">▶️ Reanudar</button>}
            <a href="/historial-turnos" className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center">📅 Historial</a>
          </div>
        </div>
      )}
    </div>
  )

  // Turno activo
  return (
    <div className="w-full">
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderBottom: expandido ? 'none' : undefined, borderRadius: expandido ? '16px 16px 0 0' : '16px' }}
          onClick={() => setExpandido(e => !e)}>
          <span className="relative inline-flex h-2 w-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 live-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-emerald-400 text-sm font-semibold">Turno activo</span>
          {onPausar && <span className="w-7 h-7 flex items-center justify-center bg-zinc-800 rounded-lg text-xs"
            onClick={e => { e.stopPropagation(); setMostrarPausa(m => !m); setExpandido(true) }}>⏸</span>}
          <span className={`text-zinc-600 text-[10px] ${expandido ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </div>
      {expandido && (
        <div className="w-full" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderTop: '1px solid rgba(16,185,129,0.12)', borderRadius: '0 0 16px 16px' }}>
          <div className="px-4 pb-4 pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2" style={{ background: 'rgba(148,160,185,0.28)', border: '1px solid rgba(148,180,255,0.25)' }}>
                <p className="text-zinc-500 text-xs">Inicio</p>
                <p className="text-sm font-bold text-white">{fmt(turno.inicio)}</p>
              </div>
              {turno.pausaInicio && turno.pausaDuracionMin ? (
                <div className="rounded-lg p-2" style={{ background: 'rgba(148,160,185,0.28)', border: '1px solid rgba(148,180,255,0.25)' }}>
                  <p className="text-zinc-500 text-xs">Pausa</p>
                  <p className="text-amber-400 text-sm font-bold">{fmt(turno.pausaInicio)} → {turno.pausaFin ? fmt(turno.pausaFin) : calcPausaFin(turno.pausaInicio, turno.pausaDuracionMin)}</p>
                </div>
              ) : (
                <div className="rounded-lg p-2" style={{ background: 'rgba(148,160,185,0.28)', border: '1px solid rgba(148,180,255,0.25)' }}>
                  <p className="text-zinc-500 text-xs">Sin pausa</p>
                  <p className="text-zinc-500 text-sm">—</p>
                </div>
              )}
            </div>
            <button onClick={onCerrar} disabled={bloqueado} className="w-full bg-red-600 text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50">
              {bloqueado ? '...' : 'Cerrar turno'}
            </button>
            <div className="flex gap-2">
              {onPausar && <button onClick={() => setMostrarPausa(m => !m)}
                className={"flex-1 text-sm font-semibold py-2.5 rounded-xl border " + (mostrarPausa ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>
                ⏸️ Pausar
              </button>}
              <a href="/historial-turnos" className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center">📅 Historial</a>
            </div>
            {mostrarPausa && onPausar && (
              <div className="bg-black/30 rounded-xl p-3 border border-zinc-700 space-y-3">
                <p className="text-zinc-400 text-xs font-bold">Motivo</p>
                <div className="flex gap-2 flex-wrap">
                  {['Almuerzo','Permiso','Otro'].map(m => (
                    <button key={m} onClick={() => setPausaMotivo(m)}
                      className={"px-3 py-1.5 rounded-full text-xs font-semibold border " + (pausaMotivo === m ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>
                      {m === 'Almuerzo' ? '🍽️' : m === 'Permiso' ? '📝' : '📦'} {m}
                    </button>
                  ))}
                </div>
                {pausaMotivo === 'Otro' && (
                  <input value={pausaMotivoCustom} onChange={e => setPausaMotivoCustom(e.target.value)}
                    placeholder="¿Cuál es el motivo?" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                )}
                <p className="text-zinc-400 text-xs font-bold">Tiempo estimado</p>
                <div className="flex gap-2 flex-wrap">
                  {[{l:'30 min',v:30},{l:'1 hora',v:60},{l:'2 horas',v:120},{l:'Otro',v:0}].map(t => (
                    <button key={t.l} onClick={() => { if(t.v>0){setPausaDuracion(t.v);setPausaDurCustom(false)}else{setPausaDurCustom(true)} }}
                      className={"px-3 py-1.5 rounded-full text-xs font-semibold border " + ((!pausaDurCustom&&pausaDuracion===t.v&&t.v>0)||(pausaDurCustom&&t.v===0) ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>
                      {t.l}
                    </button>
                  ))}
                </div>
                {pausaDurCustom && (
                  <input type="number" onChange={e => setPausaDuracion(Number(e.target.value))}
                    placeholder="¿Cuántos minutos?" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                )}
                <button onClick={() => { onPausar(pausaMotivo === 'Otro' ? pausaMotivoCustom : pausaMotivo, pausaDuracion); setMostrarPausa(false) }}
                  className="w-full bg-gradient-to-r from-amber-600 to-amber-500 text-white text-sm font-bold py-2 rounded-xl">
                  ⏸️ Confirmar pausa
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
