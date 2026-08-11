'use client'
import { useSession } from 'next-auth/react'
import { useBodegaContext } from '@/lib/bodega-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'

const numFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })
const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const fmt = (n: number | null | undefined) => n == null ? '—' : '$' + priceFmt.format(Math.round(n))
const fmtNum = (n: number) => numFmt.format(n)

function getEstadoStock(inventory: number, stockMinimo: number | null): 'ok' | 'alerta' | 'agotado' {
  if (inventory <= 0) return 'agotado'
  if (stockMinimo != null && inventory <= stockMinimo) return 'alerta'
  return 'ok'
}

function StockBadge({ inventory, stockMinimo }: { inventory: number; stockMinimo: number | null }) {
  const estado = getEstadoStock(inventory, stockMinimo)
  return (
    <span className={estado === 'agotado' ? 'text-red-400 font-semibold' : estado === 'alerta' ? 'text-orange-400 font-semibold' : 'text-emerald-400'}>
      {fmtNum(inventory)}
      {estado === 'agotado' && <span className="ml-1 text-xs">✕</span>}
      {estado === 'alerta' && <span className="ml-1 text-xs">⚠</span>}
    </span>
  )
}

const COLS = ['💡 Sugerir', 'Producto', 'Stock', 'Stock Mín.', 'Costo', 'Precio', 'Marca', 'Línea', 'Barcode']
const COLS_W0 = [90, 220, 80, 90, 90, 110, 100, 100, 120]

