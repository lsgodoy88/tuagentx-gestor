'use client'
import { useState, useEffect } from 'react'

const gThSt: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, fontWeight: 500, color: '#64748b',
  textAlign: 'left', borderBottom: '1px solid #131c2e', whiteSpace: 'nowrap',
}
const gTdSt: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis',
}

export default function TabRotacion() {
  const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
  const fmtP = (n: number | null | undefined) => n == null ? '—' : '$' + priceFmt.format(n)

  const [snapshots, setSnapshots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/impulsar/rotacion-snapshots?dias=14')
      .then(r => r.json())
      .then(d => { setSnapshots(d.snapshots || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer h-16 rounded-xl" />)}
    </div>
  )

  if (snapshots.length === 0) return (
    <div className="rounded-2xl p-10 text-center" style={{ background: '#0d1220', border: '1px solid #131c2e' }}>
      <p className="text-zinc-500 text-sm">Sin reportes en los últimos 14 días</p>
    </div>
  )

  return (
    <div className="space-y-2">
      <p className="text-zinc-400 text-xs px-1">Rotación — últimos 14 días</p>
      {snapshots.map((snap: any) => {
        const montoTotal = snap.filas.reduce((acc: number, f: any) => {
          const cant = f.cantidad ?? 0
          const prv  = f.precioVenta ?? 0
          return acc + cant * prv
        }, 0)

        return (
          <div key={snap.key} className="rounded-xl overflow-hidden" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
            <button
              onClick={() => setExpandido(expandido === snap.key ? null : snap.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left">
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate">{snap.clienteNombre}</p>
                <p className="text-zinc-500 text-xs">{snap.impulsadoraNombre} · {snap.fecha}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <div className="text-right">
                  {montoTotal > 0 && <p className="text-blue-400 font-bold text-sm">{fmtP(montoTotal)}</p>}
                  <p className="text-zinc-500 text-xs">{snap.filas.length} productos</p>
                </div>
                <span className="text-zinc-500 text-sm">{expandido === snap.key ? '▲' : '▼'}</span>
              </div>
            </button>

            {expandido === snap.key && (
              <div className="border-t" style={{ borderColor: '#131c2e' }}>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ minWidth: 360, background: '#0a0f1a' }}>
                    <thead>
                      <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                        <th style={{ ...gThSt, textAlign: 'right', width: 70 }}>Cant.</th>
                        <th style={gThSt}>Producto</th>
                        <th style={{ ...gThSt, textAlign: 'right', width: 100 }}>Precio V.</th>
                        <th style={{ ...gThSt, textAlign: 'right', width: 100 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.filas.map((f: any, i: number) => {
                        const cant  = f.cantidad ?? 0
                        const prv   = f.precioVenta ?? null
                        const total = prv != null && cant > 0 ? cant * prv : null
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #0d1524', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>{cant || '—'}</td>
                            <td style={{ ...gTdSt, color: '#e2e8f0' }}>{f.productoNombre}</td>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#64748b' }}>{prv != null ? fmtP(prv) : '—'}</td>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#a78bfa', fontWeight: 600 }}>{total != null ? fmtP(total) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
