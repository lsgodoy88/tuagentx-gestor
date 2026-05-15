'use client'
import { SyncIcon } from '@/components/SyncIcon'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
const Cropper = dynamic(() => import('react-cropper'), { ssr: false })
import './cropper.css'



const BORDER: Record<string, string> = {
  pendiente:   'border-l-amber-400',
  alistado:    'border-l-emerald-500',
  en_entrega:  'border-l-blue-500',
  en_transito: 'border-l-zinc-500',
  entregado:   'border-l-zinc-600',
}

const BADGE: Record<string, string> = {
  pendiente:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
  alistado:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  en_entrega:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  en_transito: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  entregado:   'bg-zinc-700/30 text-zinc-300 border-zinc-700/30',
}

const LABEL: Record<string, string> = {
  pendiente: 'Pendiente', alistado: 'Alistado', en_entrega: 'En entrega',
  en_transito: 'En tránsito', entregado: 'Entregado',
}

function formatHora(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function nombreCorto(n: string) {
  const parts = n.trim().split(' ')
  const result = parts.slice(0, 3).join(' ')
  return result.length > 22 ? result.slice(0, 22) + '…' : result
}

function formatFechaCorta(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() - 5*60*60*1000)
  const dd = String(d.getUTCDate()).padStart(2,'0')
  const mm = String(d.getUTCMonth()+1).padStart(2,'0')
  const yy = String(d.getUTCFullYear()).slice(2)
  const h = d.getUTCHours() % 12 || 12
  const min = String(d.getUTCMinutes()).padStart(2,'0')
  const ampm = d.getUTCHours() >= 12 ? 'pm' : 'am'
  return dd+'/'+mm+'/'+yy+' '+h+':'+min+ampm
}

function isHoy(iso: string | null | undefined) {
  if (!iso) return false
  const d = new Date(iso)
  const hoy = new Date()
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate()
}

function tiempoDesdeSync(iso: string | null | undefined): { texto: string; alerta: boolean } {
  if (!iso) return { texto: 'Nunca', alerta: true }
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return { texto: 'Ahora', alerta: false }
  if (mins < 60) return { texto: `${mins}min`, alerta: mins > 30 }
  const h = Math.floor(mins / 60)
  return { texto: `${h}h`, alerta: h >= 2 }
}

