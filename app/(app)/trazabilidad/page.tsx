'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
const StockPage = dynamic(() => import('@/app/(app)/stock/page'), { ssr: false })
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
  pendiente: '🟡',
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

const PAGE_SIZE_TRAZ = 20

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
  const [page, setPage] = useState(0)
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<any>(null)
  const [fotoModal, setFotoModal] = useState<string | null>(null)
  const [fotosGaleria, setFotosGaleria] = useState<string[]>([])
  const [fotoIdx, setFotoIdx] = useState(0)
  const [galeriaFecha, setGaleriaFecha] = useState<string | null>(null)
  async function abrirGaleria(keys: string[], idx = 0, fecha?: string | null) {
    setFotoModal('loading')
    try {
      const urls = await Promise.all(keys.map(async (key) => {
        if (key.startsWith('data:') || key.startsWith('http')) return key
        if (key.startsWith('/fotos/') || key.startsWith('/api/fotos/')) return key.startsWith('/api/fotos/') ? key.replace('/api/fotos/', '/fotos/') : key
        const res = await fetch(`/api/egresos/url?key=${encodeURIComponent(key)}`)
        const d = await res.json()
        return d.url || key
      }))
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
  const [firmaModal, setFirmaModal] = useState<string | null>(null)

  function toggleExpandido(id: string, orden?: any) {
    if (isDesktop) {
      setOrdenSeleccionada(orden || null)
    } else {
      setExpandido(prev => ({ ...prev, [id]: !prev[id] }))
    }
  }

  async function cargar(cursor: string | null = null) {
    if (!cursor) { setLoading(true); setPage(0) } else setLoadingMore(true)
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

  useEffect(() => { cargar(null) }, [q, estado])

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

  const [fechaFiltro, setFechaFiltro] = useState<string>('')

  function limpiarBusqueda() {
    setQInput(''); setOrdenesBusqueda(null); setFuenteBusqueda(null); setQ('')
  }
  function limpiar() { setQ(''); setQInput(''); setEstado(''); setDiasHistorial(7); setOrdenesBusqueda(null); setFuenteBusqueda(null) }

  const sourceOrdenes = (() => {
    const base = ordenesBusqueda !== null ? ordenesBusqueda : ordenes
    if (!fechaFiltro) return base
    return base.filter((o: any) => {
      // Elegir campo según estado activo
      const campo = estado === 'entregado' ? o.entregadoEl
        : (estado === 'alistado') ? o.alistadoEl
        : (estado === 'despachado' || estado === 'en_transito' || estado === 'en_entrega') ? (o.despachadoEl || o.alistadoEl)
        : (o.fechaOrden || o.alistadoEl || o.despachadoEl || o.entregadoEl)
      return campo && campo.slice(0, 10) === fechaFiltro
    })
  })()
  const pagedOrdenes     = sourceOrdenes.slice(page * PAGE_SIZE_TRAZ, (page + 1) * PAGE_SIZE_TRAZ)
  const totalPagesTraz   = Math.max(1, Math.ceil(sourceOrdenes.length / PAGE_SIZE_TRAZ))

  if (!['empresa', 'supervisor', 'superadmin', 'vendedor', 'bodega', 'entregas'].includes(user?.role)) {
    return <div className="p-8 text-zinc-400">Sin acceso</div>
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Tabs + Sync en misma fila */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        <button onClick={() => setTabPrincipal('despachos')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'despachos' ? 'tab-active' : 'text-white hover:text-white'}`}>
          📦 Despachos
        </button>
        <button onClick={() => setTabPrincipal('inventario')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'inventario' ? 'tab-active' : 'text-white hover:text-white'}`}>
          📦 Inventario
        </button>


      </div>

      {tabPrincipal === 'inventario' && <StockPage />}

      {tabPrincipal === 'despachos' && (<>

      {/* Filtros — una sola línea */}
      <div className="flex gap-2 items-center">
        {/* Búsqueda automática ≥3 dígitos */}
        <input
          value={qInput}
          onChange={e => {
            const v = e.target.value
            setQInput(v)
            if (/^\d{3,}$/.test(v.trim())) {
              setQ(v.trim()); buscar(v.trim())
            } else if (v.trim().length >= 3 && !/^\d+$/.test(v.trim())) {
              setQ(v.trim()); buscar(v.trim())
            } else if (v === '') {
              setQ(''); setOrdenesBusqueda(null); setFuenteBusqueda(null)
            }
          }}
          placeholder="# orden o cliente..."
          className={`flex-1 min-w-0 bg-[#0d1220] rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${qInput ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}
        />
        {/* Selector estado */}
        <select value={estado} onChange={e => setEstado(e.target.value)}
          className={`bg-[#0d1220] rounded-lg px-2 py-2 text-white text-sm focus:outline-none flex-shrink-0 ${estado ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}>
          {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        {/* Filtro fecha — número del día, long-press anula */}
        {(() => {
          let longTimer: ReturnType<typeof setTimeout> | null = null
          return (
            <label
              className={`relative flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer select-none ${fechaFiltro ? "border border-amber-500 bg-[#0d1220]" : "border border-[#1e2a3d] bg-[#0d1220]"}`}
              onTouchStart={() => { longTimer = setTimeout(() => { setFechaFiltro(''); longTimer = null }, 600) }}
              onTouchEnd={e => {
                if (longTimer) { clearTimeout(longTimer); longTimer = null; e.preventDefault(); (e.currentTarget.querySelector('input') as HTMLInputElement)?.showPicker?.() }
                else { e.preventDefault() }
              }}
              onTouchMove={() => { if (longTimer) { clearTimeout(longTimer); longTimer = null } }}
              onClick={e => { try { (e.currentTarget.querySelector('input') as HTMLInputElement)?.showPicker?.() } catch {} }}>
              <span className="text-sm font-bold pointer-events-none" style={{color: fechaFiltro ? '#f59e0b' : 'white'}}>
                {fechaFiltro ? new Date(fechaFiltro + 'T12:00:00').getDate() : new Date().getDate()}
              </span>
              <input
                type="date"
                value={fechaFiltro}
                onChange={e => setFechaFiltro(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                style={{WebkitAppearance:'none'}}
              />
            </label>
          )
        })()}
      </div>
      {/* Filtros activos — solo si hay algo que mostrar */}
      {(ordenesBusqueda !== null || buscandoProfundo) && (
        <div className="flex items-center gap-2 px-1">
          {buscandoProfundo && <span className="text-zinc-500 text-xs animate-pulse">Buscando...</span>}
          {ordenesBusqueda !== null && (
            <button onClick={limpiarBusqueda} className="text-zinc-500 hover:text-white text-xs">✕ búsqueda</button>
          )}
        </div>
      )}

      {/* Resultados */}
      {loading ? (
        <div className="text-zinc-400 py-12 text-center">Cargando...</div>
      ) : ordenes.length === 0 ? (
        <div className="text-zinc-500 py-12 text-center">Sin resultados en el período</div>
      ) : (
        <div className="flex gap-4 max-w-6xl mx-auto items-start">
          {isDesktop ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(59,130,246,0.25)' }}>
                <DataTable
                  columns={getOrdenColumns({ setFotoModal, abrirFoto, abrirGaleria, setFirmaModal, esVendedor })}
                  rows={pagedOrdenes}
                  rowKey={(o: any) => o.id}
                  onRowClick={(o: any) => setOrdenSeleccionada(o)}
                  loading={loading}
                  storageKey="trazabilidad-v2"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-2 flex-1 grid-cols-1">
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
                icon: '🧾',
                label: 'Facturado',
                fecha: orden.fechaFactura || null,
                quien: null as string | null,
                accion: null as (() => void) | null,
                accionLabel: '',
              },
              {
                icon: '📦',
                label: 'Alistado',
                fecha: orden.alistadoEl,
                quien: orden.alistadoPor?.nombre || null,
                accion: fotos.length > 0 ? () => abrirGaleria(fotos, 0, orden.alistadoEl) : null,
                accionLabel: '🖼️',
              },
              ...(!orden.guiaTransporte && !orden.repartidorId && orden.estado === 'entregado' ? [] : [{
                icon: orden.guiaTransporte ? '🚛' : '🚚',
                label: orden.guiaTransporte ? 'Transporte' : 'Despacho',
                fecha: !['pendiente', 'alistado'].includes(orden.estado) ? orden.alistadoEl : null,
                quien: [(orden.despachadoPorNombre || null), (orden.num_cajas > 0 && !['pendiente','alistado'].includes(orden.estado)) ? `${orden.num_cajas} caja${orden.num_cajas > 1 ? 's' : ''}` : null].filter(Boolean).join(' · '),
                accion: orden.urlSeguimiento ? () => window.open(orden.urlSeguimiento, '_blank') : null,
                accionLabel: orden.urlSeguimiento ? '🔗' : '',
              }]),
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
              <div key={orden.id} className={`rounded-2xl overflow-hidden transition-all`} style={{background:'#060a24',border:isSeleccionada?'1px solid rgba(59,130,246,0.60)':'1px solid rgba(59,130,246,0.25)',borderRadius:14}}>
                {/* Header — siempre visible, clickeable */}
                <div onClick={() => toggleExpandido(orden.id, orden)} className="flex items-start gap-2 p-3 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5 overflow-hidden">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-white font-mono text-xs flex-shrink-0">F_{orden.numeroFactura || orden.numeroOrden}</span>
                      {orden.clienteNombre === 'Sin nombre' ? (
                        <span className="text-amber-400 text-xs font-semibold truncate flex-1">⚠️ ERROR DE DATOS</span>
                      ) : (
                        <span className="text-white text-sm font-semibold truncate flex-1">{orden.clienteNombre}</span>
                      )}
                      <span className="text-zinc-400 text-xs flex-shrink-0">{orden.ciudad}</span>
                    </div>
                  </div>
                  <span className="flex-shrink-0 mt-0.5 text-xs">
                  {abierto ? '▲' : (
                    <span className="relative inline-flex">
                      {ICONO_ESTADO[orden.estado] || '▼'}
                      {(orden.estado === 'en_transito' || orden.estado === 'despachado') && orden.guiaTransporte && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-zinc-900" />
                      )}
                    </span>
                  )}
                </span>
                </div>

                {/* Timeline — solo si expandido */}
                {abierto && (
                  <div className="px-3 pb-3 border-t border-zinc-800 pt-2 space-y-0.5">
                    {orden.direccion && (
                      <p className="text-zinc-500 text-xs pb-1">{orden.direccion}</p>
                    )}
                    {etapas.map((etapa, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5">
                        <span className="text-base flex-shrink-0">{etapa.icon}</span>
                        <span className="text-zinc-400 text-xs w-[60px] flex-shrink-0">{etapa.label}</span>
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
          )}
        </div>
      )}

      {/* Paginación / Cargar más */}
      {isDesktop ? (
        sourceOrdenes.length > 0 && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,paddingTop:8}}>
            <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
              style={{background:'rgba(8,8,28,0.88)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:'0.75rem',padding:'6px 16px',fontSize:12,fontWeight:700,color:page===0?'rgba(255,255,255,0.25)':'white',cursor:page===0?'not-allowed':'pointer'}}>
              ← Anterior
            </button>
            <span style={{fontSize:12,color:'rgba(255,255,255,0.6)',minWidth:90,textAlign:'center'}}>
              Pág {page + 1} / {totalPagesTraz}{hasMore ? '+' : ''}
            </span>
            <button
              onClick={async () => {
                const nextPage = page + 1
                if (nextPage >= totalPagesTraz && hasMore) await cargar(nextCursor)
                setPage(nextPage)
              }}
              disabled={(page >= totalPagesTraz - 1 && !hasMore) || loadingMore}
              style={{background:'rgba(8,8,28,0.88)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:'0.75rem',padding:'6px 16px',fontSize:12,fontWeight:700,color:(page>=totalPagesTraz-1&&!hasMore)?'rgba(255,255,255,0.25)':'white',cursor:(page>=totalPagesTraz-1&&!hasMore)?'not-allowed':'pointer'}}>
              {loadingMore ? '...' : 'Siguiente →'}
            </button>
            <span style={{fontSize:11,color:'rgba(255,255,255,0.3)',marginLeft:4}}>{sourceOrdenes.length} órdenes</span>
          </div>
        )
      ) : (
        hasMore && (
          <div className="flex justify-center pt-2">
            <button onClick={() => cargar(nextCursor)} disabled={loadingMore}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm font-semibold px-8 py-2.5 rounded-xl border border-zinc-700">
              {loadingMore ? 'Cargando...' : `Cargar más (${total} cargados)`}
            </button>
          </div>
        )
      )}
      </>)}

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
