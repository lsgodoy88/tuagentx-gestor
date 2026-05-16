'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { SyncIcon } from '@/components/SyncIcon'

function fmtFecha(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function hoy() { return new Date().toISOString().split('T')[0] }
function hace7() {
  const d = new Date(); d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'alistado', label: 'Alistado' },
  { value: 'despachado', label: 'Despachado' },
  { value: 'en_entrega', label: 'En entrega' },
  { value: 'en_transito', label: 'En tránsito' },
  { value: 'entregado', label: 'Entregado' },
]

const ICONO_ESTADO: Record<string, string> = {
  pendiente: '🟡',
  alistado: '🟢',
  despachado: '🚚',
  en_entrega: '🚚',
  en_transito: '🚛',
  entregado: '✅',
}

const LABEL_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  alistado: 'Alistado',
  despachado: 'Despachado',
  en_entrega: 'En entrega',
  en_transito: 'En tránsito',
  entregado: 'Entregado',
}

const BADGE_ESTADO: Record<string, string> = {
  pendiente: 'bg-zinc-700 text-zinc-400',
  alistado: 'bg-amber-500/15 text-amber-400',
  despachado: 'bg-blue-500/15 text-blue-400',
  en_entrega: 'bg-blue-500/15 text-blue-400',
  en_transito: 'bg-violet-500/15 text-violet-400',
  entregado: 'bg-emerald-500/15 text-emerald-400',
}

