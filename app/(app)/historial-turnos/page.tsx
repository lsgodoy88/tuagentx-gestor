'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export default function HistorialTurnosPage() {
  const router = useRouter()
  const [turnos, setTurnos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const load = useCallback(async (cursor?: string) => {
    const url = '/api/turnos/historial' + (cursor ? `?cursor=${cursor}` : '')
    const res = await fetch(url)
    const d = await res.json()
    const list = Array.isArray(d.turnos) ? d.turnos : Array.isArray(d) ? d : []
    return { list, nextCursor: d.nextCursor ?? null, hasMore: d.hasMore ?? false }
  }, [])

  useEffect(() => {
    load().then(({ list, nextCursor, hasMore }) => {
      setTurnos(list)
      setNextCursor(nextCursor)
      setHasMore(hasMore)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [load])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const { list, nextCursor: nc, hasMore: hm } = await load(nextCursor)
    setTurnos(prev => [...prev, ...list])
    setNextCursor(nc)
    setHasMore(hm)
    setLoadingMore(false)
  }

  return (
    <div className="w-full pb-24 md:pb-0">

      <div className="flex items-center gap-3 px-3 py-3 border-b border-zinc-800">
        <button onClick={() => router.back()}
          className="text-zinc-400 hover:text-white transition-colors text-lg leading-none">‹</button>
        <h1 className="text-white font-bold text-sm">📋 Historial de turnos · últimos 15 días</h1>
      </div>

      {loading && (
        <div className="space-y-px">
          {[...Array(8)].map((_, i) => <div key={i} className="shimmer h-9 w-full" />)}
        </div>
      )}

      {!loading && turnos.length === 0 && (
        <div className="p-6 text-center">
          <p className="text-zinc-500 text-sm">Sin turnos en los últimos 15 días</p>
        </div>
      )}

      {!loading && turnos.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr style={{background:'#0d1220',borderBottom:'1px solid #1e2a3d'}}>
                {['Fecha','Inicio','Fin','Duración','Pausa'].map(h => (
                  <th key={h} style={{padding:'7px 10px',fontSize:11,fontWeight:500,color:'#64748b',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {turnos.map((t, i) => (
                <tr key={t.id} style={{background: i % 2 === 0 ? '#141c2e' : '#111827', borderBottom:'1px solid #1e2a3d'}}>
                  <td style={{padding:'7px 10px',whiteSpace:'nowrap'}}>
                    <span className="text-white font-medium">{t.fecha}</span>
                  </td>
                  <td style={{padding:'7px 10px',whiteSpace:'nowrap'}}>
                    <span className="text-emerald-400">🟢 {t.inicio}</span>
                    {t.latInicio && t.lngInicio && (
                      <a href={`https://www.google.com/maps?q=${t.latInicio},${t.lngInicio}`}
                        target="_blank" rel="noopener noreferrer"
                        className="ml-1 text-blue-400 text-[10px]">📍</a>
                    )}
                  </td>
                  <td style={{padding:'7px 10px',whiteSpace:'nowrap'}}>
                    {t.fin
                      ? <><span className="text-red-400">🔴 {t.fin}</span>
                          {t.latFin && t.lngFin && (
                            <a href={`https://www.google.com/maps?q=${t.latFin},${t.lngFin}`}
                              target="_blank" rel="noopener noreferrer"
                              className="ml-1 text-blue-400 text-[10px]">📍</a>
                          )}</>
                      : <span className="text-amber-400">Sin cerrar</span>}
                  </td>
                  <td style={{padding:'7px 10px',whiteSpace:'nowrap'}}>
                    {t.tiempoEfectivo || t.duracion
                      ? <span className="text-white font-mono">{t.tiempoEfectivo || t.duracion}</span>
                      : <span className="text-zinc-600">—</span>}
                  </td>
                  <td style={{padding:'7px 10px',whiteSpace:'nowrap'}}>
                    {t.pausaMotivo
                      ? <span className="text-amber-400">⏸ {t.pausaMotivo}{t.pausaDuracionMin ? ` · ${t.pausaDuracionMin}m` : ''}</span>
                      : <span className="text-zinc-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <div className="px-3 py-3">
          <button onClick={loadMore} disabled={loadingMore}
            className="w-full py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-semibold disabled:opacity-50">
            {loadingMore ? 'Cargando...' : '↓ Cargar más turnos'}
          </button>
        </div>
      )}

    </div>
  )
}
