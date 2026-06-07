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
    <div className="max-w-3xl mx-auto space-y-3 pb-24 md:pb-0 p-4">

      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.back()}
          className="text-zinc-400 hover:text-white transition-colors text-lg">‹</button>
        <h1 className="text-white font-bold text-base">📋 Historial de turnos</h1>
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="shimmer h-10 rounded-xl" />)}
        </div>
      )}

      {!loading && turnos.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
          <p className="text-zinc-500 text-sm">Sin turnos anteriores</p>
        </div>
      )}

      {!loading && turnos.length > 0 && (
        <div className="rounded-2xl overflow-hidden card-glass" style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)'}}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr style={{background:'#0d1220',borderBottom:'1px solid #1e2a3d'}}>
                  {['Fecha','Inicio','Fin','Duración','Pausa'].map(h => (
                    <th key={h} style={{padding:'8px 12px',fontSize:12,fontWeight:500,color:'#94a3b8',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {turnos.map((t, i) => (
                  <tr key={t.id} style={{background: i % 2 === 0 ? '#141c2e' : '#111827', borderBottom:'1px solid #1e2a3d'}}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-white font-medium">{t.fecha}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-emerald-400">🟢 {t.inicio}</span>
                      {t.latInicio && t.lngInicio && (
                        <a href={`https://www.google.com/maps?q=${t.latInicio},${t.lngInicio}`} target="_blank" rel="noopener noreferrer"
                          className="ml-2 text-blue-400 hover:text-blue-300 text-[10px]">📍</a>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {t.fin ? (
                        <>
                          <span className="text-red-400">🔴 {t.fin}</span>
                          {t.latFin && t.lngFin && (
                            <a href={`https://www.google.com/maps?q=${t.latFin},${t.lngFin}`} target="_blank" rel="noopener noreferrer"
                              className="ml-2 text-blue-400 hover:text-blue-300 text-[10px]">📍</a>
                          )}
                        </>
                      ) : <span className="text-amber-400 text-[10px]">Sin cerrar</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {t.tiempoEfectivo || t.duracion
                        ? <span className="text-white font-mono">{t.tiempoEfectivo || t.duracion}</span>
                        : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {t.pausaMotivo
                        ? <span className="text-amber-400">⏸ {t.pausaMotivo}{t.pausaDuracionMin ? ` · ${t.pausaDuracionMin}m` : ''}</span>
                        : <span className="text-zinc-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