export default function TrazabilidadPage() {
  const { data: session } = useSession()
  const user = session?.user as any

  const esVendedor = user?.role === 'vendedor'
  const esBodega = user?.role === 'bodega'
  const [tabPrincipal, setTabPrincipal] = useState<'despachos' | 'inventario'>('despachos')
  const [ordenes, setOrdenes] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string|null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [buscandoProfundo, setBuscandoProfundo] = useState(false)
  const [fuenteBusqueda, setFuenteBusqueda] = useState<string | null>(null)
  const [ordenesBusqueda, setOrdenesBusqueda] = useState<any[] | null>(null)
  const [estado, setEstado] = useState('')
  const [diasHistorial, setDiasHistorial] = useState<number>(() => { if (typeof window === 'undefined') return 10; const v = parseInt(localStorage.getItem('diasHistorialVista') || '10'); return Math.min(30, Math.max(1, v)) })
  // Mantengo desde/hasta como fallback null (no usados activamente)
  const desde = ''
  const hasta = ''

  const [isDesktop, setIsDesktop] = useState(false)
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<any>(null)
  const [fotoModal, setFotoModal] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  function cambiarDias(delta: number) {
    const nuevo = Math.min(30, Math.max(1, diasHistorial + delta))
    setDiasHistorial(nuevo)
    try { localStorage.setItem('diasHistorialVista', String(nuevo)) } catch {}
  }

  async function sincronizar() {
    setSincronizando(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/bodega/sync', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' }).then(r => r.json())
      if (res.error) { setSyncMsg('⚠ ' + res.error); return }
      const n = (res.creadas ?? 0) + (res.actualizadas ?? 0)
      setSyncMsg(`✓ ${res.creadas ?? 0} nuevas, ${res.actualizadas ?? 0} actualizadas`)
      await cargar(null)
      setTimeout(() => setSyncMsg(null), 4000)
    } catch (e: any) {
      setSyncMsg('⚠ Error: ' + (e?.message || 'desconocido'))
    } finally {
      setSincronizando(false)
    }
  }
  const [firmaModal, setFirmaModal] = useState<string | null>(null)

  function toggleExpandido(id: string, orden?: any) {
    if (isDesktop) {
      setOrdenSeleccionada((prev: any) => prev?.id === id ? null : (orden || null))
    } else {
      setExpandido(prev => ({ ...prev, [id]: !prev[id] }))
    }
  }

  async function cargar(cursor: string | null = null) {
    if (!cursor) setLoading(true); else setLoadingMore(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (estado) params.set('estado', estado)
    params.set('cursor', cursor || '')  // fuerza cursor mode en la API
    const res = await fetch('/api/trazabilidad?' + params.toString()).then(r => r.json())
    const nuevas = res.ordenes || []
    setOrdenes(!cursor ? nuevas : prev => [...prev, ...nuevas])
    setNextCursor(res.nextCursor ?? null)
    setHasMore(res.hasMore ?? false)
    setTotal(prev => !cursor ? nuevas.length : prev + nuevas.length)
    if (!cursor) setLoading(false); else setLoadingMore(false)
  }

  useEffect(() => {
    setIsDesktop(window.innerWidth >= 1024)
    const handler = () => setIsDesktop(window.innerWidth >= 1024)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => { cargar(null) }, [q, estado])

  async function buscar() {
    const texto = qInput.trim()
    if (!texto) { setQ(''); setOrdenesBusqueda(null); setFuenteBusqueda(null); return }

    // Capa 1: buscar en memoria (ordenes ya cargadas)
    const enMemoria = ordenes.filter(o =>
      o.numeroOrden?.toLowerCase().includes(texto.toLowerCase()) ||
      o.numeroFactura?.toLowerCase().includes(texto.toLowerCase()) ||
      o.clienteNombre?.toLowerCase().includes(texto.toLowerCase())
    )
    if (enMemoria.length > 0) {
      setOrdenesBusqueda(enMemoria)
      setFuenteBusqueda('memoria')
      return
    }

    // Capa 2 y 3: buscar en BD y SyncDeuda via endpoint
    setBuscandoProfundo(true)
    setOrdenesBusqueda(null)
    try {
      const res = await fetch('/api/trazabilidad/buscar?q=' + encodeURIComponent(texto)).then(r => r.json())
      setOrdenesBusqueda(res.ordenes || [])
      setFuenteBusqueda(res.fuente || 'no_encontrado')
    } finally {
      setBuscandoProfundo(false)
    }
  }

  function limpiarBusqueda() {
    setQInput(''); setOrdenesBusqueda(null); setFuenteBusqueda(null); setQ('')
  }
  function limpiar() { setQ(''); setQInput(''); setEstado(''); setDiasHistorial(7); setOrdenesBusqueda(null); setFuenteBusqueda(null) }

  if (!['empresa', 'supervisor', 'superadmin', 'vendedor', 'bodega', 'entregas'].includes(user?.role)) {
    return <div className="p-8 text-zinc-400">Sin acceso</div>
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Trazabilidad</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          {['empresa','supervisor','superadmin','bodega'].includes(user?.role) && (
            <>
              {syncMsg && <span className="text-xs text-zinc-400 hidden sm:block">{syncMsg}</span>}
              <button
                onClick={sincronizar}
                disabled={sincronizando}
                className={`flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors disabled:opacity-50 ${sincronizando ? 'btn-shimmer' : ''}`}>
                <SyncIcon spinning={sincronizando} className="w-3.5 h-3.5 text-blue-400" />
                {sincronizando ? '...' : 'Sync'}
              </button>
            </>
          )}
        </div>
      </div>
      {syncMsg && <p className="text-xs text-zinc-400 sm:hidden">{syncMsg}</p>}

      {/* Tabs principales */}
      <div className="flex border-b border-zinc-800">
        <button onClick={() => setTabPrincipal('despachos')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'despachos' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
          📦 Despachos
        </button>
        <button onClick={() => setTabPrincipal('inventario')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'inventario' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
          🏭 Inventario
        </button>
      </div>

      {tabPrincipal === 'inventario' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500">
          <p className="text-4xl mb-3">🏭</p>
          <p className="font-semibold text-white">Módulo en construcción</p>
          <p className="text-sm mt-1">Próximamente: control de stock, entradas y salidas</p>
        </div>
      )}

      {tabPrincipal === 'despachos' && (<>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="# orden o cliente..."
            className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none"
          />
          <select value={estado} onChange={e => setEstado(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none">
            {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <button onClick={buscar}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl">
            🔍
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-zinc-400 text-xs whitespace-nowrap px-2 flex-1">
            <span className="text-white font-semibold">{ordenesBusqueda !== null ? ordenesBusqueda.length : total}</span> órdenes
            {fuenteBusqueda === 'memoria' && <span className="text-zinc-500"> · en pantalla</span>}
            {fuenteBusqueda === 'bd' && <span className="text-zinc-500"> · BD</span>}
            {fuenteBusqueda === 'no_encontrado' && <span className="text-zinc-500"> · no encontrada</span>}
          </span>
          {buscandoProfundo && <span className="text-zinc-500 text-xs animate-pulse">Buscando...</span>}
          {ordenesBusqueda !== null && (
            <button onClick={limpiarBusqueda} className="text-zinc-500 hover:text-white text-xs">✕</button>
          )}
          {(q || estado || desde !== hace7() || hasta !== hoy()) && (
            <button onClick={limpiar} className="text-zinc-500 hover:text-white text-xs px-2">Limpiar</button>
          )}
        </div>
      </div>

      {/* Resultados */}
      {loading ? (
        <div className="text-zinc-400 py-12 text-center">Cargando...</div>
      ) : ordenes.length === 0 ? (
        <div className="text-zinc-500 py-12 text-center">Sin resultados en el período</div>
      ) : (
        <div className="flex gap-4 max-w-6xl mx-auto items-start">
          <div className="grid gap-2 flex-1 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
          {(ordenesBusqueda !== null ? ordenesBusqueda : ordenes).map(orden => {
            const fotos: string[] = Array.isArray(orden.fotosAlistamiento) ? orden.fotosAlistamiento : []
            const firma = orden.visitas?.[0]?.firma || orden.firmaEntrega || null
            const repartidorNombre = orden.repartidor?.nombre || null
            const entregadoPor = orden.visitas?.[0]?.empleado?.nombre || null
            const entregadoEl = orden.visitas?.[0]?.createdAt || orden.entregadoEl || null
            const abierto = expandido[orden.id] || false

            const etapas = [
              {
                icon: '📋',
                label: 'Orden',
                fecha: orden.fechaOrden,
                quien: null as string | null,
                accion: null as (() => void) | null,
                accionLabel: '',
              },
              {
                icon: '📦',
                label: 'Alistado',
                fecha: orden.alistadoEl,
                quien: orden.alistadoPor?.nombre || null,
                accion: fotos.length > 0 ? () => setFotoModal(fotos[0]) : null,
                accionLabel: '🖼️',
              },
              {
                icon: '🚚',
                label: 'Despachado',
                fecha: !['pendiente', 'alistado'].includes(orden.estado) ? orden.alistadoEl : null,
                quien: repartidorNombre,
                accion: null,
                accionLabel: '',
              },
              {
                icon: '✅',
                label: 'Entregado',
                fecha: entregadoEl,
                quien: entregadoPor,
                accion: firma && !esVendedor ? () => {
                  if (firma.startsWith('http') || firma.startsWith('data:') || firma.startsWith('/api/')) {
                    setFirmaModal(firma)
                  } else {
                    fetch('/api/firma', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ firma }) })
                      .then(r => r.json()).then(d => setFirmaModal(d.url || firma)).catch(() => setFirmaModal(firma))
                  }
                } : null,
                accionLabel: '✍️',
              },
            ]

            const isSeleccionada = ordenSeleccionada?.id === orden.id
            return (
              <div key={orden.id} className={`bg-zinc-900 rounded-2xl overflow-hidden transition-all ${isSeleccionada ? 'border border-blue-500/60' : 'border border-zinc-800'}`}>
                {/* Header — siempre visible, clickeable */}
                <div onClick={() => toggleExpandido(orden.id, orden)} className="flex items-center gap-2 p-3 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                  <span className="text-zinc-400 font-mono text-xs flex-shrink-0">#{orden.numeroFactura || orden.numeroOrden}</span>
                  {orden.clienteNombre === 'Sin nombre' ? (
                    <span className="text-amber-400 text-xs font-semibold truncate flex-1">⚠️ ERROR DE DATOS</span>
                  ) : (
                    <span className="text-white text-sm font-semibold truncate flex-1">{orden.clienteNombre}</span>
                  )}
                  <span className="text-zinc-400 text-xs flex-shrink-0">{orden.ciudad}</span>
                  <span className="flex-shrink-0">{ICONO_ESTADO[orden.estado] || '⚪'}</span>
                  <span className="text-zinc-500 text-xs flex-shrink-0">{abierto ? '▲' : '▼'}</span>
                </div>

                {/* Timeline — solo si expandido */}
                {abierto && (
                  <div className="px-3 pb-3 border-t border-zinc-800 pt-2 space-y-0.5">
                    {etapas.map((etapa, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5">
                        <span className="text-base flex-shrink-0">{etapa.icon}</span>
                        <span className="text-zinc-400 text-xs w-20 flex-shrink-0">{etapa.label}</span>
                        <span className="text-white text-xs flex-shrink-0">{etapa.fecha ? fmtFecha(etapa.fecha) : '—'}</span>
                        <span className="text-zinc-500 text-xs truncate flex-1">{etapa.quien || ''}</span>
                        {etapa.accion && (
                          <button
                            onClick={e => { e.stopPropagation(); etapa.accion!() }}
                            className="flex-shrink-0 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-0.5 rounded-lg"
                          >
                            {etapa.accionLabel}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          </div>
          {ordenSeleccionada && (() => {
            const orden = ordenSeleccionada
            const fotos: string[] = Array.isArray(orden.fotosAlistamiento) ? orden.fotosAlistamiento : []
            const firma = orden.visitas?.[0]?.firma || orden.firmaEntrega || null
            const repartidorNombre = orden.repartidor?.nombre || null
            const entregadoPor = orden.visitas?.[0]?.empleado?.nombre || null
            const entregadoEl = orden.visitas?.[0]?.createdAt || orden.entregadoEl || null
            const etapas = [
              { icon: '📋', label: 'Orden',      fecha: orden.fechaOrden,  quien: null as string|null,  accion: null as (()=>void)|null },
              { icon: '📦', label: 'Alistado',   fecha: orden.alistadoEl,  quien: orden.alistadoPor?.nombre||null, accion: fotos.length > 0 ? ()=>setFotoModal(fotos[0]) : null },
              { icon: '🚚', label: 'Despachado', fecha: !['pendiente','alistado'].includes(orden.estado) ? orden.alistadoEl : null, quien: repartidorNombre, accion: null },
              { icon: '✅', label: 'Entregado',  fecha: entregadoEl, quien: entregadoPor, accion: firma && !esVendedor ? ()=>setFirmaModal(firma) : null },
            ]
            return (
              <div className="hidden lg:flex flex-col w-80 flex-shrink-0 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden" style={{maxHeight:'calc(100vh - 180px)', position:'sticky', top:16}}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
                  <div>
                    <p className="text-white font-bold text-sm">#{orden.numeroFactura||orden.numeroOrden}</p>
                    <p className="text-zinc-400 text-xs truncate max-w-[200px]">{orden.clienteNombre}</p>
                  </div>
                  <button onClick={()=>setOrdenSeleccionada(null)} className="text-zinc-500 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                  {etapas.map((etapa,i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className="text-xl flex-shrink-0 mt-0.5">{etapa.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">{etapa.label}</p>
                        <p className="text-zinc-400 text-xs">{etapa.fecha ? fmtFecha(etapa.fecha) : '—'}</p>
                        {etapa.quien && <p className="text-zinc-500 text-xs truncate">{etapa.quien}</p>}
                        {etapa.accion && <button onClick={etapa.accion} className="mt-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-0.5 rounded-lg">{i===1?'🖼️ Fotos':'✍️ Firma'}</button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-zinc-800 flex-shrink-0 flex items-center gap-2">
                  <span className="text-zinc-400 text-xs">{orden.ciudad}</span>
                  <span className="text-base">{ICONO_ESTADO[orden.estado]||'⚪'}</span>
                  <span className="text-zinc-400 text-xs capitalize">{orden.estado}</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Botón cargar más — fuera del grid */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button onClick={() => cargar(nextCursor)} disabled={loadingMore}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm font-semibold px-8 py-2.5 rounded-xl border border-zinc-700">
            {loadingMore ? 'Cargando...' : `Cargar más (${total} cargados)`}
          </button>
        </div>
      )}
      </>)}

      {/* Modal foto */}
      {fotoModal && (
        <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4"
          onClick={() => setFotoModal(null)}>
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFotoModal(null)}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg z-10">
              ✕
            </button>
            <img src={fotoModal} alt="Foto alistamiento" className="w-full rounded-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}

      {/* Modal firma */}
      {firmaModal && (
        <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4"
          onClick={() => setFirmaModal(null)}>
          <div className="relative max-w-sm w-full bg-white rounded-2xl p-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFirmaModal(null)}
              className="absolute top-2 right-2 bg-black/20 text-black rounded-full w-7 h-7 flex items-center justify-center text-sm z-10">
              ✕
            </button>
            <p className="text-zinc-600 text-xs font-semibold mb-2 text-center">Firma del cliente</p>
            <img src={firmaModal} alt="Firma cliente" className="w-full object-contain max-h-48" />
          </div>
        </div>
      )}
    </div>
  )
}
