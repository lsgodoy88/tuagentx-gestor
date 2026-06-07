'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HistorialTurnosPage() {
  const router = useRouter()
  const [turnos, setTurnos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/turnos/historial')
      .then(r => r.json())
      .then(d => { setTurnos(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-xl mx-auto space-y-3 pb-24 md:pb-0 p-4">

      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.back()}
          className="text-zinc-400 hover:text-white transition-colors text-lg">‹</button>
        <h1 className="text-white font-bold text-base">📋 Historial de turnos</h1>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="shimmer h-20 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && turnos.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
          <p className="text-zinc-500 text-sm">Sin turnos anteriores</p>
        </div>
      )}

      {!loading && turnos.map((t) => (
        <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold text-sm">{t.fecha}</span>
            {t.duracion && (
              <span className="text-emerald-400 font-mono text-sm font-bold">{t.tiempoEfectivo || t.duracion}</span>
            )}
          </div>
          <div className="flex gap-4 text-xs text-zinc-500">
            <span>🟢 {t.inicio}</span>
            {t.fin && <span>🔴 {t.fin}</span>}
            {!t.fin && <span className="text-amber-400">Sin cerrar</span>}
          </div>
          {t.pausaMotivo && (
            <div className="text-xs text-amber-400">
              ⏸ Pausa: {t.pausaMotivo}
              {t.pausaDuracionMin && ` · ${t.pausaDuracionMin} min`}
            </div>
          )}
        </div>
      ))}

    </div>
  )
}
