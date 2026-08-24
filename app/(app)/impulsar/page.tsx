'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
const ModalEvento = dynamic(() => import('@/components/ModalEvento'), { ssr: false })

const numFmt   = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })
const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const fmtP = (n: number | null | undefined) => n == null ? '—' : '$' + priceFmt.format(n)

// ── Tipos ──────────────────────────────────────────────────────────
interface Cliente { id: string; nombre: string; nombreComercial?: string }
interface Producto { id: string; nombre: string; linea?: string; marca?: string }
interface Fila { productoId: string; nombre: string; linea: string; sugerido: string; inventario: string }

const TABS = ['Sugeridos', 'Rotación', 'Eventos'] as const
type Tab = typeof TABS[number]

// ── Componente principal ───────────────────────────────────────────
export default function ImpulsarPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [tab, setTab] = useState<Tab>('Sugeridos')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated' && user?.role !== 'impulsadora') router.push('/inicio')
  }, [status, user?.role])

  if (status !== 'authenticated') return null

  return (
    <div className="space-y-3 max-w-7xl mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tab === t ? 'tab-active' : 'text-white hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>

      <div style={{display: tab === 'Sugeridos' ? 'block' : 'none'}}><TabInventarios user={user} /></div>
      <div style={{display: tab === 'Rotación'   ? 'block' : 'none'}}><TabRotacion user={user} /></div>
      <div style={{display: tab === 'Eventos'    ? 'block' : 'none'}}><TabEventos user={user} /></div>
    </div>
  )
}

