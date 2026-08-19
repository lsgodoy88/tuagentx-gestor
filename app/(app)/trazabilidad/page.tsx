'use client'
import ModalEscaner from '@/components/ModalEscaner'
const TabDespachados = dynamic(() => import('@/components/TabDespachados'), { ssr: false })
import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
const StockPage = dynamic(() => import('@/app/(app)/stock/page'), { ssr: false })
const TabSugerido = dynamic(() => import('@/components/TabSugerido'), { ssr: false })
import { fechaHoyBogota, haceNDiasBogota } from '@/lib/fechas'
import DataTable, { ColDef } from '@/components/DataTable'
import { useSession } from 'next-auth/react'

function fmtFecha(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota',
  })
}

function hoy() { return fechaHoyBogota() }
function hace7() {
  const d = haceNDiasBogota(7)
  return new Date(d.getTime() - 5*60*60*1000).toISOString().split('T')[0]
}

const ESTADOS = [
  { value: '',            label: 'Todos' },
  { value: 'pendiente',   label: 'Pendiente' },
  { value: 'alistado',    label: 'Alistado' },
  { value: 'despachado',  label: 'Despachado' },
  { value: 'en_entrega',  label: 'Despacho local' },
  { value: 'entregado',   label: 'Entregado' },
]

const COLOR_ESTADO: Record<string, string> = {
  pendiente:   'text-white',
  alistado:    'text-amber-400',
  despachado:  'text-emerald-400',
  en_transito: 'text-emerald-400',
  en_entrega:  'text-teal-400',
  entregado:   'text-blue-400',
}

const ICONO_ESTADO: Record<string, string> = {
  pendiente: '',
  alistado: '🟢',
  despachado: '🚛',
  en_entrega: '🚚',
  en_transito: '🚛',
  entregado: '✅',
}

const LABEL_ESTADO: Record<string, string> = {
  pendiente:   'Pendiente',
  alistado:    'Alistado',
  despachado:  'Despachado',
  en_transito: 'Despachado',
  en_entrega:  'Despacho local',
  entregado:   'Entregado',
}

const BADGE_ESTADO: Record<string, string> = {
  pendiente: 'bg-zinc-700 text-zinc-400',
  alistado: 'bg-amber-500/15 text-amber-400',
  despachado: 'bg-blue-500/15 text-blue-400',
  en_entrega: 'bg-blue-500/15 text-blue-400',
  en_transito: 'bg-blue-500/15 text-blue-400',
  entregado: 'bg-emerald-500/15 text-emerald-400',
}