export default function OrdenesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [subTab, setSubTab] = useState<'pendientes' | 'alistados' | 'entregados'>('pendientes') // legacy — usar tabActivo
  const [despachos, setDespachos] = useState<any[]>([])
  const [ciudadLocal, setCiudadLocal] = useState<string | null>(null)
  const [bodegaPuedeEnviar, setBodegaPuedeEnviar] = useState(false)
  const [ultimaSync, setUltimaSync] = useState<string | null>(null)
  const [diasHistorial, setDiasHistorial] = useState<number>(() => { if (typeof window === 'undefined') return 10; const v = parseInt(localStorage.getItem('diasHistorialVista') || '10'); return Math.min(30, Math.max(1, v)) })
  const [origenId, setOrigenId] = useState<string>('propia')
  const [empresasOrigen, setEmpresasOrigen] = useState<any[]>([])
  const [repartidores, setRepartidores] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msgSync, setMsgSync] = useState('')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [tabActivo, setTabActivo] = useState<'pendiente'|'alistado'|'despachado'>('pendiente')
  const [cursores, setCursores] = useState<Record<string, string|null>>({ pendiente: null, alistado: null, despachado: null })
  const [hayMasPorTab, setHayMasPorTab] = useState<Record<string, boolean>>({ pendiente: false, alistado: false, despachado: false })
  const [despachosPorTab, setDespachosPorTab] = useState<Record<string, any[]>>({ pendiente: [], alistado: [], despachado: [] })
  const [cargandoMasTab, setCargandoMasTab] = useState(false)
  const [controlFacturas, setControlFacturas] = useState<any[]>([])
  const [toastEnvio, setToastEnvio] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editTransporte, setEditTransporte] = useState<Record<string, { transportadora: string; guia: string }>>({})
  const [editRepartidor, setEditRepartidor] = useState<Record<string, string>>({})
  const [galeria, setGaleria] = useState<{ fotos: string[], index: number, fecha?: string | null, esFirma?: boolean } | null>(null)
  const [galeriaLoading, setGaleriaLoading] = useState(false)

  async function abrirGaleriaConUrls(keys: string[], fecha?: string | null, esFirma = false) {
    setGaleriaLoading(true)
    try {
      const urls = await Promise.all(keys.map(async (key) => {
        if (key.startsWith('data:') || key.startsWith('http') || key.startsWith('/api/')) return key
        const res = await fetch('/api/firma', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firma: key })
        })
        const data = await res.json()
        return data.url || key
      }))
      setGaleria({ fotos: urls, index: 0, fecha, esFirma })
    } finally {
      setGaleriaLoading(false)
    }
  }
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [camaraOrdenId, setCamaraOrdenId] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fotosCapturadas, setFotosCapturadas] = useState<string[]>([])
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const cropperRef = useRef<any>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [soportaZoom, setSoportaZoom] = useState(false)
  const [asignarTodasRepartidor, setAsignarTodasRepartidor] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [ciudadFiltro, setCiudadFiltro] = useState('')
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [modalEnviarMasivo, setModalEnviarMasivo] = useState(false)
  const [busquedaRemota, setBusquedaRemota] = useState<any[]>([])
  const [buscandoRemoto, setBuscandoRemoto] = useState(false)
  const [asignandoTodas, setAsignandoTodas] = useState(false)
  const [modoEnvio, setModoEnvio] = useState<Record<string, 'local' | 'transportadora' | 'personal'>>({})
  const [firmaData, setFirmaData] = useState<Record<string, string>>({})
  const [firmaDibujando, setFirmaDibujando] = useState<Record<string, boolean>>({})
  const firmaCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({})

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  const esAdmin = user?.role === 'empresa' || user?.role === 'supervisor'

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    if (!['empresa', 'supervisor', 'bodega'].includes(user?.role)) { router.push('/dashboard'); return }
    fetch('/api/bodega/empresas-origen').then(r => r.json()).then(lista => {
      setEmpresasOrigen(lista)
      if (lista.length > 0) {
        setOrigenId(lista[0].id)
        cargarDatos(lista[0].id)
      }
    }).catch(() => { cargarDatos('propia') })
    fetch('/api/empleados?rol=entregas')
      .then(r => r.json())
      .then(d => {
        const lista = d.empleados || []
        setRepartidores(lista)
        // Si hay un solo repartidor, preseleccionarlo en todos los alistados de localidad
        if (lista.length === 1) {
          setEditRepartidor(prev => {
            const next = { ...prev }
            // Se aplicará cuando se expanda cada card — usamos un key especial
            next['__default__'] = lista[0].id
            return next
          })
        }
      })
      .catch(() => {})
  }, [status])

  async function cargarTab(tab: 'pendiente'|'alistado'|'despachado', origen?: string, reset = false) {
    const id = origen ?? origenId
    if (reset) {
      setCursores(p => ({ ...p, [tab]: null }))
      setDespachosPorTab(p => ({ ...p, [tab]: [] }))
    }
    if (tab === tabActivo || reset) setCargando(true)
    try {
      const params = new URLSearchParams()
      if (id !== 'propia') params.set('origenId', id)
      params.set('estado', tab)
      if (!reset && cursores[tab]) params.set('cursor', cursores[tab]!)
      if (busqueda) params.set('q', busqueda)
      const data = await fetch(`/api/bodega/despachos?${params}`).then(r => r.json())
      setDespachosPorTab(p => ({ ...p, [tab]: reset ? (data.despachos || []) : [...(p[tab] || []), ...(data.despachos || [])] }))
      setCursores(p => ({ ...p, [tab]: data.nextCursor || null }))
      setHayMasPorTab(p => ({ ...p, [tab]: !!data.hayMas }))
      if (tab === 'despachado' && data.controlFacturas) setControlFacturas(data.controlFacturas)
      setCiudadLocal(data.ciudadLocal || null)
      setBodegaPuedeEnviar(data.bodegaPuedeEnviar ?? false)
      setUltimaSync(data.ultimaSyncBodega || null)
    } finally {
      setCargando(false)
    }
  }

  // Mantener compatibilidad con código existente que llama cargarDatos
  async function cargarDatos(origen?: string) {
    await Promise.all([
      cargarTab('pendiente', origen, true),
      cargarTab('alistado', origen, true),
      cargarTab('despachado', origen, true),
    ])
  }

  async function cargarMasTab() {
    if (cargandoMasTab || !hayMasPorTab[tabActivo]) return
    setCargandoMasTab(true)
    try { await cargarTab(tabActivo) } finally { setCargandoMasTab(false) }
  }

  async function sync() {
    setSyncing(true); setMsgSync('')
    try {
      const body = origenId !== 'propia' ? JSON.stringify({ vinculadaId: origenId }) : '{}'
      const res = await fetch('/api/bodega/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      const data = await res.json()
      if (data.ok) {
        setMsgSync(`✅ ${data.sincronizados} sincronizadas`)
        await cargarDatos(origenId)
      } else {
        setMsgSync(data.error || 'Error al sincronizar')
      }
    } catch { setMsgSync('Error de conexión') }
    finally {
      setSyncing(false)
      setTimeout(() => setMsgSync(''), 4000)
    }
  }

  async function cambiarDias(delta: number) {
    const nuevo = Math.min(30, Math.max(1, diasHistorial + delta))
    setDiasHistorial(nuevo)
    try { localStorage.setItem('diasHistorialVista', String(nuevo)) } catch {}
    // Recargar sin sobreescribir diasHistorial
    setCargando(true)
    const id = origenId
    try {
      const params = new URLSearchParams()
      if (id !== 'propia') params.set('origenId', id)
      params.set('dias', String(nuevo))
      const res = await fetch(`/api/bodega/despachos?${params.toString()}`)
      const data = await res.json()
      setDespachos(data.despachos || [])
      setCiudadLocal(data.ciudadLocal || null)
      setBodegaPuedeEnviar(data.bodegaPuedeEnviar ?? false)
      setUltimaSync(data.ultimaSyncBodega || null)
      // NO tocar diasHistorial aqui
    } finally {
      setCargando(false)
    }
  }
  async function patchOrden(id: string, body: Record<string, unknown>) {
    setSaving(p => ({ ...p, [id]: true }))
    try {
      const res = await fetch(`/api/bodega/despachos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.orden) {
        setDespachos(prev => prev.map(d => d.id === id ? { ...d, ...data.orden } : d))
      }
      if (data.rutaAsignada && data.repartidorNombre) {
        setToastEnvio(`${data.repartidorNombre} ha recibido la orden`)
        setTimeout(() => setToastEnvio(null), 3500)
      }
    } finally {
      setSaving(p => ({ ...p, [id]: false }))
    }
  }

  async function abrirCamara(ordenId: string) {
    setCamaraOrdenId(ordenId)
    setCamaraActiva(true)
    setPreview(null)
    setFotosCapturadas([])
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    streamRef.current = stream
    const track = stream.getVideoTracks()[0]
    trackRef.current = track
    setZoomLevel(1)
    const capabilities = track.getCapabilities() as any
    setSoportaZoom(!!capabilities.zoom)
    if (videoRef.current) videoRef.current.srcObject = stream
  }

  async function aplicarZoom(nivel: number) {
    const track = trackRef.current
    if (!track) return
    const capabilities = track.getCapabilities() as any
    const min = capabilities.zoom?.min ?? 1
    const max = capabilities.zoom?.max ?? 5
    const nuevoZ = Math.min(max, Math.max(min, nivel))
    await track.applyConstraints({ advanced: [{ zoom: nuevoZ } as any] })
    setZoomLevel(nuevoZ)
  }

  function capturarFoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.85)
    setCropSrc(base64)
  }

  async function confirmarRecorte() {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return
    const cropped = cropper.getCroppedCanvas({ maxWidth: 1280, maxHeight: 1280 }).toDataURL('image/jpeg', 0.85)
    setFotosCapturadas(prev => [...prev, cropped])
    setCropSrc(null)
  }

  function descartarRecorte() {
    setCropSrc(null)
  }

  function eliminarFotoCapturada(idx: number) {
    setFotosCapturadas(prev => prev.filter((_, i) => i !== idx))
  }

  async function enviarFotos() {
    if (!fotosCapturadas.length || !camaraOrdenId) return
    streamRef.current?.getTracks().forEach(t => t.stop())
    setSaving(p => ({ ...p, [camaraOrdenId]: true }))
    try {
      for (const foto of fotosCapturadas) {
        const res = await fetch('/api/bodega/foto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ordenId: camaraOrdenId, fotoBase64: foto }),
        }).then(r => r.json())
        if (res.orden) setDespachos(prev => prev.map(d => d.id === camaraOrdenId ? { ...d, ...res.orden } : d))
      }
    } finally {
      setSaving(p => ({ ...p, [camaraOrdenId!]: false }))
      setCamaraActiva(false)
      setCamaraOrdenId(null)
      setPreview(null)
      setFotosCapturadas([])
    }
  }

  function cerrarCamara() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    setCamaraActiva(false)
    setCamaraOrdenId(null)
    setPreview(null)
    setFotosCapturadas([])
  }

  function toggleExpanded(id: string) {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
  }

  async function marcarAlistado(id: string) {
    await patchOrden(id, { estado: 'alistado' })
  }

  async function asignarRepartidor(id: string) {
    const rid = editRepartidor[id]
    if (!rid) return
    await patchOrden(id, { repartidorId: rid, estado: 'en_entrega' })
    setEditRepartidor(p => { const n = { ...p }; delete n[id]; return n })
    setExpanded(p => ({ ...p, [id]: false }))
  }

  async function enviarMasivo(repartidorId: string) {
    if (!seleccionados.length || !repartidorId) return
    setAsignandoTodas(true)
    for (const id of seleccionados) {
      await patchOrden(id, { repartidorId, estado: 'en_entrega' })
    }
    setSeleccionados([])
    setModoSeleccion(false)
    setModalEnviarMasivo(false)
    setAsignandoTodas(false)
  }

  async function asignarTodas() {
    if (!asignarTodasRepartidor) return
    setAsignandoTodas(true)
    const alistadas = despachos.filter(d => d.estado === 'alistado')
    for (const d of alistadas) {
      await patchOrden(d.id, { repartidorId: asignarTodasRepartidor, estado: 'en_entrega' })
    }
    setAsignandoTodas(false)
    setAsignarTodasRepartidor('')
  }

  async function guardarTransporte(id: string) {
    const t = editTransporte[id]
    if (!t) return
    await patchOrden(id, { transportadora: t.transportadora, guiaTransporte: t.guia, estado: 'en_transito' })
    setEditTransporte(p => { const n = { ...p }; delete n[id]; return n })
    setExpanded(p => ({ ...p, [id]: false }))
  }

  // Datos por tab — vienen paginados del servidor
  const pendientes  = despachosPorTab['pendiente']  || []
  const alistados   = despachosPorTab['alistado']   || []
  const despachados = despachosPorTab['despachado'] || []

    const despachosVisibles = useMemo(() => {
      const base = tabActivo === 'pendiente' ? pendientes : tabActivo === 'alistado' ? alistados : despachados
      return base.filter(d => {
        if (!busqueda) return true
        const q = busqueda.toLowerCase()
        return (d.clienteNombre || '').toLowerCase().includes(q) ||
               (d.numeroFactura || '').toLowerCase().includes(q)
      })
    }, [tabActivo, pendientes, alistados, despachados, busqueda])

  async function ejecutarBusqueda() {
    if (!busqueda.trim() || busqueda.length < 1) { setBusquedaRemota([]); return }
    // Siempre buscar en API — ignora el filtro de días, busca toda la BD
    setBuscandoRemoto(true)
    try {
      const res = await fetch(`/api/bodega/buscar?q=${encodeURIComponent(busqueda)}&origenId=${encodeURIComponent(origenId)}`)
      const data = await res.json()
      setBusquedaRemota(data.despachos || [])
    } finally {
      setBuscandoRemoto(false)
    }
  }

  if (status === 'loading' || cargando) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-zinc-400 text-sm">Cargando...</span>
      </div>
    )
  }

  const puedeEnviar = esAdmin || bodegaPuedeEnviar
  const cPendientes   = pendientes.length
  const cAlistados    = alistados.length
  const cEntregadosHoy = despachados.filter(d => d.estado === 'entregado' && isHoy(d.entregadoEl)).length

  const sync_ = tiempoDesdeSync(ultimaSync)

  return (
    <>
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Órdenes</h1>
        <button onClick={sync} disabled={syncing}
          className={`flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors ${syncing ? 'btn-shimmer' : ''}`}>
          <SyncIcon spinning={syncing} className="w-3.5 h-3.5 text-blue-400" />
          {syncing ? '...' : 'Sync'}
        </button>
      </div>

      {/* Selector empresa origen + buscador */}
      <div className="flex gap-2">
        {empresasOrigen.length > 1 && (
          <select
            value={origenId}
            onChange={e => { setOrigenId(e.target.value); cargarDatos(e.target.value); setBusqueda('') }}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm"
            style={{width: '30%'}}>
            {empresasOrigen.map(e => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        )}
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ejecutarBusqueda()}
          placeholder="Cliente u orden..."
          className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500 min-w-0"
          style={{width: '60%'}}
        />
        <button onClick={ejecutarBusqueda}
          className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white rounded-xl text-sm flex-shrink-0"
          style={{width: '10%'}}>
          {buscandoRemoto ? '⏳' : '🔍'}
        </button>
      </div>

      {/* Sub-tabs + toolbar */}
      <div className="space-y-2">
        <div className="flex gap-2">
          {([
            { id: 'pendiente',  label: 'Pendientes',  count: cPendientes,   activeC: 'bg-amber-500 border-amber-500',   inactiveC: 'bg-zinc-800 border-zinc-700 text-amber-400',   badge: 'bg-amber-600/60' },
            { id: 'alistado',   label: 'Alistados',   count: cAlistados,    activeC: 'bg-emerald-600 border-emerald-600', inactiveC: 'bg-zinc-800 border-zinc-700 text-emerald-400', badge: 'bg-emerald-700/60' },
            { id: 'despachado', label: 'Despachados', count: despachados.length, activeC: 'bg-blue-600 border-blue-600', inactiveC: 'bg-zinc-800 border-zinc-700 text-blue-400',    badge: 'bg-blue-700/60' },
          ] as const).map(p => (
            <button key={p.id}
              onClick={() => { setTabActivo(p.id as any); setSubTab(p.id === 'pendiente' ? 'pendientes' : p.id === 'alistado' ? 'alistados' : 'entregados') }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                tabActivo === p.id ? p.activeC + ' text-white' : p.inactiveC + ' hover:bg-zinc-700'
              }`}>
              {p.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${p.badge}`}>{p.count}</span>
            </button>
          ))}
        </div>

        {/* Sync line */}
        <div className="flex items-center gap-2">
          <p className="text-zinc-300 text-xs flex-1">
            {despachos.length} orden{despachos.length !== 1 ? 'es' : ''}
            {' · '}
            <span className={sync_.alerta ? 'text-amber-400' : 'text-zinc-300'}>
              Sync hace {sync_.texto}{sync_.alerta ? ' ⚠️' : ''}
            </span>
          </p>
          {msgSync && <span className="text-xs text-emerald-400">{msgSync}</span>}
        </div>
      </div>

      {/* Filtro ciudad — solo en Alistados */}
      {subTab === 'alistados' && (() => {
        const ciudades = [...new Set(despachos.filter(d => d.estado === 'alistado' && d.ciudad).map(d => d.ciudad as string))].sort()
        if (ciudades.length <= 1) return null
        return (
          <select value={ciudadFiltro} onChange={e => { setCiudadFiltro(e.target.value); setSeleccionados([]) }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm">
            <option value="">🏙️ Todas las ciudades</option>
            {ciudades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )
      })()}
      {despachosVisibles.length === 0 && busquedaRemota.length === 0 && tabActivo !== 'despachado' ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-10 text-center">
          {buscandoRemoto ? <p className="text-zinc-300 text-sm">Buscando...</p> : <p className="text-zinc-300 text-sm">Sin órdenes en el período configurado</p>}
        </div>
      ) : (() => {
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">

            {(despachosVisibles.length > 0 ? despachosVisibles : busquedaRemota).map((d: any) => {
              const ciudadRaw = d.ciudad || null
              const ciudadNombre = ciudadRaw ? ciudadRaw.split('/').pop()?.trim().replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? ciudadRaw : null
              const border = BORDER[d.estado] ?? BORDER.pendiente
              const isSaving = saving[d.id]
              const isExpanded = expanded[d.id]
              const esLocalidad = ciudadLocal && d.ciudad &&
                d.ciudad.split('/').pop()?.trim().toLowerCase() === ciudadLocal.trim().toLowerCase()
              const horaOrden = d.fechaOrden ? formatFechaCorta(d.fechaOrden) : formatFechaCorta(d.createdAt)
              const fotoKey = d.fotoAlistamiento
              const fotos: string[] = (d.fotosAlistamiento as string[] | null) || (fotoKey ? [fotoKey] : [])
              const tieneFotos = fotos.length > 0
              const btnFoto = tieneFotos ? (
                <button
                  onClick={() => abrirGaleriaConUrls(fotos, d.alistadoEl)}
                  className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs">
                  🖼️ {fotos.length > 1 ? fotos.length : ''}
                </button>
              ) : null

              return (
                <div key={d.id}
                  className={`bg-zinc-900 border border-zinc-800 border-l-4 ${border} rounded-2xl overflow-hidden ${modoSeleccion && d.estado === 'alistado' ? 'cursor-pointer' : ''} ${modoSeleccion && seleccionados.includes(d.id) ? 'ring-2 ring-blue-500' : ''}`}
                  onContextMenu={d.estado === 'alistado' ? (e) => { e.preventDefault(); if (!modoSeleccion) { setModoSeleccion(true); setSeleccionados([d.id]) } } : undefined}
                  onTouchStart={d.estado === 'alistado' ? () => { longPressTimer.current = setTimeout(() => { setModoSeleccion(true); setSeleccionados([d.id]) }, 600) } : undefined}
                  onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                  onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                  onClick={modoSeleccion && d.estado === 'alistado' ? () => setSeleccionados(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]) : undefined}>
                  <div className="px-4 py-3 flex items-center gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                      <span className="text-white font-mono text-xs flex-shrink-0">#{d.numeroFactura || d.numeroOrden}</span>
                      <span className="text-zinc-700 flex-shrink-0">·</span>
                      <span className="text-white font-semibold text-sm truncate flex-1">{nombreCorto(d.clienteNombre)}</span>
                      {ciudadNombre && <span className="text-zinc-400 text-xs flex-shrink-0 ml-1">{ciudadNombre}</span>}
                    </div>
                  </div>

                  {d.estado === 'pendiente' && (
                    <div className="px-4 pb-3 pt-1 flex items-center gap-2 border-t border-zinc-800/60">
                      <span className="text-white text-xs flex-shrink-0">{horaOrden}</span>
                      {tieneFotos ? (
                        btnFoto
                      ) : (
                        <button onClick={() => abrirCamara(d.id)} disabled={isSaving}
                          className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                          📷 Foto
                        </button>
                      )}
                      <button onClick={() => marcarAlistado(d.id)} disabled={isSaving || !tieneFotos}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                        {isSaving ? '⏳' : '✓ Listo'}
                      </button>
                    </div>
                  )}

                  {d.estado === 'alistado' && (
                    <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60">
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {btnFoto}
                        <button onClick={() => toggleExpanded(d.id)}
                          className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                          🚚 Enviar {isExpanded ? '▲' : '▼'}
                        </button>
                        {d.alistadoEl && (
                          <span className="text-zinc-300 text-xs">Alistado {formatFechaCorta(d.alistadoEl)}</span>
                        )}
                        {d.alistadoPor && (
                          <span className="text-zinc-300 text-xs">· {d.alistadoPor.nombre}</span>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {/* Selector modo envío */}
                          {(() => {
                            const ciudadOrdenModo = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''
                            const esLocalModo = ciudadLocal ? ciudadOrdenModo === ciudadLocal.trim().toLowerCase() : false
                            const modoActual = modoEnvio[d.id] ?? (esLocalModo ? 'local' : 'transportadora')
                            return (
                              <div className="grid grid-cols-3 gap-1.5">
                                <button onClick={() => setModoEnvio(p => ({ ...p, [d.id]: 'local' }))}
                                  className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${modoActual === 'local' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                                  🏍️ Local
                                </button>
                                <button onClick={() => setModoEnvio(p => ({ ...p, [d.id]: 'transportadora' }))}
                                  className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${modoActual === 'transportadora' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                                  📦 Guía
                                </button>
                                <button onClick={() => setModoEnvio(p => ({ ...p, [d.id]: 'personal' }))}
                                  className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${modoActual === 'personal' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                                  🤝 Personal
                                </button>
                              </div>
                            )
                          })()}

                          {/* Local — una línea */}
                          {(() => { const ciudadOrdenModo2 = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''; const esLocalModo2 = ciudadLocal ? ciudadOrdenModo2 === ciudadLocal.trim().toLowerCase() : false; const modoActual2 = modoEnvio[d.id] ?? (esLocalModo2 ? 'local' : 'transportadora'); return modoActual2 === 'local' })() && (() => {
                            const ciudadOrden = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''
                            const esLocalidad2 = ciudadLocal ? ciudadOrden === ciudadLocal.trim().toLowerCase() : false
                            // Preseleccionar único repartidor si es localidad y no hay selección
                            if (esLocalidad2 && repartidores.length === 1 && !editRepartidor[d.id]) {
                              setTimeout(() => setEditRepartidor(p => ({ ...p, [d.id]: repartidores[0].id })), 0)
                            }
                            return (
                              <div className="space-y-1.5">
                                {!esLocalidad2 && (
                                  <p className="text-amber-400 text-xs font-semibold">
                                    {ciudadLocal ? '⚠️ Ciudad fuera de localidad — usa Guía o Personal' : '⚠️ Configura la ciudad local en Configuración → Despachos'}
                                  </p>
                                )}
                                <div className="flex gap-2 items-center">
                                  <select
                                    value={editRepartidor[d.id] ?? ''}
                                    onChange={e => setEditRepartidor(p => ({ ...p, [d.id]: e.target.value }))}
                                    disabled={!esLocalidad2}
                                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-500 disabled:opacity-40">
                                    <option value="">— Repartidor —</option>
                                    {repartidores.map((r: any) => (
                                      <option key={r.id} value={r.id}>{r.nombre}</option>
                                    ))}
                                  </select>
                                  <button onClick={() => asignarRepartidor(d.id)}
                                    disabled={isSaving || !editRepartidor[d.id] || !esLocalidad2}
                                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold px-3 py-2 rounded-xl text-xs transition-colors flex-shrink-0">
                                    {isSaving ? '...' : '🚀 Enviar'}
                                  </button>
                                </div>
                              </div>
                            )
                          })()}

                          {/* Guía — una línea */}
                          {(() => { const cm = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''; const eloc = ciudadLocal ? cm === ciudadLocal.trim().toLowerCase() : false; return (modoEnvio[d.id] ?? (eloc ? 'local' : 'transportadora')) === 'transportadora' })() && (
                            <div className="space-y-1.5">
                              <div className="flex gap-2 items-center">
                                <input
                                  value={editTransporte[d.id]?.guia ?? ''}
                                  onChange={e => setEditTransporte(p => ({ ...p, [d.id]: { ...p[d.id], guia: e.target.value } }))}
                                  placeholder="# Guía o código de barras"
                                  inputMode="text"
                                  className="flex-1 bg-zinc-800 border border-orange-500/60 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-orange-500"
                                />
                                <button
                                  title="Escanear código de barras"
                                  onClick={() => {
                                    const input = document.createElement('input')
                                    input.type = 'file'
                                    input.accept = 'image/*'
                                    input.capture = 'environment'
                                    input.onchange = async (ev: any) => {
                                      const file = ev.target.files?.[0]
                                      if (!file) return
                                      if ('BarcodeDetector' in window) {
                                        try {
                                          const bitmap = await createImageBitmap(file)
                                          const detector = new (window as any).BarcodeDetector()
                                          const codes = await detector.detect(bitmap)
                                          if (codes[0]?.rawValue) {
                                            setEditTransporte(p => ({ ...p, [d.id]: { ...p[d.id], guia: codes[0].rawValue } }))
                                            return
                                          }
                                        } catch {}
                                      }
                                      // fallback: leer como texto
                                      const reader = new FileReader()
                                      reader.onload = () => {
                                        const val = prompt('No se pudo leer el código. Ingresa manualmente:')
                                        if (val) setEditTransporte(p => ({ ...p, [d.id]: { ...p[d.id], guia: val } }))
                                      }
                                      reader.readAsDataURL(file)
                                    }
                                    input.click()
                                  }}
                                  className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-white px-3 py-2 rounded-xl text-base flex-shrink-0">
                                  ▣
                                </button>
                                <button onClick={() => guardarTransporte(d.id)}
                                  disabled={isSaving || !editTransporte[d.id]?.guia}
                                  className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold px-3 py-2 rounded-xl text-xs transition-colors flex-shrink-0">
                                  {isSaving ? '...' : '📦'}
                                </button>
                              </div>
                              <input
                                value={editTransporte[d.id]?.transportadora ?? ''}
                                onChange={e => setEditTransporte(p => ({ ...p, [d.id]: { ...p[d.id], transportadora: e.target.value } }))}
                                placeholder="Transportadora (opcional)"
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-orange-500"
                              />
                            </div>
                          )}

                          {/* Entrega personal con firma */}
                          {(() => { const cm2 = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''; const eloc2 = ciudadLocal ? cm2 === ciudadLocal.trim().toLowerCase() : false; return (modoEnvio[d.id] ?? (eloc2 ? 'local' : 'transportadora')) === 'personal' })() && (
                            <div className="space-y-2">
                              <p className="text-zinc-300 text-xs font-semibold">Firma del cliente o vendedor</p>
                              <div className="relative bg-white rounded-xl overflow-hidden" style={{height: 120}}>
                                <canvas
                                  ref={el => { firmaCanvasRefs.current[d.id] = el }}
                                  width={400} height={120}
                                  className="w-full h-full touch-none cursor-crosshair"
                                  style={{touchAction: 'none'}}
                                  onPointerDown={e => {
                                    const canvas = firmaCanvasRefs.current[d.id]
                                    if (!canvas) return
                                    setFirmaDibujando(p => ({...p, [d.id]: true}))
                                    const rect = canvas.getBoundingClientRect()
                                    const ctx = canvas.getContext('2d')!
                                    ctx.strokeStyle = '#1a1a1a'
                                    ctx.lineWidth = 2
                                    ctx.lineCap = 'round'
                                    ctx.beginPath()
                                    ctx.moveTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height))
                                    e.currentTarget.setPointerCapture(e.pointerId)
                                  }}
                                  onPointerMove={e => {
                                    if (!firmaDibujando[d.id]) return
                                    const canvas = firmaCanvasRefs.current[d.id]
                                    if (!canvas) return
                                    const rect = canvas.getBoundingClientRect()
                                    const ctx = canvas.getContext('2d')!
                                    ctx.lineTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height))
                                    ctx.stroke()
                                  }}
                                  onPointerUp={e => {
                                    setFirmaDibujando(p => ({...p, [d.id]: false}))
                                    const canvas = firmaCanvasRefs.current[d.id]
                                    if (canvas) setFirmaData(p => ({...p, [d.id]: canvas.toDataURL('image/png')}))
                                  }}
                                />
                                {!firmaData[d.id] && (
                                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-zinc-400 text-xs">Firmar aquí</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => {
                                  const canvas = firmaCanvasRefs.current[d.id]
                                  if (canvas) { const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, canvas.width, canvas.height) }
                                  setFirmaData(p => { const n = {...p}; delete n[d.id]; return n })
                                }} className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs py-2 rounded-xl font-semibold">
                                  🗑 Limpiar
                                </button>
                                <button onClick={() => patchOrden(d.id, { estado: 'entregado', entregadoEl: new Date().toISOString(), firmaBase64: firmaData[d.id] })}
                                  disabled={isSaving || !firmaData[d.id]}
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold py-2 rounded-xl text-xs">
                                  {isSaving ? 'Guardando...' : '✅ Confirmar'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {d.estado === 'en_entrega' && (
                    <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60 flex items-center gap-3 mt-1">
                      {btnFoto}
                      <span className="text-zinc-400 text-xs">🚚 {d.repartidor?.nombre ?? '—'} · {formatHora(d.alistadoEl)}</span>
                    </div>
                  )}

                  {d.estado === 'en_transito' && (
                    <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60 flex items-center gap-3 flex-wrap mt-1">
                      {btnFoto}
                      <span className="text-zinc-300 text-xs">🚛 {d.transportadora} <span className="font-mono text-zinc-300">#{d.guiaTransporte}</span></span>
                    </div>
                  )}

                  {d.estado === 'entregado' && (
                    <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60 mt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-500 text-xs font-semibold">✅ {formatFechaCorta(d.entregadoEl)}</span>
                        {tieneFotos && (
                          <button onClick={() => abrirGaleriaConUrls(fotos, d.entregadoEl)}
                            className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs">
                            🖼️ {fotos.length > 1 ? fotos.length : ''}
                          </button>
                        )}
                        {d.firmaEntrega && (
                          <button onClick={() => abrirGaleriaConUrls([d.firmaEntrega], d.entregadoEl, true)}
                            className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs">
                            ✍️
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}
      {/* Control de consecutivos — solo en tab Despachados */}
      {tabActivo === 'despachado' && controlFacturas.length > 0 && (
        <div className="space-y-1">
          {controlFacturas.map((f: any) => (
            f.despachada ? null : (
              <div key={f.numero} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
                <span className="text-white text-xs font-bold tabular-nums">{f.numero}:</span>
              </div>
            )
          ))}
        </div>
      )}

      {/* Botón cargar más — tabs Pendientes y Alistados */}
      {tabActivo !== 'despachado' && hayMasPorTab[tabActivo] && (
        <button onClick={cargarMasTab} disabled={cargandoMasTab}
          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold py-3 rounded-2xl hover:text-white disabled:opacity-40 transition-colors">
          {cargandoMasTab ? 'Cargando...' : `Cargar más`}
        </button>
      )}

      {/* Barra selección masiva */}
      {modoSeleccion && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-[1050] bg-zinc-950 border-t-2 border-blue-500 px-4 pt-3 pb-6 flex items-center gap-3 shadow-2xl">
          <button onClick={() => { setModoSeleccion(false); setSeleccionados([]) }}
            className="text-white text-sm px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-600 font-semibold">✕</button>
          <button onClick={() => {
            const ids = despachosVisibles.map((d: any) => d.id)
            setSeleccionados(prev => prev.length === ids.length ? [] : ids)
          }} className="text-white text-sm px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-600 font-semibold">
            {seleccionados.length === despachosVisibles.length ? '☑ Todos' : '☐ Todos'}
          </button>
          <span className="text-white text-sm font-semibold flex-1">{seleccionados.length} selec.</span>
          {seleccionados.length > 0 && (
            <button onClick={() => setModalEnviarMasivo(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
              🚚 Enviar {seleccionados.length}
            </button>
          )}
        </div>
      )}
      {/* Modal enviar masivo */}
      {modalEnviarMasivo && (
        <div className="fixed inset-0 z-[990] bg-black/70 flex items-end">
          <div className="w-full bg-zinc-900 border-t border-zinc-700 rounded-t-2xl p-5 space-y-3">
            <p className="text-white font-semibold">Asignar repartidor — {seleccionados.length} orden{seleccionados.length > 1 ? 'es' : ''}</p>
            <select value={asignarTodasRepartidor} onChange={e => setAsignarTodasRepartidor(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm">
              <option value="">— Selecciona repartidor —</option>
              {repartidores.map((r: any) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setModalEnviarMasivo(false)}
                className="flex-1 bg-zinc-800 text-white py-2.5 rounded-xl text-sm">Cancelar</button>
              <button onClick={() => enviarMasivo(asignarTodasRepartidor)} disabled={asignandoTodas || !asignarTodasRepartidor}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold">
                {asignandoTodas ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cámara fullscreen */}
      {camaraActiva && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden touch-none">
          {/* Video fullscreen */}
          <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover w-full" style={{ touchAction: 'pinch-zoom' }} />
          {/* Barra inferior */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent pt-6 pb-8 px-4">
            {/* Miniaturas */}
            {fotosCapturadas.length > 0 && (
              <div className="flex gap-2 mb-4 overflow-x-auto">
                {fotosCapturadas.map((f, i) => (
                  <div key={i} className="relative flex-shrink-0">
                    <img src={f} className="w-14 h-14 object-cover rounded-xl border-2 border-white/60" />
                    <button onClick={() => eliminarFotoCapturada(i)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">✕</button>
                  </div>
                ))}
              </div>
            )}
            {/* Controles principales */}
            <div className="flex items-center justify-between">
              {/* Cancelar */}
              <button onClick={cerrarCamara}
                className="w-16 h-16 rounded-2xl bg-zinc-800/80 border border-zinc-600 text-white text-xs flex flex-col items-center justify-center gap-1">
                <span className="text-lg">✕</span>
                <span>Cancelar</span>
              </button>
              {/* Disparador */}
              <button onClick={capturarFoto}
                className="w-20 h-20 rounded-full bg-white border-4 border-zinc-400 active:scale-95 transition-transform shadow-lg" />
              {/* Enviar o placeholder */}
              {fotosCapturadas.length > 0 ? (
                <button onClick={enviarFotos}
                  className="w-16 h-16 rounded-2xl bg-emerald-500 text-white text-xs flex flex-col items-center justify-center gap-1 font-bold">
                  <span className="text-lg">✓</span>
                  <span>{fotosCapturadas.length} foto{fotosCapturadas.length > 1 ? 's' : ''}</span>
                </button>
              ) : (
                <div className="w-16 h-16" />
              )}
            </div>
            {/* Zoom centrado */}
            {soportaZoom && (
              <div className="flex items-center justify-center gap-3 mt-3">
                <button onClick={() => aplicarZoom(zoomLevel - 0.5)} className="w-8 h-8 rounded-full bg-zinc-700 text-white text-lg flex items-center justify-center">−</button>
                <span className="text-white text-xs w-10 text-center">{zoomLevel.toFixed(1)}x</span>
                <button onClick={() => aplicarZoom(zoomLevel + 0.5)} className="w-8 h-8 rounded-full bg-zinc-700 text-white text-lg flex items-center justify-center">+</button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Modal Cropper */}
      {cropSrc && (
        <div className="fixed inset-0 bg-black z-[1000] flex flex-col">
          <div className="relative flex-1 overflow-hidden">
            <Cropper
              ref={cropperRef}
              src={cropSrc!}
              style={{ height: '100%', width: '100%' }}
              viewMode={1}
              dragMode="move"
              autoCropArea={1}
              restore={false}
              guides={false}
              center={false}
              highlight={false}
              cropBoxMovable={true}
              cropBoxResizable={true}
              toggleDragModeOnDblclick={false}
              background={false}
              responsive={true}
            />
          </div>
          <div className="bg-black px-6 pb-8 pt-4 flex items-center justify-between">
            <button onClick={descartarRecorte}
              className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-600 text-white text-xs flex flex-col items-center justify-center gap-1">
              <span className="text-lg">🗑️</span>
              <span>Descartar</span>
            </button>
            <div className="flex flex-col items-center gap-1">
              <p className="text-zinc-400 text-xs">Ajusta el recorte</p>
              <p className="text-zinc-400 text-[10px]">Pellizca para zoom</p>
            </div>
            <button onClick={confirmarRecorte}
              className="w-16 h-16 rounded-2xl bg-emerald-500 text-white text-xs flex flex-col items-center justify-center gap-1 font-bold">
              <span className="text-lg">✓</span>
              <span>Usar</span>
            </button>
          </div>
        </div>
      )}
      {/* Modal galería fullscreen */}
      {galeriaLoading && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <span className="text-white text-sm">Cargando imagen...</span>
        </div>
      )}
      {galeria && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="text-zinc-400 text-sm">{galeria.esFirma ? '✍️ Firma' : '🖼️ Foto'} {galeria.fotos.length > 1 ? `${galeria.index + 1}/${galeria.fotos.length}` : ''}</span>
              {galeria.fecha && <p className="text-zinc-300 text-xs">{formatFechaCorta(galeria.fecha)}</p>}
            </div>
            <button onClick={() => setGaleria(null)} className="text-white text-2xl">✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center relative overflow-hidden">
            <img src={galeria.fotos[galeria.index]} className="max-w-full max-h-full object-contain" />
            {galeria.index > 0 && (
              <button onClick={() => setGaleria(g => g ? { ...g, index: g.index - 1 } : null)}
                className="absolute left-2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">‹</button>
            )}
            {galeria.index < galeria.fotos.length - 1 && (
              <button onClick={() => setGaleria(g => g ? { ...g, index: g.index + 1 } : null)}
                className="absolute right-2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">›</button>
            )}
          </div>
          {galeria.fotos.length > 1 && (
            <div className="flex gap-2 p-3 overflow-x-auto">
              {galeria.fotos.map((f, i) => (
                <button key={i} onClick={() => setGaleria(g => g ? { ...g, index: i } : null)}
                  className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ${i === galeria.index ? 'border-emerald-500' : 'border-transparent'}`}>
                  <img src={f} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
      {/* Toast confirmación envío a repartidor */}
      {toastEnvio && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 fade-up">
          <span>✓</span> {toastEnvio}
        </div>
      )}
    </>
  )
}
