'use client'
import React, { useState } from 'react'
import { MESES } from '../_lib/tipos'

export function CalendarioPopup({ mes, anio, onChange, onClose, onFiltroRapido }: { mes: number; anio: number; onChange: (m: number, a: number) => void; onClose: () => void; onFiltroRapido?: (f: 'hoy'|'semana') => void }) {
  const [m, setM] = useState(mes)
  const [a, setA] = useState(anio)
  return (
    <div className="absolute right-0 top-10 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-xl space-y-3" style={{ minWidth: 220 }}>
      {onFiltroRapido && (
        <div className="flex gap-2 pb-1 border-b border-zinc-800">
          <button onClick={() => { onFiltroRapido('hoy'); onClose() }}
            className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-xl transition-colors">
            Hoy
          </button>
          <button onClick={() => { onFiltroRapido('semana'); onClose() }}
            className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-xl transition-colors">
            Esta semana
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <select value={m} onChange={e => setM(+e.target.value)} className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2 py-1.5 flex-1">
          {MESES.map((ml, i) => <option key={i} value={i+1}>{ml}</option>)}
        </select>
        <select value={a} onChange={e => setA(+e.target.value)} className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2 py-1.5">
          {[2024,2025,2026,2027].map(yr => <option key={yr} value={yr}>{yr}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { onChange(m, a); onClose() }} className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-xl">Aplicar</button>
        <button onClick={onClose} className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-semibold px-3 py-2 rounded-xl">✕</button>
      </div>
    </div>
  )
}
