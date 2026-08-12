'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'

const numFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })
const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const fmt = (n: number | null | undefined) => n == null ? '—' : '$' + priceFmt.format(Math.round(n))
const fmtNum = (n: number) => numFmt.format(n)
const fmtFecha = (f: string) => new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const tdBase: React.CSSProperties = { padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #131c2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const thBase: React.CSSProperties = { padding: '8px 10px', fontSize: 13, fontWeight: 500, color: 'white', textAlign: 'center', userSelect: 'none', whiteSpace: 'nowrap', borderRight: '1px solid #1e2a3d', background: '#0d1220' }

export default function TabSugerido({ empresaId }: { empresaId: string }) {
  const { data: session } = useSession()
  const isAdmin = (session?.user as any)?.role === 'empresa'
  const [productos, setProductos] = useState<any[]>([])
  const [promedios, setPromedios] = useState<Record<string, { promedio: number; total_guardados: number }>>({})
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const origenParam = empresaId && empresaId !== 'propia' ? `&origenId=${empresaId}` : ''
      const [resStock, resProm, resSanps] = await Promise.all([
        fetch(`/api/stock?limit=500&page=1${origenParam}`),
        fetch('/api/stock/sugerido'),
        fetch('/api/stock/sugerido?snapshots=1'),
      ])
      const dataStock = await resStock.json()
      const dataProm = await resProm.json()
      const dataSnaps = await resSanps.json()
      setProductos((dataStock.productos ?? []).filter((p: any) => p.stockSugerido != null))
      setPromedios(dataProm.promedios ?? {})
      setSnapshots(dataSnaps.snapshots ?? [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [empresaId])

  useEffect(() => { cargar() }, [cargar])

  const totalAcumulado = useMemo(() => productos.reduce((acc, p) => {
    const diferencia = Math.max(0, (p.stockMinimo ?? 0) - p.inventory)
    return acc + diferencia * (p.costo ?? 0)
  }, 0), [productos])

  const guardar = async () => {
    if (productos.length === 0) return
    setGuardando(true); setMsg('')
    const items = productos.map(p => ({
      productoId: p.id, nombre: p.nombre,
      costo: p.costo ?? null,
      sugerido: p.stockSugerido,
      diferencia: Math.max(0, (p.stockMinimo ?? 0) - p.inventory),
    }))
    try {
      const res = await fetch('/api/stock/sugerido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
      const d = await res.json()
      if (d.ok) {
        setMsg(`✅ ${d.guardados} guardados`)
        // Limpiar cache sessionStorage para que inventario recargue sin sugeridos
        try { sessionStorage.removeItem('stock_cache'); sessionStorage.removeItem('stock_cache_' + empresaId) } catch {}
        await cargar()
      }
      else setMsg('❌ ' + (d.error || 'Error'))
    } catch { setMsg('❌ Error de red') }
    finally { setGuardando(false); setTimeout(() => setMsg(''), 4000) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <span className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Tabla activa */}
      {productos.length === 0 ? (
        <div className="rounded-xl border border-[#1e2a3d] bg-[#0a0f1a] p-10 text-center text-zinc-500 text-sm">
          <p className="text-4xl mb-3">💡</p>
          <p>Ningún producto con sugerido aún.</p>
          <p className="text-xs mt-1">Edita la columna 💡 Sugerir en la tab Inventario.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-yellow-500/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ background: '#0a0f1a' }}>
              <thead>
                <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                  {['Producto', 'Diferencia', 'Costo', 'Sugerido', 'Promedio', 'Total'].map(label => (
                    <th key={label} style={thBase}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productos.map((p, i) => {
                  const diferencia = Math.max(0, (p.stockMinimo ?? 0) - p.inventory)
                  const total = diferencia * (p.costo ?? 0)
                  const prom = promedios[p.id]
                  return (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <td style={{ ...tdBase, color: 'white', fontWeight: 500 }} title={p.nombre}>{p.nombre}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#f87171' }}>{fmtNum(diferencia)}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#67e8f9' }}>{p.costo != null ? fmt(p.costo) : '—'}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#fde047' }}>{fmtNum(p.stockSugerido)}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#a78bfa' }}>
                        {prom ? <span title={`${prom.total_guardados} guardado${prom.total_guardados !== 1 ? 's' : ''}`}>{fmtNum(prom.promedio)}</span> : <span className="text-zinc-600">—</span>}
                      </td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>
                        {p.costo != null ? fmt(total) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#1e2a3d] bg-[#0d1220]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Total acumulado</span>
              <span className="text-sm font-bold text-emerald-400">{fmt(totalAcumulado)}</span>
            </div>
            <div className="flex items-center gap-3">
              {msg && <span className="text-xs text-zinc-300">{msg}</span>}
              {isAdmin && (
                <button onClick={guardar} disabled={guardando}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-500 hover:bg-yellow-400 text-black disabled:opacity-50 transition">
                  {guardando ? '⏳…' : '💾 Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Historial de guardados — colapsado por defecto */}
      {snapshots.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 px-1">Historial de guardados</p>
          {snapshots.map((snap: any, i: number) => (
            <SnapRow key={i} snap={snap} empresaId={empresaId} />
          ))}
        </div>
      )}
    </div>
  )
}

function SnapRow({ snap, empresaId }: { snap: any; empresaId: string }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const cargarDetalle = async () => {
    if (items.length > 0) { setOpen(o => !o); return }
    setLoading(true)
    try {
      const origenParam = empresaId && empresaId !== 'propia' ? `&origenId=${empresaId}` : ''
      const res = await fetch(`/api/stock/sugerido/snapshot?fecha=${encodeURIComponent(snap.fecha)}${origenParam}`)
      const d = await res.json()
      setItems(d.items ?? [])
      setOpen(true)
    } catch { setOpen(true) }
    finally { setLoading(false) }
  }

  const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
  const fmt = (n: number) => '$' + priceFmt.format(Math.round(n))
  const fmtFecha = (f: string) => new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="rounded-xl border border-[#1e2a3d] overflow-hidden">
      <button onClick={cargarDetalle}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0d1220] hover:bg-[#111827] transition text-left">
        <span className="text-zinc-400 text-xs">{fmtFecha(snap.fecha)}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-emerald-400">{fmt(snap.total)}</span>
          {loading
            ? <span className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            : <span className="text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
          }
        </div>
      </button>
      {open && items.length > 0 && (
        <div className="overflow-x-auto bg-[#0a0f1a]">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                {['Producto', 'Sugerido', 'Total'].map(l => (
                  <th key={l} style={{ padding: '6px 10px', color: '#94a3b8', fontWeight: 500, textAlign: l === 'Producto' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, i: number) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: '1px solid #131c2e' }}>
                  <td style={{ padding: '7px 10px', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{it.nombre}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#fde047' }}>{it.sugerido}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>{it.costo != null ? fmt(it.diferencia * it.costo) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