function getOrdenColumns(ctx: {
  setFotoModal: (url: string | null) => void
  abrirFoto: (key: string) => void
  abrirGaleria?: (keys: string[], idx?: number, fecha?: string | null) => void
  setFirmaModal: (url: string | null) => void
  esVendedor: boolean
}): ColDef<any>[] {
  return [
    {
      key: 'factura', label: 'Factura', width: 58, minWidth: 44,
      render: (o: any) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
          F_{o.numeroFactura || o.numeroOrden}
        </span>
      ),
    },
    {
      key: 'cliente', label: 'Cliente', width: 200, minWidth: 100,
      render: (o: any) => (
        o.clienteNombre === 'Sin nombre'
          ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>⚠️ ERROR DE DATOS</span>
          : <span style={{ textAlign: 'left', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.clienteNombre}</span>
      ),
    },
    {
      key: 'ciudad', label: 'Ciudad', width: 95, minWidth: 60,
      render: (o: any) => <span style={{ color: 'rgba(255,255,255,0.6)' }}>{o.ciudad || '—'}</span>,
    },
    {
      key: 'estado', label: 'EST', width: 32, minWidth: 26,
      render: (o: any) => (
        <span style={{ fontSize: 13, lineHeight: 1 }} title={LABEL_ESTADO[o.estado] || o.estado}>
          <span className={COLOR_ESTADO[o.estado] || 'text-white'}>▼</span>
        </span>
      ),
    },
    {
      key: 'fecha', label: 'Facturado', width: 122, minWidth: 80,
      render: (o: any) => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{o.fechaFactura ? fmtFecha(o.fechaFactura) : o.fechaOrden ? fmtFecha(o.fechaOrden) : '—'}</span>,
    },
    {
      key: 'alistado', label: 'Alistado', width: 130, minWidth: 80,
      render: (o: any) => {
        const fotos: string[] = Array.isArray(o.fotosAlistamiento) ? o.fotosAlistamiento : []
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{o.alistadoEl ? fmtFecha(o.alistadoEl) : '—'}</span>
            {fotos.length > 0 && (
              <button onClick={e => { e.stopPropagation(); ctx.abrirGaleria ? ctx.abrirGaleria(fotos, 0, o.alistadoEl) : ctx.abrirFoto(fotos[0]) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }} title="Fotos">🖼️</button>
            )}
          </div>
        )
      },
    },
    {
      key: 'entrega', label: 'Entrega', width: 130, minWidth: 80,
      render: (o: any) => {
        const entregadoEl = o.visitas?.[0]?.createdAt || o.entregadoEl || null
        const firma = o.visitas?.[0]?.firma || o.firmaEntrega || null
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: entregadoEl ? '#34d399' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>{entregadoEl ? fmtFecha(entregadoEl) : '—'}</span>
            {firma && !ctx.esVendedor && (
              <button onClick={e => {
                e.stopPropagation()
                if (firma.startsWith('http') || firma.startsWith('data:') || firma.startsWith('/api/')) {
                  ctx.setFirmaModal(firma)
                } else {
                  fetch('/api/firma', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ firma }) })
                    .then(r => r.json()).then(d => ctx.setFirmaModal(d.url || firma)).catch(() => ctx.setFirmaModal(firma))
                }
              }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }} title="Firma">✍️</button>
            )}
          </div>
        )
      },
    }
  ]
}

async function resolverUrlR2(key: string): Promise<string> {
  if (!key || key.startsWith('data:') || key.startsWith('http')) return key
  if (key.startsWith('/fotos/') || key.startsWith('/api/fotos/')) return key.replace('/api/fotos/', '/fotos/')
  const res = await fetch(`/api/egresos/url?key=${encodeURIComponent(key)}`)
  const d = await res.json()
  return d.url || key
}

