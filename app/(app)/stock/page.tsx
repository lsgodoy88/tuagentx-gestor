'use client'
import { useSession } from 'next-auth/react'
import { useBodegaContext } from '@/lib/bodega-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : '$' + priceFmt.format(Math.round(n))

const fmtNum = (n: number) => numFmt.format(n)

function getEstadoStock(inventory: number, stockMinimo: number | null): 'ok' | 'alerta' | 'agotado' {
  if (inventory <= 0) return 'agotado'
  if (stockMinimo != null && inventory <= stockMinimo) return 'alerta'
  return 'ok'
}

function StockBadge({ inventory, stockMinimo }: { inventory: number; stockMinimo: number | null }) {
  const estado = getEstadoStock(inventory, stockMinimo)
  return (
    <span className={
      estado === 'agotado' ? 'text-red-400 font-semibold' :
      estado === 'alerta'  ? 'text-orange-400 font-semibold' :
      'text-emerald-400'
    }>
      {fmtNum(inventory)}
      {estado === 'agotado' && <span className="ml-1 text-xs">✕</span>}
      {estado === 'alerta'  && <span className="ml-1 text-xs">⚠</span>}
    </span>
  )
}

const COLS = ['Producto', 'Barcode', 'Stock', 'Stock Mín.', 'Precio', 'Marca', 'Línea']

const tdBaseStatic: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: 13,
  borderBottom: '1px solid #131c2e',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const thBaseStatic: React.CSSProperties = {
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

// Cache de formato numérico — evita crear Intl.NumberFormat en cada llamada
const numFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })
const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

// Cache sessionStorage — sobrevive navegaciones y F5
function getSSKey(origenId?: string) { return origenId && origenId !== 'propia' ? 'stock_cache_' + origenId : 'stock_cache' }
function getCache(origenId?: string) {
  try { const r = sessionStorage.getItem(getSSKey(origenId)); return r ? JSON.parse(r) : null } catch { return null }
}
function setCache(origenId: string | undefined, data: any) {
  try { sessionStorage.setItem(getSSKey(origenId), JSON.stringify(data)) } catch {}
}
function clearCache(origenId?: string) {
  try { sessionStorage.removeItem(getSSKey(origenId)) } catch {}
}
function cacheValido(origenId?: string) { return (getCache(origenId)?.productos?.length ?? 0) > 0 }