// ── Tab Inventarios ────────────────────────────────────────────────
function TabInventarios({ user }: { user: any }) {
  const SS_KEY = 'impulsar_inv'

  // Leer caché al montar
  function leerCache(): { clienteId: string; filas: Record<string, { sugerido: string; inventario: string }> } | null {
    try { const r = sessionStorage.getItem(SS_KEY); return r ? JSON.parse(r) : null } catch { return null }
  }
  function escribirCache(cid: string, f: Record<string, { sugerido: string; inventario: string }>) {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify({ clienteId: cid, filas: f })) } catch {}
  }
  function limpiarCache() {
    try { sessionStorage.removeItem(SS_KEY) } catch {}
  }
  function resetTodo() { setFilas({}); setClienteId(''); limpiarCache() }

  const _c0 = leerCache()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState(_c0?.clienteId ?? '')
  const [productos, setProductos] = useState<Producto[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [linea, setLinea] = useState('')
  const [filtros, setFiltros] = useState<{ marcas: string[]; lineas: string[] }>({ marcas: [], lineas: [] })
  const [filas, setFilas] = useState<Record<string, { sugerido: string; inventario: string }>>(_c0?.filas ?? {})
  const [loadingProds, setLoadingProds] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msgEnvio, setMsgEnvio] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Persistir filas en sessionStorage cuando cambian
  useEffect(() => {
    escribirCache(clienteId, filas)
  }, [filas, clienteId])

  // Cargar clientes de la ruta
  useEffect(() => {
    fetch('/api/impulsar/clientes')
      .then(r => r.json())
      .then(d => {
        setClientes(d.clientes || [])
        // Auto-seleccionar si solo hay uno y no hay caché
        if (d.clientes?.length === 1 && !_c0?.clienteId) setClienteId(d.clientes[0].id)
      })
  }, [])

  const cargarProductos = useCallback(async (pg = 1) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoadingProds(true)
    try {
      const params = new URLSearchParams({ page: String(pg), limit: '50', q, linea })
      const res = await fetch('/api/impulsar/inventario?' + params, { signal: ctrl.signal })
      const data = await res.json()
      setProductos(data.productos || [])
      setTotal(data.total ?? 0)
      setPages(data.pages ?? 1)
      setPage(pg)
      if (pg === 1) setFiltros(data.filtros ?? { marcas: [], lineas: [] })
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
    } finally {
      setLoadingProds(false)
    }
  }, [q, linea])

  useEffect(() => { cargarProductos(1) }, [q, linea])

  function setFila(productoId: string, campo: 'sugerido' | 'inventario', val: string) {
    setFilas(prev => {
      const actual = prev[productoId] || { sugerido: '', inventario: '' }
      const opuesto = campo === 'sugerido' ? 'inventario' : 'sugerido'
      // Si el campo opuesto está vacío y se está poniendo un valor, auto-fill 0
      const opuestoVal = val !== '' && actual[opuesto] === '' ? '0' : actual[opuesto]
      return { ...prev, [productoId]: { ...actual, [campo]: val, [opuesto]: opuestoVal } }
    })
  }

  async function enviar() {
    if (!clienteId) return
    const filasData = Object.entries(filas)
      .filter(([, v]) => v.sugerido || v.inventario)
      .map(([productoId, v]) => ({
        productoId,
        sugerido: v.sugerido ? parseFloat(v.sugerido) : null,
        inventario: v.inventario ? parseFloat(v.inventario) : null,
      }))

    if (filasData.length === 0) {
      setMsgEnvio('No hay datos para enviar')
      return
    }

    setEnviando(true)
    setMsgEnvio('')
    try {
      const res = await fetch('/api/impulsar/inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, filas: filasData })
      })
      const data = await res.json()
      if (data.ok) {
        setMsgEnvio(`✅ ${data.guardados} productos enviados al vendedor`)
        setFilas({})
        limpiarCache()
      } else {
        setMsgEnvio('Error: ' + (data.error || 'desconocido'))
      }
    } catch {
      setMsgEnvio('Error de red')
    } finally {
      setEnviando(false)
    }
  }

  const filasConDatos = Object.values(filas).filter(v => v.sugerido || v.inventario).length
  const clienteNombre = clientes.find(c => c.id === clienteId)?.nombre ?? ''

  const totalSugerido = productos.reduce((acc, p) => {
    const sug = parseFloat(filas[p.id]?.sugerido || '0') || 0
    const precio = (p as any).precio ?? 0
    return acc + sug * precio
  }, 0)

  return (
    <div className="space-y-3">
      {/* Total sugerido */}
      {(totalSugerido > 0 || filasConDatos > 0) && (
        <div className="rounded-xl px-4 py-2.5 flex items-center justify-between" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
          <span className="text-zinc-400 text-xs">Total sugerido</span>
          <div className="flex items-center gap-3">
            <span className="text-blue-400 font-bold text-base">{fmtP(totalSugerido)}</span>
            <button onClick={resetTodo} title="Limpiar todo" style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:16,padding:0,lineHeight:1}} onMouseEnter={e=>(e.currentTarget.style.color='#ef4444')} onMouseLeave={e=>(e.currentTarget.style.color='#6b7280')}>🗑</button>
          </div>
        </div>
      )}

      {/* Selector cliente */}
      <div className="rounded-xl px-4 py-3" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
        <p className="text-zinc-400 text-xs mb-1.5">Cliente</p>
        <select
          value={clienteId}
          onChange={e => setClienteId(e.target.value)}
          className="w-full bg-transparent text-white text-sm outline-none"
        >
          <option value="">— Seleccionar cliente —</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}{c.nombreComercial ? ` · ${c.nombreComercial}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar producto..."
          className="flex-1 min-w-[160px] rounded-xl px-3 py-2 text-white text-sm outline-none"
          style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}
        />
        <select
          value={linea}
          onChange={e => setLinea(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm text-white outline-none"
          style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}
        >
          <option value="">Todas las líneas</option>
          {filtros.lineas.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #131c2e' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 460, background: '#0a0f1a' }}>
            <thead>
              <tr style={{ background: '#0d1220' }}>
                <th style={{ ...thSt, width: 90 }}>Inventario</th>
                <th style={thSt}>Producto</th>
                <th style={thSt}>Línea</th>
                <th style={{ ...thSt, width: 90 }}>Precio</th>
                <th style={{ ...thSt, width: 90 }}>Sugerido</th>
                <th style={{ ...thSt, width: 100 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {loadingProds ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #131c2e' }}>
                    {[1,2,3,4].map(j => (
                      <td key={j} style={tdSt}><div className="shimmer h-5 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : productos.map(p => {
                const fila = filas[p.id] || { sugerido: '', inventario: '' }
                const tieneDato = fila.sugerido || fila.inventario
                return (
                  <tr key={p.id} style={{
                    borderBottom: '1px solid #131c2e',
                    background: tieneDato ? 'rgba(59,130,246,0.06)' : (productos.indexOf(p) % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent')
                  }}>
                    <td style={tdSt}>
                      <input
                        type="text" inputMode="decimal"
                        value={fila.inventario}
                        onChange={e => setFila(p.id, 'inventario', e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="—"
                        className="w-full text-center text-white text-sm bg-transparent outline-none rounded-lg py-1 focus:bg-blue-500/10"
                        style={{ border: '1px solid transparent' }}
                        onFocus={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'}
                        onBlur={e => e.currentTarget.style.borderColor = 'transparent'}
                      />
                    </td>
                    <td style={{ ...tdSt, color: '#e2e8f0', fontWeight: tieneDato ? 600 : 400 }}>{p.nombre}</td>
                    <td style={{ ...tdSt, color: '#94a3b8' }}>{p.linea || '—'}</td>
                    <td style={{ ...tdSt, color: '#64748b', textAlign: 'right' }}>{fmtP((p as any).precio)}</td>
                    <td style={tdSt}>
                      <input
                        type="text" inputMode="decimal"
                        value={fila.sugerido}
                        onChange={e => setFila(p.id, 'sugerido', e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="—"
                        className="w-full text-center text-white text-sm bg-transparent outline-none rounded-lg py-1 focus:bg-blue-500/10"
                        style={{ border: '1px solid transparent' }}
                        onFocus={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'}
                        onBlur={e => e.currentTarget.style.borderColor = 'transparent'}
                      />
                    </td>
                    <td style={{ ...tdSt, color: '#60a5fa', fontWeight: 600, textAlign: 'right', fontSize: 14 }}>
                        {(() => { const s = parseFloat(fila.sugerido||'0')||0; const pr = (p as any).precio??0; return s > 0 && pr > 0 ? fmtP(s*pr) : '—' })()}
                      </td>
                  </tr>
                )
              })}
              {!loadingProds && productos.length === 0 && (
                <tr><td colSpan={4} style={{ ...tdSt, textAlign: 'center', color: '#4b5563' }}>Sin productos</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #131c2e' }}>
            <p className="text-zinc-500 text-xs">{((page-1)*50)+1}-{Math.min(page*50,total)} de {total}</p>
            <div className="flex gap-2">
              <button onClick={() => cargarProductos(page - 1)} disabled={page === 1}
                className="bg-zinc-800 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Ant</button>
              <button onClick={() => cargarProductos(page + 1)} disabled={page >= pages}
                className="bg-zinc-800 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig</button>
            </div>
          </div>
        )}
      </div>

      {/* Footer envío */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
        {filasConDatos > 0 && (
          <p className="text-blue-400 text-sm font-semibold">{filasConDatos} productos con datos</p>
        )}
        {msgEnvio && (
          <p className={`text-sm font-medium ${msgEnvio.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{msgEnvio}</p>
        )}
        <button
          onClick={enviar}
          disabled={enviando || !clienteId || filasConDatos === 0}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl transition-colors"
        >
          {enviando ? 'Enviando...' : clienteId ? `Enviar a vendedor${filasConDatos > 0 ? ` (${filasConDatos})` : ''}` : 'Seleccionar cliente primero'}
        </button>
      </div>
    </div>
  )
}