export default function TrazabilidadPage() {
  const { data: session } = useSession()
  const [guiaPopup, setGuiaPopup] = useState<string | null>(null)
  const [escanerOrdenId, setEscanerOrdenId] = useState<string | null>(null)
  const [editGuia, setEditGuia] = useState<Record<string, string>>({})
  const [savingGuia, setSavingGuia] = useState<Record<string, boolean>>({})
  const user = session?.user as any

  const guardarGuia = async (ordenId: string, guia: string, empresaId: string) => {
    setSavingGuia(p => ({ ...p, [ordenId]: true }))
    try {
      const res = await fetch(`/api/bodega/despachos/${ordenId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guiaTransporte: guia || null }),
      })
      const resJson = await res.json()
      const urlSeguimiento = resJson.orden?.urlSeguimiento ?? null
      setOrdenes((prev: any[]) => prev.map((o: any) => o.id === ordenId
        ? { ...o, guiaTransporte: guia || null, urlSeguimiento: urlSeguimiento ?? o.urlSeguimiento }
        : o))
      setGuiaPopup(null)
      setEditGuia(p => { const n = { ...p }; delete n[ordenId]; return n })
    } catch (e) { console.error(e) }
    finally { setSavingGuia(p => ({ ...p, [ordenId]: false })) }
  }

  const esVendedor = user?.role === 'vendedor'
  const esBodega = user?.role === 'bodega'
  const esAdmin = user?.role === 'empresa' || user?.role === 'supervisor'
  const [tabPrincipal, setTabPrincipal] = useState<'despachos' | 'inventario' | 'sugerido'>('despachos')
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
  const [diasHistorial, setDiasHistorial] = useState<number>(() => { if (typeof window === 'undefined') return 15; const v = parseInt(localStorage.getItem('diasHistorialVista') || '15'); return Math.min(90, Math.max(1, v)) })
  // Mantengo desde/hasta como fallback null (no usados activamente)
  const desde = ''
  const hasta = ''

  const [isDesktop, setIsDesktop] = useState(false)
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<any>(null)
  const [fotoModal, setFotoModal] = useState<string | null>(null)
  const [fotosGaleria, setFotosGaleria] = useState<string[]>([])
  const [fotoIdx, setFotoIdx] = useState(0)
  const [galeriaFecha, setGaleriaFecha] = useState<string | null>(null)
  const [firmaModal, setFirmaModal] = useState<string | null>(null)
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  const [ciudadesDespacho, setCiudadesDespacho] = useState<string[]>([])
  const [filtroEnvio, setFiltroEnvio] = useState<'todos'|'local'|'guia'>('todos')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroCiudad, setFiltroCiudad] = useState('')
  const [filtroOrden, setFiltroOrden] = useState<'asc'|'desc'|null>(null)
  const [popupFiltroOpen, setPopupFiltroOpen] = useState(false)
  const inputFechaRefTraz = useRef<HTMLInputElement>(null)
  async function abrirGaleria(keys: string[], idx = 0, fecha?: string | null) {
    setFotoModal('loading')
    try {
      const urls = await Promise.all(keys.map(resolverUrlR2))
      setFotosGaleria(urls)
      setFotoIdx(idx)
      setFotoModal(urls[idx] ?? null)
      setGaleriaFecha(fecha ?? null)
    } catch { setFotoModal(null) }
  }
  async function abrirFoto(key: string) {
    if (!key) return
    if (key.startsWith('data:') || key.startsWith('http')) { setFotoModal(key); return }
    if (key.startsWith('/fotos/') || key.startsWith('/api/fotos/'))
      { setFotoModal(key.replace('/api/fotos/', '/fotos/')); return }
    const r = await fetch(`/api/egresos/url?key=${encodeURIComponent(key)}`)
    const d = await r.json()
    setFotoModal(d.url || key)
  }
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

  function toggleExpandido(id: string, orden?: any) {
    if (isDesktop) {
      setOrdenSeleccionada(orden || null)
    } else {
      setExpandido(prev => ({ ...prev, [id]: !prev[id] }))
    }
  }

  const [fechaFiltro, setFechaFiltro] = useState<string>('')

  async function cargar(cursor: string | null = null, overrideFechaFiltro?: string) {
    if (!cursor) { setLoading(true) } else setLoadingMore(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (estado) params.set('estado', estado)
    const fechaActiva = overrideFechaFiltro !== undefined ? overrideFechaFiltro : fechaFiltro
    if (fechaActiva) {
      params.set('desde', fechaActiva)
      params.set('hasta', fechaActiva)
    } else if (diasHistorial > 0 && !q) {
      params.set('dias', String(diasHistorial))
    }
    params.set('cursor', cursor || '')  // fuerza cursor mode en la API
    const res = await fetch('/api/trazabilidad?' + params.toString()).then(r => r.json())
    const nuevas = res.ordenes || []
    setOrdenes(!cursor ? nuevas : prev => [...prev, ...nuevas])
    setNextCursor(res.nextCursor ?? null)
    setHasMore(res.hasMore ?? false)
    setTotal(prev => !cursor ? nuevas.length : prev + nuevas.length)
    if (!cursor) {
      setLoading(false)
      if (nuevas.length > 0) setOrdenSeleccionada(nuevas[0])
    } else {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    setIsDesktop(window.innerWidth >= 768)
    const handler = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => { cargar(null) }, [q, estado, fechaFiltro, diasHistorial])

  async function buscar(override?: string) {
    const texto = (override ?? qInput).trim()
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

  const sourceOrdenes = ordenesBusqueda !== null ? ordenesBusqueda : ordenes

  if (!['empresa', 'supervisor', 'superadmin', 'vendedor', 'bodega', 'entregas'].includes(user?.role)) {
    return <div className="p-8 text-zinc-400">Sin acceso</div>
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Tabs — ocultas para vendedor */}
      {!esVendedor && (
        <div className="flex gap-1 tab-pills rounded-xl p-1">
          <button onClick={() => setTabPrincipal('despachos')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'despachos' ? 'tab-active' : 'text-white hover:text-white'}`}>
            📦 Despachos
          </button>
          <button onClick={() => setTabPrincipal('inventario')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'inventario' ? 'tab-active' : 'text-white hover:text-white'}`}>
            📦 Inventario
          </button>
          <button onClick={() => setTabPrincipal('sugerido')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'sugerido' ? 'tab-active' : 'text-white hover:text-white'}`}>
            💡 Sugerido
          </button>
        </div>
      )}

      {tabPrincipal === 'inventario' && <StockPage hideChrome />}
      {tabPrincipal === 'sugerido' && <TabSugerido empresaId="propia" />}

      {tabPrincipal === 'despachos' && (
        <div className="space-y-3">
          {/* Barra filtros — igual que bodega */}
          <div className="flex gap-2 items-center min-w-0">
            <input value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)}
              placeholder="Cliente u orden..."
              className={`min-w-0 flex-1 bg-[#0d1220] text-white rounded-lg px-3 py-2 text-sm focus:outline-none ${filtroBusqueda ? 'border border-red-500' : 'border border-[#1e2a3d]'}`} />
            {!esVendedor && (
              <select value={filtroEnvio} onChange={e => setFiltroEnvio(e.target.value as any)}
                className={`flex-shrink-0 w-28 bg-[#0d1220] text-white rounded-lg px-2 py-2 text-sm focus:outline-none ${filtroEnvio !== 'todos' ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}>
                <option value="todos">📍 Envío</option>
                <option value="local">🏠 Local</option>
                <option value="guia">🚛 Guía</option>
              </select>
            )}
            {!esVendedor && (
              <div className="relative flex-shrink-0">
                <button onClick={() => setPopupFiltroOpen(v => !v)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{background:'#0d1220', border: (filtroFecha || filtroOrden !== null || filtroCiudad) ? '1px solid #ef4444' : '1px solid #1e2a3d', color: 'white'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2l-6 6v6l-4-2v-4L4 8V6z"/></svg>
                </button>
                {popupFiltroOpen && (
                  <div className="absolute right-0 top-12 z-50 flex items-center gap-2 px-3 py-2 rounded-xl shadow-xl"
                    style={{background:'#0d1220', border:'1px solid #1e2a3d', minWidth:'max-content'}}>
                    <div className="relative">
                      <button onClick={() => inputFechaRefTraz.current?.showPicker?.()}
                        className="flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm cursor-pointer"
                        style={{background:'#111827', border:'1px solid #1e2a3d', color: filtroFecha ? '#f59e0b' : 'white'}}>
                        {filtroFecha ? new Date(filtroFecha + 'T12:00:00').getDate() : new Date().getDate()}
                      </button>
                      <input type="date" ref={inputFechaRefTraz} value={filtroFecha}
                        onChange={e => { setFiltroFecha(e.target.value); setPopupFiltroOpen(false) }}
                        className="absolute opacity-0 pointer-events-none" style={{top:0,left:0,width:1,height:1}} />
                    </div>
                    <select value={filtroCiudad} onChange={e => setFiltroCiudad(e.target.value)}
                      className="rounded-lg text-xs outline-none cursor-pointer"
                      style={{background:'#111827', border: filtroCiudad ? '1px solid #ef4444' : '1px solid #1e2a3d', color: filtroCiudad ? '#ef4444' : '#9ca3af', padding:'6px 8px', maxWidth:120}}>
                      <option value=''>Ciudad</option>
                      {ciudadesDespacho.map((c: string) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={() => { setFiltroOrden(v => v === null ? 'desc' : null); setPopupFiltroOpen(false) }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                      style={{background:'#111827', border:'1px solid #1e2a3d', opacity: filtroOrden ? 1 : 0.35}}>
                      ⬇️
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <TabDespachados
            rol={esVendedor ? 'vendedor' : 'admin'}
            ciudadLocal={(user as any)?.ciudadEntregaLocal || undefined}
            busquedaExterna={filtroBusqueda}
            onLogsLoaded={(ciudades) => setCiudadesDespacho(ciudades)}
            empresaId={(user as any)?.empresaId || (user as any)?.id || ''}
            filtroEnvio={filtroEnvio}
            filtroFecha={filtroFecha}
            filtroCiudad={filtroCiudad}
            filtroOrden={filtroOrden}
            onGaleriaAbrir={(fotos, fecha) => abrirGaleria(fotos, 0, fecha ?? undefined)}
            onFirmaAbrir={async (url) => { try { setFirmaModal(await resolverUrlR2(url)) } catch { setFirmaModal(url) } }}
          />
        </div>
      )}
      {/* Modal foto */}
      {fotoModal === 'loading' && (
        <div className="fixed inset-0 bg-black z-[1000] flex items-center justify-center">
          <span className="text-white text-sm">Cargando...</span>
        </div>
      )}
      {fotoModal && fotoModal !== 'loading' && (
        <div className="fixed inset-0 bg-black z-[1000] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="text-zinc-400 text-sm">🖼️ Foto{fotosGaleria.length > 1 ? ` ${fotoIdx + 1}/${fotosGaleria.length}` : ''}</span>
              {galeriaFecha && <p className="text-zinc-300 text-xs">{fmtFecha(galeriaFecha)}</p>}
            </div>
            <button onClick={() => { setFotoModal(null); setFotosGaleria([]); setFotoIdx(0); setGaleriaFecha(null) }} className="text-white text-2xl">✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center relative overflow-hidden">
            <img src={fotoModal} alt="Foto alistamiento" className="max-w-full max-h-full object-contain" />
            {fotoIdx > 0 && (
              <button onClick={() => { const i = fotoIdx - 1; setFotoIdx(i); setFotoModal(fotosGaleria[i]) }}
                className="absolute left-2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">‹</button>
            )}
            {fotoIdx < fotosGaleria.length - 1 && (
              <button onClick={() => { const i = fotoIdx + 1; setFotoIdx(i); setFotoModal(fotosGaleria[i]) }}
                className="absolute right-2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">›</button>
            )}
          </div>
          {fotosGaleria.length > 1 && (
            <div className="flex gap-2 p-3 overflow-x-auto">
              {fotosGaleria.map((f, i) => (
                <button key={i} onClick={() => { setFotoIdx(i); setFotoModal(f) }}
                  className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ${i === fotoIdx ? 'border-emerald-500' : 'border-transparent'}`}>
                  <img src={f} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Modal firma */}
      {firmaModal && (
        <div className="fixed inset-0 bg-black/95 z-[1000] flex items-center justify-center p-4"
          onClick={() => setFirmaModal(null)}>
          <div className="relative bg-white rounded-2xl p-5 flex flex-col items-center gap-3"
            style={{ width: '90vw', maxWidth: 400 }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setFirmaModal(null)}
              className="absolute top-2 right-2 bg-black/10 text-black rounded-full w-7 h-7 flex items-center justify-center text-sm z-10">✕</button>
            <p className="text-zinc-500 text-xs font-semibold text-center">Firma del cliente</p>
            <img src={firmaModal} alt="Firma"
              className="w-full object-contain rounded-lg"
              style={{ maxHeight: '60vh' }} />
          </div>
        </div>
      )}
    </div>
  )
}
