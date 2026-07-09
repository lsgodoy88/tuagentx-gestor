'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('es-CO')

const fmtNum = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 })

function StockBadge({ inventory, stockMinimo }: { inventory: number; stockMinimo: number | null }) {
  if (stockMinimo == null) return <span className="text-zinc-300">{fmtNum(inventory)}</span>
  const bajo = inventory < stockMinimo
  return (
    <span className={bajo ? 'text-red-400 font-semibold' : 'text-emerald-400'}>
      {fmtNum(inventory)}
      {bajo && <span className="ml-1 text-xs">⚠</span>}
    </span>
  )
}

export default function InventarioPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [productos, setProductos] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [marca, setMarca] = useState('')
  const [linea, setLinea] = useState('')
  const [soloStockBajo, setSoloStockBajo] = useState(false)
  const [filtros, setFiltros] = useState<{ marcas: string[]; lineas: string[] }>({ marcas: [], lineas: [] })
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [editingStock, setEditingStock] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Anchos columnas resizables
  const [colW, setColW] = useState([260, 100, 90, 110, 120, 110, 110])
  const resizingCol = useRef<number | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  const COLS = ['Producto', 'Barcode', 'Stock', 'Stock Mín.', 'Precio', 'Marca', 'Línea']

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    if (!['empresa', 'supervisor'].includes(user?.role)) router.push('/inicio')
  }, [status])

  const cargar = useCallback(async (pg = 1) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const p = new URLSearchParams({
        page: String(pg), limit: '50',
        q, marca, linea,
        stockBajo: soloStockBajo ? 'true' : 'false',
      })
      const res = await fetch(`/api/inventario?${p}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error('Error cargando inventario')
      const data = await res.json()
      setProductos(data.productos || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
      setPage(pg)
      if (data.filtros) setFiltros(data.filtros)
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
    } finally {
      setLoading(false)
    }
  }, [q, marca, linea, soloStockBajo])

  useEffect(() => {
    if (status !== 'authenticated') return
    const t = setTimeout(() => cargar(1), 300)
    return () => clearTimeout(t)
  }, [cargar, status])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/inventario/sync', { method: 'POST' })
      const d = await res.json()
      if (d.ok) {
        setSyncMsg(`✅ ${d.upserted} productos sync · ${d.desactivados} desactivados`)
        cargar(1)
      } else {
        setSyncMsg('❌ ' + (d.error || 'Error'))
      }
    } catch {
      setSyncMsg('❌ Error de red')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 5000)
    }
  }

  const guardarStockMin = async (id: string) => {
    const val = editVal === '' ? null : parseFloat(editVal)
    await fetch('/api/inventario', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, stockMinimo: val }),
    })
    setEditingStock(null)
    setEditVal('')
    setProductos(prev => prev.map(p => p.id === id ? { ...p, stockMinimo: val, stockBajo: val != null && p.inventory < val } : p))
  }

  // Resize handlers
  const onResizeMouseDown = (e: React.MouseEvent, i: number) => {
    e.preventDefault()
    resizingCol.current = i
    resizeStartX.current = e.clientX
    resizeStartW.current = colW[i]
    const onMove = (ev: MouseEvent) => {
      if (resizingCol.current === null) return
      const delta = ev.clientX - resizeStartX.current
      setColW(prev => {
        const next = [...prev]
        next[resizingCol.current!] = Math.max(60, resizeStartW.current + delta)
        return next
      })
    }
    const onUp = () => {
      resizingCol.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const stockBajoCount = productos.filter(p => p.stockBajo).length

  const thBase: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: 13,
    fontWeight: 500,
    color: 'white',
    textAlign: 'center',
    userSelect: 'none',
    position: 'relative',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    borderRight: '1px solid #1e2a3d',
    background: '#0d1220',
  }

  const tdBase: React.CSSProperties = {
    padding: '9px 10px',
    fontSize: 13,
    borderBottom: '1px solid #131c2e',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white">📦 Inventario</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {syncMsg && <span className="text-xs text-zinc-300">{syncMsg}</span>}
          {user?.role === 'empresa' && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition"
            >
              {syncing ? '⏳ Sincronizando…' : '🔄 Sincronizar'}
            </button>
          )}
        </div>
      </div>

      {/* Filtros — línea 1: buscador + stock bajo + contador */}
      <div className="flex gap-2 items-center">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar producto o barcode…"
          className="w-[35%] bg-[#0d1220] border border-[#1e2a3d] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={() => setSoloStockBajo(v => !v)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition ${
            soloStockBajo
              ? 'bg-red-900/40 border-red-500 text-red-300'
              : 'bg-[#0d1220] border-[#1e2a3d] text-zinc-400 hover:border-zinc-500'
          }`}
        >
          ⚠ Stock bajo {soloStockBajo && stockBajoCount > 0 && `(${stockBajoCount})`}
        </button>
        <span className="text-zinc-500 text-xs whitespace-nowrap">{total.toLocaleString('es-CO')} productos</span>
      </div>

      {/* Filtros — línea 2: dropdowns */}
      <div className="flex gap-2 items-center">
        <select
          value={marca}
          onChange={e => setMarca(e.target.value)}
          className="flex-1 bg-[#0d1220] border border-[#1e2a3d] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">Todas las marcas</option>
          {filtros.marcas.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={linea}
          onChange={e => setLinea(e.target.value)}
          className="flex-1 bg-[#0d1220] border border-[#1e2a3d] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">Todas las líneas</option>
          {filtros.lineas.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-[#1e2a3d] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: colW.reduce((a, b) => a + b, 0) + 'px' }}>
            <colgroup>
              {colW.map((w, i) => <col key={i} style={{ width: w + 'px' }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                {COLS.map((label, i) => (
                  <th key={label} style={thBase}>
                    {label}
                    <div
                      onMouseDown={e => onResizeMouseDown(e, i)}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', background: 'transparent' }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={COLS.length} style={{ ...tdBase, textAlign: 'center', color: '#6b7280', padding: '40px' }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && productos.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} style={{ ...tdBase, textAlign: 'center', color: '#6b7280', padding: '40px' }}>
                    {soloStockBajo ? 'Sin alertas de stock bajo 🎉' : 'Sin productos — sincroniza primero'}
                  </td>
                </tr>
              )}
              {!loading && productos.map((p: any, i: number) => (
                <tr
                  key={p.id}
                  style={{ background: p.stockBajo ? 'rgba(239,68,68,0.05)' : i % 2 === 0 ? '#0a0f1a' : '#080d17' }}
                >
                  {/* Nombre */}
                  <td style={{ ...tdBase, color: 'white', fontWeight: 500 }} title={p.nombre}>
                    {p.nombre}
                  </td>
                  {/* Barcode */}
                  <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8', fontFamily: 'monospace' }}>
                    {p.barcode || '—'}
                  </td>
                  {/* Stock */}
                  <td style={{ ...tdBase, textAlign: 'right' }}>
                    <StockBadge inventory={p.inventory} stockMinimo={p.stockMinimo} />
                  </td>
                  {/* Stock mínimo — editable */}
                  <td style={{ ...tdBase, textAlign: 'right' }}>
                    {editingStock === p.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          autoFocus
                          type="number"
                          value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') guardarStockMin(p.id)
                            if (e.key === 'Escape') { setEditingStock(null); setEditVal('') }
                          }}
                          className="w-16 bg-[#0d1220] border border-blue-500 text-white rounded px-1.5 py-0.5 text-xs text-right focus:outline-none"
                          placeholder="0"
                        />
                        <button onClick={() => guardarStockMin(p.id)} className="text-emerald-400 text-xs hover:text-emerald-300">✓</button>
                        <button onClick={() => { setEditingStock(null); setEditVal('') }} className="text-zinc-500 text-xs hover:text-zinc-300">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingStock(p.id); setEditVal(p.stockMinimo != null ? String(p.stockMinimo) : '') }}
                        className="text-zinc-400 hover:text-white transition group"
                        title="Editar stock mínimo"
                      >
                        {p.stockMinimo != null
                          ? <span className={p.stockBajo ? 'text-red-400' : 'text-zinc-300'}>{fmtNum(p.stockMinimo)}</span>
                          : <span className="text-zinc-600 group-hover:text-zinc-400">— fijar</span>
                        }
                      </button>
                    )}
                  </td>
                  {/* Precio */}
                  <td style={{ ...tdBase, textAlign: 'right', color: '#fde68a' }}>
                    {fmt(p.precio)}
                  </td>
                  {/* Marca */}
                  <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8' }} title={p.marca}>
                    {p.marca || '—'}
                  </td>
                  {/* Línea */}
                  <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8' }} title={p.linea}>
                    {p.linea || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 py-3 border-t border-[#1e2a3d] bg-[#0a0f1a]">
            <button
              onClick={() => cargar(page - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30 border border-[#1e2a3d] hover:border-zinc-500 transition"
            >
              ← Anterior
            </button>
            <span className="text-xs text-zinc-500">Página {page} de {pages}</span>
            <button
              onClick={() => cargar(page + 1)}
              disabled={page >= pages || loading}
              className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30 border border-[#1e2a3d] hover:border-zinc-500 transition"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