// ── Tab Rotación (impulsadora) ────────────────────────────────────────
function TabRotacion({ user }: { user: any }) {
  const SS_KEY = 'impulsar_rot'

  function leerCache(): { clienteId: string; filas: Record<string, { cantidad: string; precioVenta: string }> } | null {
    try { const r = sessionStorage.getItem(SS_KEY); return r ? JSON.parse(r) : null } catch { return null }
  }
  function escribirCache(cid: string, f: Record<string, { cantidad: string; precioVenta: string }>) {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify({ clienteId: cid, filas: f })) } catch {}
  }
  function limpiarCache() {
    try { sessionStorage.removeItem(SS_KEY) } catch {}
  }
  function resetTodo() { setFilas({}); setClienteId(''); limpiarCache() }

  const _c0 = leerCache()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState(_c0?.clienteId ?? '')
  const [productos, setProductos] = useState<Producto[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [linea, setLinea] = useState('')
  const [filtros, setFiltros] = useState<{ lineas: string[] }>({ lineas: [] })
  const [filas, setFilas] = useState<Record<string, { cantidad: string; precioVenta: string }>>(_c0?.filas ?? {})
  const [loadingProds, setLoadingProds] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msgEnvio, setMsgEnvio] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    escribirCache(clienteId, filas)
  }, [filas, clienteId])

  useEffect(() => {
    fetch('/api/impulsar/clientes')
      .then(r => r.json())
      .then(d => {
        setClientes(d.clientes || [])
        if (d.clientes?.length === 1 && !_c0?.clienteId) setClienteId(d.clientes[0].id)
      })
  }, [])

  const cargarProductos = useCallback(async (pg = 1) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoadingProds(true)
    try {
      const params = new URLSearchParams({ page: String(pg), limit: '50', q, linea })
      const res = await fetch('/api/impulsar/rotacion?' + params, { signal: ctrl.signal })
      const data = await res.json()
      setProductos(data.productos || [])
      setTotal(data.total ?? 0)
      setPages(data.pages ?? 1)
      setPage(pg)
      if (pg === 1) setFiltros(data.filtros ?? { lineas: [] })
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
    } finally {
      setLoadingProds(false)
    }
  }, [q, linea])

  useEffect(() => { cargarProductos(1) }, [q, linea])

  function setFila(productoId: string, campo: 'cantidad' | 'precioVenta', val: string) {
    setFilas(prev => ({ ...prev, [productoId]: { ...(prev[productoId] || { cantidad: '', precioVenta: '' }), [campo]: val } }))
  }

  async function enviar() {
    if (!clienteId) return
    const filasData = Object.entries(filas)
      .filter(([, v]) => v.cantidad && v.precioVenta)
      .map(([productoId, v]) => ({
        productoId,
        cantidad: parseFloat(v.cantidad),
        precioVenta: parseFloat(v.precioVenta),
      }))
    const filasIncompletas = Object.values(filas).filter(v => (v.cantidad && !v.precioVenta) || (!v.cantidad && v.precioVenta)).length
    if (filasIncompletas > 0) { setMsgEnvio(`${filasIncompletas} producto(s) sin Cant. o Precio V. — completa ambos campos`); return }
    if (filasData.length === 0) { setMsgEnvio('No hay datos para enviar'); return }
    setEnviando(true); setMsgEnvio('')
    try {
      const res = await fetch('/api/impulsar/rotacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, filas: filasData })
      })
      const data = await res.json()
      if (data.ok) { setMsgEnvio(`✅ ${data.guardados} productos enviados al vendedor`); setFilas({}); limpiarCache() }
      else setMsgEnvio('Error: ' + (data.error || 'desconocido'))
    } catch { setMsgEnvio('Error de red') }
    finally { setEnviando(false) }
  }

  const filasConDatos = Object.values(filas).filter(v => v.cantidad && v.precioVenta).length

  const totalGeneral = productos.reduce((acc, p) => {
    const f = filas[p.id]
    const cant = parseFloat(f?.cantidad || '0') || 0
    const pv   = parseFloat(f?.precioVenta || '0') || 0
    return acc + cant * pv
  }, 0)

  return (
    <div className="space-y-3">
      {(totalGeneral > 0 || filasConDatos > 0) && (
        <div className="rounded-xl px-4 py-2.5 flex items-center justify-between" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
          <span className="text-zinc-400 text-xs">Total rotación</span>
          <div className="flex items-center gap-3">
            <span className="text-blue-400 font-bold text-base">{fmtP(totalGeneral)}</span>
            <button onClick={resetTodo} title="Limpiar todo" style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:16,padding:0,lineHeight:1}} onMouseEnter={e=>(e.currentTarget.style.color='#ef4444')} onMouseLeave={e=>(e.currentTarget.style.color='#6b7280')}>🗑</button>
          </div>
        </div>
      )}

      {/* Selector cliente */}
      <div className="rounded-xl px-4 py-3" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
        <p className="text-zinc-400 text-xs mb-1.5">Cliente</p>
        <select value={clienteId} onChange={e => setClienteId(e.target.value)}
          className="w-full bg-transparent text-white text-sm outline-none">
          <option value="">— Seleccionar cliente —</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.nombreComercial ? ` · ${c.nombreComercial}` : ''}</option>)}
        </select>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto..."
          className="flex-1 min-w-[160px] rounded-xl px-3 py-2 text-white text-sm outline-none"
          style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }} />
        <select value={linea} onChange={e => setLinea(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm text-white outline-none"
          style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
          <option value="">Todas las líneas</option>
          {filtros.lineas.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #131c2e' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 400, background: '#0a0f1a' }}>
            <thead>
              <tr style={{ background: '#0d1220' }}>
                <th style={{ ...thSt, width: 90 }}>Cant.</th>
                <th style={thSt}>Producto</th>
                <th style={{ ...thSt, minWidth: 120 }}>Precio V.</th>
                <th style={{ ...thSt, width: 100 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {loadingProds ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #131c2e' }}>
                    {[1,2,3,4].map(j => <td key={j} style={tdSt}><div className="shimmer h-5 rounded" /></td>)}
                  </tr>
                ))
              ) : productos.map(p => {
                const fila = filas[p.id] || { cantidad: '', precioVenta: '' }
                const tieneDato = fila.cantidad || fila.precioVenta
                const cant = parseFloat(fila.cantidad || '0') || 0
                const pv   = parseFloat(fila.precioVenta || '0') || 0
                const tot  = cant > 0 && pv > 0 ? fmtP(cant * pv) : '—'
                return (
                  <tr key={p.id} style={{
                    borderBottom: '1px solid #131c2e',
                    background: tieneDato ? 'rgba(59,130,246,0.06)' : (productos.indexOf(p) % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent')
                  }}>
                    <td style={tdSt}>
                      <input type="text" inputMode="decimal" value={fila.cantidad}
                        onChange={e => setFila(p.id, 'cantidad', e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="—"
                        className="w-full text-center text-white text-sm bg-transparent outline-none rounded-lg py-1 focus:bg-blue-500/10"
                        style={{ border: '1px solid transparent' }}
                        onFocus={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'}
                        onBlur={e => e.currentTarget.style.borderColor = 'transparent'} />
                    </td>
                    <td style={{ ...tdSt, color: '#e2e8f0', fontWeight: tieneDato ? 600 : 400 }}>{p.nombre}</td>
                    <td style={{ ...tdSt, minWidth: 120 }}>
                      <input type="text" inputMode="numeric"
                        value={fila.precioVenta ? '$' + Number(fila.precioVenta).toLocaleString('es-CO') : ''}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '')
                          setFila(p.id, 'precioVenta', raw)
                        }}
                        placeholder="$0"
                        className="w-full text-center text-white text-sm bg-transparent outline-none rounded-lg py-1 focus:bg-blue-500/10"
                        style={{ border: '1px solid transparent' }}
                        onFocus={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'}
                        onBlur={e => e.currentTarget.style.borderColor = 'transparent'} />
                    </td>
                    <td style={{ ...tdSt, color: '#60a5fa', fontWeight: 600, textAlign: 'right', fontSize: 14 }}>{tot}</td>
                  </tr>
                )
              })}
              {!loadingProds && productos.length === 0 && (
                <tr><td colSpan={4} style={{ ...tdSt, textAlign: 'center', color: '#4b5563' }}>Sin productos</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #131c2e' }}>
            <p className="text-zinc-500 text-xs">{((page-1)*50)+1}-{Math.min(page*50,total)} de {total}</p>
            <div className="flex gap-2">
              <button onClick={() => cargarProductos(page - 1)} disabled={page === 1}
                className="bg-zinc-800 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Ant</button>
              <button onClick={() => cargarProductos(page + 1)} disabled={page >= pages}
                className="bg-zinc-800 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig</button>
            </div>
          </div>
        )}
      </div>

      {/* Footer envío */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
        {filasConDatos > 0 && <p className="text-blue-400 text-sm font-semibold">{filasConDatos} productos con datos</p>}
        {msgEnvio && <p className={`text-sm font-medium ${msgEnvio.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{msgEnvio}</p>}
        <button onClick={enviar} disabled={enviando || !clienteId || filasConDatos === 0}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl transition-colors">
          {enviando ? 'Enviando...' : clienteId ? `Enviar a vendedor${filasConDatos > 0 ? ` (${filasConDatos})` : ''}` : 'Seleccionar cliente primero'}
        </button>
      </div>
    </div>
  )
}

// ── Placeholder tabs ───────────────────────────────────────────────
function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="rounded-2xl p-10 flex items-center justify-center" style={{ background: '#0d1220', border: '1px solid #131c2e' }}>
      <p className="text-zinc-500 text-sm">{label} — próximamente</p>
    </div>
  )
}

// ── Estilos estáticos ──────────────────────────────────────────────
const thSt: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, fontWeight: 500, color: '#94a3b8',
  textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #131c2e',
  userSelect: 'none',
}
const tdSt: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, borderBottom: '1px solid #0d1524',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  color: '#94a3b8',
}

// ── Tab Eventos (impulsadora) ────────────────────────────────────────
function TabEventos({ user }: { user: any }) {
  const [eventos, setEventos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({})
  const [visorFotos, setVisorFotos] = useState<{ keys: string[]; idx: number } | null>(null)

  async function cargar() {
    setLoading(true)
    const d = await fetch('/api/impulsar/evento').then(r => r.json())
    setEventos(d.eventos || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function verFoto(key: string) {
    if (fotoUrls[key]) return
    const d = await fetch('/api/impulsar/evento/foto-url?key=' + encodeURIComponent(key)).then(r => r.json())
    setFotoUrls(prev => ({ ...prev, [key]: d.url }))
  }

  function abrirVisor(fotos: string[], idx: number) {
    setVisorFotos({ keys: fotos, idx })
    fotos.forEach(k => verFoto(k))
  }

  const fmtFecha = (f: string) => {
    const iso = f.slice(0, 10)
    const [y, m, d] = iso.split('-')
    return d + '/' + m + '/' + y
  }

  const thEv: React.CSSProperties = {
    padding: '10px 10px', fontSize: 12, fontWeight: 600, color: '#94a3b8',
    whiteSpace: 'nowrap', overflow: 'hidden', borderBottom: '1px solid #1e2a3d',
    background: '#0a1020', userSelect: 'none', textAlign: 'left',
  }
  const tdEv: React.CSSProperties = {
    padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #131c2e',
    borderLeft: '2px solid rgba(255,255,255,0.07)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  }

  return (
    <div className="space-y-3">
      {modal && <ModalEvento onClose={() => setModal(false)} onGuardado={() => { setModal(false); cargar() }} />}

      {visorFotos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setVisorFotos(null)}>
          <div className="relative w-full max-w-lg px-4" onClick={e => e.stopPropagation()}>
            <img src={fotoUrls[visorFotos.keys[visorFotos.idx]] || ''} alt="" className="w-full rounded-2xl object-contain max-h-[80vh]" />
            <div className="flex justify-center gap-2 mt-3">
              {visorFotos.keys.map((_, i) => (
                <button key={i} onClick={() => setVisorFotos(v => v ? { ...v, idx: i } : v)}
                  className={'w-2.5 h-2.5 rounded-full ' + (i === visorFotos.idx ? 'bg-blue-400' : 'bg-zinc-600')} />
              ))}
            </div>
            {visorFotos.keys.length > 1 && (
              <>
                <button onClick={() => setVisorFotos(v => v ? { ...v, idx: (v.idx - 1 + v.keys.length) % v.keys.length } : v)}
                  className="absolute left-6 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded-xl">&#8249;</button>
                <button onClick={() => setVisorFotos(v => v ? { ...v, idx: (v.idx + 1) % v.keys.length } : v)}
                  className="absolute right-6 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded-xl">&#8250;</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-zinc-400 text-xs">Mis eventos registrados</p>
        <button onClick={() => setModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors">
          + Nuevo evento
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><span className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : eventos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-10 text-center">
          <p className="text-zinc-400 text-sm">Sin eventos registrados</p>
          <p className="text-zinc-500 text-xs mt-1">Toca el botón para registrar tu primer evento</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 overflow-hidden" style={{ background: '#0f1623' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 400, background: '#0a0f1a' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e2a3d' }}>
                  {['FECHA', 'CLIENTE', 'CIUDAD', 'TIPO', 'FOTOS'].map(h => (
                    <th key={h} style={{ ...thEv, textAlign: h === 'FOTOS' ? 'center' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventos.map((ev: any, i: number) => (
                  <tr key={ev.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                    <td style={{ ...tdEv, color: 'white' }}>{fmtFecha(ev.fecha)}</td>
                    <td style={{ ...tdEv, color: 'white', fontWeight: 500 }}>{ev.clienteNombre}</td>
                    <td style={{ ...tdEv, color: '#94a3b8', fontSize: 11 }}>{ev.ciudad || '—'}</td>
                    <td style={{ ...tdEv, color: 'white' }}>{ev.tipoEvento}</td>
                    <td style={{ ...tdEv, textAlign: 'center' }}>
                      <button onClick={() => abrirVisor(ev.fotos, 0)}
                        className="flex items-center gap-1 mx-auto text-blue-400 hover:text-blue-300 transition-colors">
                        <span>🖼</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{ev.fotos?.length || 0}</span>
                      </button>
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

