'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export default function HistorialTurnosPage() {
  const router = useRouter()
  const [turnos, setTurnos]       = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor]   = useState<string | null>(null)
  const [hasMore, setHasMore]         = useState(false)
  const [fecha, setFecha]             = useState<string>('')
  const [mostrarPicker, setMostrarPicker] = useState(false)

  const fetchTurnos = useCallback(async (cursor?: string, fechaParam?: string) => {
    const params = new URLSearchParams()
    if (cursor)     params.set('cursor', cursor)
    if (fechaParam) params.set('fecha', fechaParam)
    const res = await fetch('/api/turnos/historial?' + params.toString())
    const d = await res.json()
    const list = Array.isArray(d.turnos) ? d.turnos : Array.isArray(d) ? d : []
    return { list, nextCursor: d.nextCursor ?? null, hasMore: d.hasMore ?? false }
  }, [])

  const reload = useCallback(async (fechaParam?: string) => {
    setLoading(true)
    const { list, nextCursor, hasMore } = await fetchTurnos(undefined, fechaParam).catch(() => ({ list: [], nextCursor: null, hasMore: false }))
    setTurnos(list)
    setNextCursor(nextCursor)
    setHasMore(hasMore)
    setLoading(false)
  }, [fetchTurnos])

  useEffect(() => { reload() }, [reload])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const { list, nextCursor: nc, hasMore: hm } = await fetchTurnos(nextCursor, fecha || undefined)
    setTurnos(prev => [...prev, ...list])
    setNextCursor(nc)
    setHasMore(hm)
    setLoadingMore(false)
  }

  function aplicarFecha(f: string) {
    setFecha(f)
    setMostrarPicker(false)
    reload(f || undefined)
  }

  function limpiarFecha() {
    setFecha('')
    setMostrarPicker(false)
    reload(undefined)
  }

  const titulo = fecha
    ? `📋 ${fecha}`
    : '📋 Últimos 7 días'

  return (
    <div className="w-full pb-24 md:pb-0">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-zinc-800">
        <button onClick={() => router.back()}
          className="text-zinc-400 hover:text-white transition-colors text-lg leading-none flex-shrink-0">‹</button>
        <span className="text-white font-bold text-sm flex-1 truncate">{titulo}</span>
        {fecha && (
          <button onClick={limpiarFecha}
            className="text-zinc-500 hover:text-white text-xs px-2 py-1 rounded-lg bg-zinc-800 flex-shrink-0">
            ✕
          </button>
        )}
        <button onClick={() => setMostrarPicker(p => !p)}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors">
          📅
        </button>
      </div>

      {/* Date picker dropdown */}
      {mostrarPicker && (
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900">
          <input
            type="date"
            defaultValue={fecha}
            max={new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]}
            onChange={e => e.target.value && aplicarFecha(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            autoFocus
          />
        </div>
      )}

      {/* Tabla */}
      {loading && (
        <div className="space-y-px">
          {[...Array(6)].map((_, i) => <div key={i} className="shimmer h-9 w-full" />)}
        </div>
      )}

      {!loading && turnos.length === 0 && (
        <div className="p-6 text-center">
          <p className="text-zinc-500 text-sm">
            {fecha ? `Sin turnos el ${fecha}` : 'Sin turnos en los últimos 7 días'}
          </p>
        </div>
      )}

      {!loading && turnos.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
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
            {loadingMore ? 'Cargando...' : '↓ Cargar más'}
          </button>
        </div>
      )}

    </div>
  )
}
