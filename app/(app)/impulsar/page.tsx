'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'

const numFmt   = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })
const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const fmtP = (n: number | null | undefined) => n == null ? '—' : '$' + priceFmt.format(n)

// ── Tipos ──────────────────────────────────────────────────────────
interface Cliente { id: string; nombre: string; nombreComercial?: string }
interface Producto { id: string; nombre: string; linea?: string; marca?: string }
interface Fila { productoId: string; nombre: string; linea: string; sugerido: string; inventario: string }

const TABS = ['Inventarios', 'Rotación', 'Eventos'] as const
type Tab = typeof TABS[number]

// ── Componente principal ───────────────────────────────────────────
export default function ImpulsarPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [tab, setTab] = useState<Tab>('Inventarios')

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

      {tab === 'Inventarios' && <TabInventarios user={user} />}
      {tab === 'Rotación'   && <PlaceholderTab label="Rotación" />}
      {tab === 'Eventos'    && <PlaceholderTab label="Eventos" />}
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
    if (clienteId) escribirCache(clienteId, filas)
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
      {totalSugerido > 0 && (
        <div className="rounded-xl px-4 py-2.5 flex items-center justify-between" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
          <span className="text-zinc-400 text-xs">Total sugerido</span>
          <span className="text-blue-400 font-bold text-base">{fmtP(totalSugerido)}</span>
        </div>
      )}

      {/* Selector cliente */}
      <div className="rounded-xl px-4 py-3" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
        <p className="text-zinc-400 text-xs mb-1.5">Cliente</p>
        <select
          value={clienteId}
          onChange={e => {
            const nuevoId = e.target.value
            if (nuevoId !== clienteId) {
              setFilas({})
              limpiarCache()
            }
            setClienteId(nuevoId)
          }}
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
                    <td style={{ ...tdSt, color: '#60a5fa', fontWeight: 600, textAlign: 'right' }}>
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
  textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #131c2e',
  userSelect: 'none',
}
const tdSt: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, borderBottom: '1px solid #0d1524',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  color: '#94a3b8',
}