export default function InventarioPage() {
  const { origenId: origenBodega } = useBodegaContext()
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  // Leer sessionStorage una sola vez al montar
  const _c0 = getCache(origenBodega)
  const [productos, setProductos] = useState<any[]>(_c0?.productos ?? [])
  const [total, setTotal] = useState(_c0?.total ?? 0)
  const [pages, setPages] = useState(_c0?.pages ?? 1)
  const [page, setPage] = useState(_c0?.page ?? 1)
  const [q, setQ] = useState(_c0?.q ?? '')
  const [marca] = useState('') // dropdown marca eliminado de UI — siempre vacío
  const [linea, setLinea] = useState(_c0?.linea ?? '')
  const [filtros, setFiltros] = useState<{ marcas: string[]; lineas: string[] }>(_c0?.filtros ?? { marcas: [], lineas: [] })
  const [loading, setLoading] = useState(!_c0?.productos?.length)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [editingStock, setEditingStock] = useState<string | null>(null)
  const [secAgotadosAbierta, setSecAgotadosAbierta] = useState(true)
  const [secAlertaAbierta, setSecAlertaAbierta] = useState(true)
  const [editVal, setEditVal] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Anchos columnas resizables
  const [colW, setColW] = useState<number[]>(_c0?.colW ?? [260, 100, 90, 110, 120, 110, 110])
  const resizingCol = useRef<number | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  // COLS definido fuera del componente (ver arriba)

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
      const p = new URLSearchParams({
        page: String(pg), limit: '50',
        q, marca, linea,
        ...(origenBodega && origenBodega !== 'propia' ? { origenId: origenBodega } : {}),
      })
      const res = await fetch(`/api/stock?${p}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error('Error cargando inventario')
      const data = await res.json()
      const prods = data.productos || []
      const tot = data.total || 0
      const pgs = data.pages || 1
      const flt = data.filtros ?? filtros
      setProductos(prods)
      setTotal(tot)
      setPages(pgs)
      setPage(pg)
      if (data.filtros) setFiltros(flt)
      // Guardar snapshot en cache módulo
      setCache(origenBodega, { productos: prods, total: tot, pages: pgs, page: pg, filtros: flt, q, marca, linea, colW })
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
    } finally {
      setLoading(false)
    }
  }, [q, marca, linea, origenBodega])

  // Montaje inicial + cambio de empresa — recarga si cambia origenBodega
  useEffect(() => {
    if (status !== 'authenticated') return
    if (cacheValido(origenBodega)) return
    const t = setTimeout(() => cargar(1), 300)
    return () => clearTimeout(t)
  }, [status, origenBodega])

  // Cambio de filtros — siempre recarga
  useEffect(() => {
    if (status !== 'authenticated') return
    const t = setTimeout(() => cargar(1), 300)
    return () => clearTimeout(t)
  }, [q, linea, origenBodega])

  const handleSync = async () => {
    clearCache(origenBodega) // invalidar cache antes de sync
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/stock/sync', { method: 'POST' })
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
    await fetch('/api/stock', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, stockMinimo: val }),
    })
    setEditingStock(null)
    setEditVal('')
    setProductos(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, stockMinimo: val, stockBajo: val != null && p.inventory <= val } : p)
      // Actualizar cache con nuevo stockMinimo
      const cached = getCache(origenBodega)
      if (cached) setCache(origenBodega, { ...cached, productos: updated })
      return updated
    })
  }

  // Resize handlers
  const onResizeMouseDown = (e: React.MouseEvent, i: number) => {
    e.preventDefault()
    resizingCol.current = i
    resizeStartX.current = e.clientX
    resizeStartW.current = colW[i]
    let rafId: number
    const onMove = (ev: MouseEvent) => {
      if (resizingCol.current === null) return
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const delta = ev.clientX - resizeStartX.current
        setColW((prev: number[]) => {
          const next = [...prev]
          next[resizingCol.current!] = Math.max(60, resizeStartW.current + delta)
          return next
        })
      })
    }
    const onUp = () => {
      cancelAnimationFrame(rafId)
      resizingCol.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const { agotados, enAlerta, normales } = useMemo(() => {
    const agotados: any[] = []
    const enAlerta: any[] = []
    const normales: any[] = []
    for (const p of productos) {
      if (p.inventory <= 0) agotados.push(p)
      else if (p.stockMinimo != null && p.inventory <= p.stockMinimo) enAlerta.push(p)
      else normales.push(p)
    }
    return { agotados, enAlerta, normales }
  }, [productos])

  const thBase = thBaseStatic

  const tdBase = tdBaseStatic

  const minWidth = useMemo(() => colW.reduce((a: number, b: number) => a + b, 0) + 'px', [colW])

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header — solo botón sync para empresa */}
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

      {/* Filtros — buscador + línea en una sola fila */}
      <div className="flex gap-2 items-center" style={{ minWidth:0 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar…"
          className="min-w-0 flex-1 bg-[#0d1220] border border-[#1e2a3d] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <select
          value={linea}
          onChange={e => setLinea(e.target.value)}
          className="flex-shrink-0 w-32 bg-[#0d1220] border border-[#1e2a3d] text-white rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">Línea</option>
          {filtros.lineas.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* ── Sección Agotados ──────────────────────────────────────────── */}
      {agotados.length > 0 && (
        <div className="rounded-xl border border-red-500/30 overflow-hidden">
          <div style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}
            className="flex items-center justify-between px-4 py-2.5 cursor-pointer"
            onClick={() => setSecAgotadosAbierta(v => !v)}>
            <span className="text-red-400 font-semibold text-sm">🔴 Agotados ({agotados.length})</span>
            <span className="text-zinc-500 text-xs">{secAgotadosAbierta ? '▲' : '▼'}</span>
          </div>
          {secAgotadosAbierta && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth, background: '#0a0f1a' }}>
                <colgroup>{colW.map((w: number,i: number)=><col key={i} style={{width:w+'px'}}/>)}</colgroup>
                <thead>
                  <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                    {COLS.map((label, i) => (
                      <th key={label} style={thBase}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agotados.map((p: any, i: number) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <td style={{ ...tdBase, color: 'white', fontWeight: 500 }} title={p.nombre}>{p.nombre}</td>
                      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8', fontFamily: 'monospace' }}>{p.barcode || '—'}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>
                        <span className="text-red-400 font-semibold">{fmtNum(p.inventory)}</span>
                      </td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>
                        {editingStock === p.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <input autoFocus type="number" value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') guardarStockMin(p.id)
                                if (e.key === 'Escape') { setEditingStock(null); setEditVal('') }
                              }}
                              className="w-16 bg-[#0d1220] border border-blue-500 text-white rounded px-1.5 py-0.5 text-xs text-right focus:outline-none"
                              placeholder="0" />
                            <button onClick={() => guardarStockMin(p.id)} className="text-emerald-400 text-xs hover:text-emerald-300">✓</button>
                            <button onClick={() => { setEditingStock(null); setEditVal('') }} className="text-zinc-500 text-xs hover:text-zinc-300">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingStock(p.id); setEditVal(p.stockMinimo != null ? String(p.stockMinimo) : '') }}
                            className="text-zinc-400 hover:text-white transition group" title="Editar stock mínimo">
                            {p.stockMinimo != null
                              ? <span className={p.inventory <= p.stockMinimo ? 'text-orange-400' : 'text-zinc-300'}>{fmtNum(p.stockMinimo)}</span>
                              : <span className="text-zinc-600 group-hover:text-zinc-400">— fijar</span>
                            }
                          </button>
                        )}
                      </td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#fde68a' }}>{fmt(p.precio)}</td>
                      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8' }} title={p.marca}>{p.marca || '—'}</td>
                      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8' }} title={p.linea}>{p.linea || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Sección Stock bajo ─────────────────────────────────────────── */}
      {enAlerta.length > 0 && (
        <div className="rounded-xl border border-orange-500/30 overflow-hidden">
          <div style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}
            className="flex items-center justify-between px-4 py-2.5 cursor-pointer"
            onClick={() => setSecAlertaAbierta(v => !v)}>
            <span className="text-orange-400 font-semibold text-sm">🟠 Stock bajo ({enAlerta.length})</span>
            <span className="text-zinc-500 text-xs">{secAlertaAbierta ? '▲' : '▼'}</span>
          </div>
          {secAlertaAbierta && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth, background: '#0a0f1a' }}>
                <colgroup>{colW.map((w: number,i: number)=><col key={i} style={{width:w+'px'}}/>)}</colgroup>
                <thead>
                  <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                    {COLS.map((label, i) => (
                      <th key={label} style={thBase}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enAlerta.map((p: any, i: number) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <td style={{ ...tdBase, color: 'white', fontWeight: 500 }} title={p.nombre}>{p.nombre}</td>
                      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8', fontFamily: 'monospace' }}>{p.barcode || '—'}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>
                        <span className="text-orange-400 font-semibold">{fmtNum(p.inventory)}</span>
                      </td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>
                        {editingStock === p.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <input autoFocus type="number" value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') guardarStockMin(p.id)
                                if (e.key === 'Escape') { setEditingStock(null); setEditVal('') }
                              }}
                              className="w-16 bg-[#0d1220] border border-blue-500 text-white rounded px-1.5 py-0.5 text-xs text-right focus:outline-none"
                              placeholder="0" />
                            <button onClick={() => guardarStockMin(p.id)} className="text-emerald-400 text-xs hover:text-emerald-300">✓</button>
                            <button onClick={() => { setEditingStock(null); setEditVal('') }} className="text-zinc-500 text-xs hover:text-zinc-300">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingStock(p.id); setEditVal(p.stockMinimo != null ? String(p.stockMinimo) : '') }}
                            className="text-zinc-400 hover:text-white transition group" title="Editar stock mínimo">
                            {p.stockMinimo != null
                              ? <span className={p.inventory <= p.stockMinimo ? 'text-orange-400' : 'text-zinc-300'}>{fmtNum(p.stockMinimo)}</span>
                              : <span className="text-zinc-600 group-hover:text-zinc-400">— fijar</span>
                            }
                          </button>
                        )}
                      </td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#fde68a' }}>{fmt(p.precio)}</td>
                      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8' }} title={p.marca}>{p.marca || '—'}</td>
                      <td style={{ ...tdBase, textAlign: 'center', color: '#94a3b8' }} title={p.linea}>{p.linea || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tabla Inventariables ─────────────────────────────────────── */}
      <div className="rounded-xl border border-emerald-500/20 overflow-hidden">
        <div style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}
          className="flex items-center px-4 py-2.5">
          <span className="text-emerald-400 font-semibold text-sm">🟢 Inventariables ({normales.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth, background: '#0a0f1a' }}>
            <colgroup>
              {colW.map((w: number, i: number) => <col key={i} style={{ width: w + 'px' }} />)}
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
                    'Sin productos — sincroniza primero'
                  </td>
                </tr>
              )}
              {!loading && normales.map((p: any, i: number) => {
                const bgFila = p.inventory <= 0
                  ? 'rgba(239,68,68,0.25)'
                  : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
                return (
                <tr key={p.id} style={{ background: bgFila }}>
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
                          ? <span className={p.inventory <= 0 ? 'text-red-400' : p.stockBajo ? 'text-orange-400' : 'text-zinc-300'}>{fmtNum(p.stockMinimo)}</span>
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
              )})
            }
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
