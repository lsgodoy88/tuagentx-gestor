'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DataTable, { ColDef } from '@/components/DataTable'

function fmtGps(lat: number | null, lng: number | null) {
  if (!lat || !lng) return null
  return `https://www.google.com/maps?q=${lat},${lng}`
}

function getTurnoCols(): ColDef[] {
  return [
    {
      key: 'fecha', label: 'Fecha', width: 110, minWidth: 80,
      render: t => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{t.fecha}</span>,
    },
    {
      key: 'inicio', label: 'Inicio', width: 120, minWidth: 80,
      render: t => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#34d399' }}>🟢 {t.inicio}</span>
          {fmtGps(t.latInicio, t.lngInicio) && (
            <a href={fmtGps(t.latInicio, t.lngInicio)!} target="_blank" rel="noopener noreferrer"
              style={{ color: '#60a5fa', fontSize: 11 }} onClick={e => e.stopPropagation()}>📍</a>
          )}
        </span>
      ),
    },
    {
      key: 'fin', label: 'Fin', width: 120, minWidth: 80,
      render: t => t.fin ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#f87171' }}>🔴 {t.fin}</span>
          {fmtGps(t.latFin, t.lngFin) && (
            <a href={fmtGps(t.latFin, t.lngFin)!} target="_blank" rel="noopener noreferrer"
              style={{ color: '#60a5fa', fontSize: 11 }} onClick={e => e.stopPropagation()}>📍</a>
          )}
        </span>
      ) : <span style={{ color: '#fbbf24', fontSize: 11 }}>Sin cerrar</span>,
    },
    {
      key: 'duracion', label: 'Duración', width: 100, minWidth: 70,
      render: t => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#86efac' }}>
          {t.tiempoEfectivo || t.duracion || '—'}
        </span>
      ),
    },
    {
      key: 'pausa', label: 'Pausa', width: 160, minWidth: 80,
      render: t => t.pausaMotivo
        ? <span style={{ color: '#fbbf24' }}>⏸ {t.pausaMotivo}{t.pausaDuracionMin ? ` · ${t.pausaDuracionMin}m` : ''}</span>
        : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>,
    },
  ]
}

export default function HistorialTurnosPage() {
  const router = useRouter()
  const [turnos, setTurnos]           = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor]   = useState<string | null>(null)
  const [hasMore, setHasMore]         = useState(false)
  const [fecha, setFecha]             = useState<string>('')

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
    const { list, nextCursor, hasMore } = await fetchTurnos(undefined, fechaParam)
      .catch(() => ({ list: [], nextCursor: null, hasMore: false }))
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
    reload(f || undefined)
  }

  function limpiarFecha() {
    setFecha('')
    reload(undefined)
  }

  const cols = getTurnoCols()

  return (
    <div className="w-full pb-24 md:pb-0 space-y-3 p-3">

      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()}
          className="text-zinc-400 hover:text-white transition-colors text-lg leading-none flex-shrink-0">‹</button>
        <span className="text-white font-bold text-sm flex-1 truncate">
          📋 {fecha ? fecha : 'Historial de turnos · 7 días'}
        </span>
        {fecha && (
          <button onClick={limpiarFecha}
            className="text-zinc-500 hover:text-white text-xs px-2 py-1 rounded-lg bg-zinc-800 flex-shrink-0">✕</button>
        )}
        <button onClick={() => {
            setTimeout(() => {
              const el = document.getElementById('historial-date-picker') as HTMLInputElement | null
              if (el) { try { el.showPicker() } catch { el.click() } }
            }, 50)
          }}
          style={{ background: '#1e2a3d', border: '1px solid #1e3a5f', borderRadius: '0.75rem', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, height: 36 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>📅</span>
          {fecha && <span style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>{fecha} ✕</span>}
        </button>
        <input
          id="historial-date-picker"
          type="date"
          value={fecha}
          max={new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]}
          onChange={e => aplicarFecha(e.target.value)}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 animate-pulse h-10" />
          ))}
        </div>
      ) : turnos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-white text-sm">{fecha ? `Sin turnos el ${fecha}` : 'Sin turnos en los últimos 7 días'}</p>
        </div>
      ) : (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          <DataTable
            columns={cols}
            rows={turnos}
            rowKey={t => t.id}
            loading={false}
            storageKey="historial-turnos"
          />
        </div>
      )}

      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore}
          className="w-full py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-semibold disabled:opacity-50">
          {loadingMore ? 'Cargando...' : '↓ Cargar más'}
        </button>
      )}

    </div>
  )
}