const tdBase: React.CSSProperties = { padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #131c2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const thBase: React.CSSProperties = { padding: '8px 10px', fontSize: 13, fontWeight: 500, color: 'white', textAlign: 'center', userSelect: 'none', position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', borderRight: '1px solid #1e2a3d', background: '#0d1220' }

function getSSKey(origenId?: string) { return origenId && origenId !== 'propia' ? 'stock_cache_' + origenId : 'stock_cache' }
function getCache(origenId?: string) { try { const r = sessionStorage.getItem(getSSKey(origenId)); return r ? JSON.parse(r) : null } catch { return null } }
function setCache(origenId: string | undefined, data: any) { try { sessionStorage.setItem(getSSKey(origenId), JSON.stringify(data)) } catch {} }
function clearCache(origenId?: string) { try { sessionStorage.removeItem(getSSKey(origenId)) } catch {} }
function cacheValido(origenId?: string) { return (getCache(origenId)?.productos?.length ?? 0) > 0 }

function EditableCell({ value, onSave, color, placeholder }: {
  value: number | null; onSave: (v: number | null) => void; color?: string; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  if (editing) return (
    <div className="flex items-center justify-end gap-1">
      <input autoFocus type="number" value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(val === '' ? null : parseFloat(val)); setEditing(false) }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-16 bg-[#0d1220] border border-blue-500 text-white rounded px-1.5 py-0.5 text-xs text-right focus:outline-none"
        placeholder="0" />
      <button onClick={() => { onSave(val === '' ? null : parseFloat(val)); setEditing(false) }} className="text-emerald-400 text-xs hover:text-emerald-300">✓</button>
      <button onClick={() => setEditing(false)} className="text-zinc-500 text-xs hover:text-zinc-300">✕</button>
    </div>
  )
  return (
    <button onClick={() => { setEditing(true); setVal(value != null ? String(value) : '') }}
      className="text-zinc-400 hover:text-white transition group w-full text-right" title="Editar">
      {value != null
        ? <span className={color || 'text-zinc-300'}>{fmtNum(value)}</span>
        : <span className="text-zinc-600 group-hover:text-zinc-400">{placeholder || '— fijar'}</span>
      }
    </button>
  )
}

export default function InventarioPage() {
  const { origenId: origenBodega } = useBodegaContext()
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const _c0 = getCache(origenBodega)
  const [productos, setProductos] = useState<any[]>(_c0?.productos ?? [])
  const [total, setTotal] = useState(_c0?.total ?? 0)
  const [pages, setPages] = useState(_c0?.pages ?? 1)
  const [page, setPage] = useState(_c0?.page ?? 1)
  const [q, setQ] = useState(_c0?.q ?? '')
  const [linea, setLinea] = useState(_c0?.linea ?? '')
  const [filtros, setFiltros] = useState<{ marcas: string[]; lineas: string[] }>(_c0?.filtros ?? { marcas: [], lineas: [] })
  const [loading, setLoading] = useState(!_c0?.productos?.length)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [colW, setColW] = useState<number[]>(_c0?.colW ?? COLS_W0)
  const [secAgotadosAbierta, setSecAgotadosAbierta] = useState(true)
  const [secAlertaAbierta, setSecAlertaAbierta] = useState(true)

  const abortRef = useRef<AbortController | null>(null)
  const resizingCol = useRef<number | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    if (!['empresa', 'supervisor', 'bodega'].includes(user?.role)) router.push('/inicio')
  }, [status])

  const cargar = useCallback(async (pg = 1) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(pg), limit: '50', q, marca: '', linea, ...(origenBodega && origenBodega !== 'propia' ? { origenId: origenBodega } : {}) })
      const res = await fetch(`/api/stock?${p}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      const prods = data.productos || []
      setProductos(prods); setTotal(data.total || 0); setPages(data.pages || 1); setPage(pg)
      if (data.filtros) setFiltros(data.filtros)
      setCache(origenBodega, { productos: prods, total: data.total, pages: data.pages, page: pg, filtros: data.filtros, q, linea, colW })
    } catch (e: any) { if (e.name !== 'AbortError') console.error(e) }
    finally { setLoading(false) }
  }, [q, linea, origenBodega])

  useEffect(() => {
    if (status !== 'authenticated') return
    if (cacheValido(origenBodega)) return
    const t = setTimeout(() => cargar(1), 300)
    return () => clearTimeout(t)
  }, [status, origenBodega])

  useEffect(() => {
    if (status !== 'authenticated') return
    const t = setTimeout(() => cargar(1), 300)
    return () => clearTimeout(t)
  }, [q, linea, origenBodega])

  const handleSync = async () => {
    clearCache(origenBodega); setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/stock/sync', { method: 'POST' })
      const d = await res.json()
      setSyncMsg(d.ok ? `✅ ${d.upserted} sync · ${d.desactivados} desactivados` : '❌ ' + (d.error || 'Error'))
      if (d.ok) cargar(1)
    } catch { setSyncMsg('❌ Error de red') }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(''), 5000) }
  }

  const actualizarProducto = async (id: string, campo: 'stockMinimo' | 'costo' | 'stockSugerido', valor: number | null) => {
    const res = await fetch('/api/stock', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [campo]: valor, ...(origenBodega && origenBodega !== 'propia' ? { origenId: origenBodega } : {}) }),
    })
    if (!res.ok) return
    setProductos(prev => {
      const updated = prev.map(p => {
        if (p.id !== id) return p
        if (campo === 'stockMinimo') return { ...p, stockMinimo: valor, stockBajo: valor != null && p.inventory <= valor }
        if (campo === 'costo') return { ...p, costo: valor }
        if (campo === 'stockSugerido') return { ...p, stockSugerido: valor }
        return p
      })
      // stockSugerido cambia lo que ve TabSugerido — invalidar cache para forzar refetch
      if (campo === 'stockSugerido') {
        clearCache(origenBodega)
      } else {
        const cached = getCache(origenBodega)
        if (cached) setCache(origenBodega, { ...cached, productos: updated })
      }
      return updated
    })
  }

  const onResizeMouseDown = (e: React.MouseEvent, i: number) => {
    e.preventDefault()
    resizingCol.current = i; resizeStartX.current = e.clientX; resizeStartW.current = colW[i]
    let rafId: number
    const onMove = (ev: MouseEvent) => {
      if (resizingCol.current === null) return
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const delta = ev.clientX - resizeStartX.current
        setColW(prev => { const next = [...prev]; next[resizingCol.current!] = Math.max(60, resizeStartW.current + delta); return next })
      })
    }
    const onUp = () => { cancelAnimationFrame(rafId); resizingCol.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const { agotados, enAlerta, normales } = useMemo(() => {
    const agotados: any[] = [], enAlerta: any[] = [], normales: any[] = []
    for (const p of productos) {
      if (p.inventory <= 0) agotados.push(p)
      else if (p.stockMinimo != null && p.inventory <= p.stockMinimo) enAlerta.push(p)
      else normales.push(p)
    }
    return { agotados, enAlerta, normales }
  }, [productos])

  const minWidth = useMemo(() => colW.reduce((a, b) => a + b, 0) + 'px', [colW])

  const renderFila = (p: any, i: number) => (
    <tr key={p.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        <EditableCell value={p.stockSugerido ?? null} placeholder="— sugerir" color="text-yellow-300"
          onSave={v => actualizarProducto(p.id, 'stockSugerido', v)} />
      </td>
      <td style={{ ...tdBase, color: 'white', fontWeight: 500 }} title={p.nombre}>{p.nombre}</td>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        <StockBadge inventory={p.inventory} stockMinimo={p.stockMinimo} />
      </td>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        <EditableCell value={p.stockMinimo ?? null}
          color={p.inventory <= (p.stockMinimo ?? Infinity) ? 'text-orange-400' : 'text-zinc-300'}
          onSave={v => actualizarProducto(p.id, 'stockMinimo', v)} />
      </td>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        <EditableCell value={p.costo ?? null} placeholder="— costo" color="text-cyan-300"
          onSave={v => actualizarProducto(p.id, 'costo', v)} />
      </td>
      <td style={{ ...tdBase, textAlign: 'right', color: '#fde68a' }}>{fmt(p.precio)}</td>
      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8' }} title={p.marca}>{p.marca || '—'}</td>
      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8' }} title={p.linea}>{p.linea || '—'}</td>
      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8', fontFamily: 'monospace' }}>{p.barcode || '—'}</td>
    </tr>
  )

  const renderTabla = (lista: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth, background: '#0a0f1a' }}>
        <colgroup>{colW.map((w, i) => <col key={i} style={{ width: w + 'px' }} />)}</colgroup>
        <thead>
          <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
            {COLS.map((label, i) => (
              <th key={label} style={thBase}>
                {label}
                <div onMouseDown={e => onResizeMouseDown(e, i)}
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', background: 'transparent' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{lista.map((p, i) => renderFila(p, i))}</tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {(user?.role === 'empresa' || syncMsg) && (
        <div className="flex items-center justify-end gap-2">
          {syncMsg && <span className="text-xs text-zinc-300">{syncMsg}</span>}
          {user?.role === 'empresa' && (
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition">
              {syncing ? '⏳ Sincronizando…' : '🔄 Sincronizar'}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…"
          className="min-w-0 flex-1 bg-[#0d1220] border border-[#1e2a3d] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
        <select value={linea} onChange={e => setLinea(e.target.value)}
          className="flex-shrink-0 w-32 bg-[#0d1220] border border-[#1e2a3d] text-white rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">Línea</option>
          {filtros.lineas.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {agotados.length > 0 && (
        <div className="rounded-xl border border-red-500/30 overflow-hidden">
          <div style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}
            className="flex items-center justify-between px-4 py-2.5 cursor-pointer"
            onClick={() => setSecAgotadosAbierta(v => !v)}>
            <span className="text-red-400 font-semibold text-sm">🔴 Agotados ({agotados.length})</span>
            <span className="text-zinc-500 text-xs">{secAgotadosAbierta ? '▲' : '▼'}</span>
          </div>
          {secAgotadosAbierta && renderTabla(agotados)}
        </div>
      )}

      {enAlerta.length > 0 && (
        <div className="rounded-xl border border-orange-500/30 overflow-hidden">
          <div style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}
            className="flex items-center justify-between px-4 py-2.5 cursor-pointer"
            onClick={() => setSecAlertaAbierta(v => !v)}>
            <span className="text-orange-400 font-semibold text-sm">🟠 Stock bajo ({enAlerta.length})</span>
            <span className="text-zinc-500 text-xs">{secAlertaAbierta ? '▲' : '▼'}</span>
          </div>
          {secAlertaAbierta && renderTabla(enAlerta)}
        </div>
      )}

      <div className="rounded-xl border border-emerald-500/20 overflow-hidden">
        <div style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }} className="flex items-center px-4 py-2.5">
          <span className="text-emerald-400 font-semibold text-sm">🟢 Inventariables ({normales.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth, background: '#0a0f1a' }}>
            <colgroup>{colW.map((w, i) => <col key={i} style={{ width: w + 'px' }} />)}</colgroup>
            <thead>
              <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                {COLS.map((label, i) => (
                  <th key={label} style={thBase}>
                    {label}
                    <div onMouseDown={e => onResizeMouseDown(e, i)}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', background: 'transparent' }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={COLS.length} style={{ ...tdBase, textAlign: 'center', padding: '40px' }}>
                  <div className="flex items-center justify-center">
                    <span className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  </div>
                </td></tr>
              )}
              {!loading && normales.length === 0 && <tr><td colSpan={COLS.length} style={{ ...tdBase, textAlign: 'center', color: '#6b7280', padding: '40px' }}>Sin productos — sincroniza primero</td></tr>}
              {!loading && normales.map((p, i) => renderFila(p, i))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 py-3 border-t border-[#1e2a3d] bg-[#0a0f1a]">
            <button onClick={() => cargar(page - 1)} disabled={page <= 1 || loading}
              className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30 border border-[#1e2a3d] hover:border-zinc-500 transition">← Anterior</button>
            <span className="text-xs text-zinc-500">Página {page} de {pages}</span>
            <button onClick={() => cargar(page + 1)} disabled={page >= pages || loading}
              className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30 border border-[#1e2a3d] hover:border-zinc-500 transition">Siguiente →</button>
          </div>
        )}
      </div>
    </div>
  )
}
