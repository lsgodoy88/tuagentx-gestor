'use client'
import ModalEscaner from '@/components/ModalEscaner'
import { SyncIcon } from '@/components/SyncIcon'
import { nowBogota } from '@/lib/fechas'
import FirmaCanvas from '@/components/FirmaCanvas'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useBodegaContext } from '@/lib/bodega-context'
import { useOrdenesData } from '@/hooks/useOrdenesData'
import { useRouter } from 'next/navigation'



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
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${m}${ampm}`
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
  const hoy = nowBogota()
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

export default function ModuloOrdenes() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const { origenId: origenForzado, forzado: esForzado } = useBodegaContext()
  const [origenId, setOrigenId] = useState<string>(origenForzado)
  const [origenSeleccion, setOrigenSeleccion] = useState<string>(origenForzado)
  const [empresasOrigen, setEmpresasOrigen] = useState<any[]>([])
  const [repartidores, setRepartidores] = useState<any[]>([])
  const [diasHistorial, setDiasHistorial] = useState<number>(() => { if (typeof window === 'undefined') return 10; const v = parseInt(localStorage.getItem('diasHistorialVista') || '10'); return Math.min(30, Math.max(1, v)) })
  const [syncing, setSyncing] = useState(false)
  const [msgSync, setMsgSync] = useState('')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [tabActivo, setTabActivo] = useState<'pendiente'|'alistado'|'despachado'>('pendiente')
  function cambiarTab(tab: 'pendiente'|'alistado'|'despachado') {
    setTabActivo(tab)
    setEnvioFiltro('todos')
    setSeleccionados([])
  }

  const {
    despachosPorTab, setDespachosPorTab,
    cargando,
    cursores, hayMasPorTab, cargandoMasTab,
    ciudadLocal, bodegaPuedeEnviar, ultimaSync,
    cargarDatos: cargarDatosHook,
    cargarTab: cargarTabHook,
    cargarMasTab: cargarMasTabHook,
    actualizarOrden, moverOrdenEntreTab,
    limpiarCache,
  } = useOrdenesData(origenForzado)
  const [despachoLog, setDespachoLog] = useState<any[]>([])
  const [logHayMas, setLogHayMas] = useState(false)
  const [logNextCursor, setLogNextCursor] = useState<string|null>(null)
  const [cargandoLogMas, setCargandoLogMas] = useState(false)
  const [toastEnvio, setToastEnvio] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editTransporte, setEditTransporte] = useState<Record<string, { transportadora: string; guia: string }>>({})
  const [editRepartidor, setEditRepartidor] = useState<Record<string, string>>({})
  const [cajasEdit, setCajasEdit] = useState<Record<string, number>>({})
  const [galeria, setGaleria] = useState<{ fotos: string[], index: number, fecha?: string | null, esFirma?: boolean } | null>(null)
  const [galeriaLoading, setGaleriaLoading] = useState(false)

  async function abrirGaleriaConUrls(keys: string[], fecha?: string | null, esFirma = false) {
    setGaleriaLoading(true)
    try {
      const urls = await Promise.all(keys.map(async (key) => {
        // Legacy: fotos guardadas en filesystem público
        if (key.startsWith('data:') || key.startsWith('http')) return key
        if (key.startsWith('/fotos/') || key.startsWith('/api/fotos/'))
          return key.startsWith('/api/fotos/') ? key.replace('/api/fotos/', '/fotos/') : key
        // R2: firmas y fotos con key relativo
        const res = esFirma
          ? await fetch('/api/firma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firma: key }) })
          : await fetch(`/api/egresos/url?key=${encodeURIComponent(key)}`)
        const data = await res.json()
        return data.url || key
      }))
      setGaleria({ fotos: urls, index: 0, fecha, esFirma })
    } finally {
      setGaleriaLoading(false)
    }
  }
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [countdownSec, setCountdownSec] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [camaraOrdenId, setCamaraOrdenId] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fotosCapturadas, setFotosCapturadas] = useState<string[]>([])
  const [anotacionSrc, setAnotacionSrc] = useState<string | null>(null)
  const anotCanvasRef = useRef<HTMLCanvasElement>(null)
  const [anotTool, setAnotTool] = useState<'text' | 'arrow'>('text')
  const [anotColor, setAnotColor] = useState('#FFFFFF')
  const [anotText, setAnotText] = useState('')
  const [anotaciones, setAnotaciones] = useState<any[]>([])
  const [anotArrow, setAnotArrow] = useState<{x1:number,y1:number,x2:number,y2:number}|null>(null)
  const [anotDrawing, setAnotDrawing] = useState(false)
  const [anotStart, setAnotStart] = useState<{x:number,y:number}|null>(null)
  const [anotTextPendiente, setAnotTextPendiente] = useState<string | null>(null)
  const [anotTextPos, setAnotTextPos] = useState<{x:number,y:number} | null>(null)
  const [anotTextDragging, setAnotTextDragging] = useState(false)
  const [anotShowToolbar, setAnotShowToolbar] = useState(false)
  const [cropBox, setCropBox] = useState<{x:number,y:number,w:number,h:number}|null>(null)
  const [cropDragging, setCropDragging] = useState(false)
  const [cropDragStart, setCropDragStart] = useState<{px:number,py:number,bx:number,by:number}|null>(null)
  const [cropResizing, setCropResizing] = useState(false)
  const [cropResizeStart, setCropResizeStart] = useState<{px:number,py:number,bw:number,bh:number}|null>(null)
  const [cropTouched, setCropTouched] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [soportaZoom, setSoportaZoom] = useState(false)
  const [asignarTodasRepartidor, setAsignarTodasRepartidor] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [envioFiltro, setEnvioFiltro] = useState<'todos' | 'local' | 'guia'>('todos')
  const [fechaFiltro, setFechaFiltro] = useState<string>('')
  const [ordenDesc, setOrdenDesc] = useState<'asc'|'desc'|null>(null)
  const [ciudadFiltro, setCiudadFiltro] = useState<string>('')
  const [popupFechaOpen, setPopupFechaOpen] = useState(false)
  const popupFechaRef = useRef<HTMLDivElement>(null)
  const inputFechaRef = useRef<HTMLInputElement>(null)
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [modalEnviarMasivo, setModalEnviarMasivo] = useState(false)
  const [busquedaRemota, setBusquedaRemota] = useState<any[]>([])
  const [buscandoRemoto, setBuscandoRemoto] = useState(false)
  const [asignandoTodas, setAsignandoTodas] = useState(false)
  const [modoEnvio, setModoEnvio] = useState<Record<string, 'local' | 'transportadora' | 'personal'>>({})  
  const [obsEdit, setObsEdit] = useState<Record<string, string>>({})
  const [modalFirmaUrl, setModalFirmaUrl] = useState<string | null>(null)
  const [modalObsTexto, setModalObsTexto] = useState<string | null>(null)
  const [obsPopup, setObsPopup] = useState<string | null>(null)
  const [guiaPopup, setGuiaPopup] = useState<string | null>(null)
  const [obsPopupLog, setObsPopupLog] = useState<string | null>(null)
  const [guiaEditando, setGuiaEditando] = useState<string | null>(null)
  const [firmaData, setFirmaData] = useState<Record<string, string>>({})
  const [escanerOrdenId, setEscanerOrdenId] = useState<string | null>(null)
  const [escanerLogId, setEscanerLogId] = useState<string | null>(null)
  const [firmaDibujando, setFirmaDibujando] = useState<Record<string, boolean>>({})
  const firmaCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({})

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  const esAdmin = user?.role === 'empresa' || user?.role === 'supervisor'

  // Bloquear botón físico atrás del móvil cuando la cámara está abierta
  useEffect(() => {
    if (!camaraActiva) return
    const t = setTimeout(() => {
      const video = videoRef.current
      if (!video) return
      const container = video.parentElement
      if (!container) return
      const vw = container.offsetWidth
      const vh = container.offsetHeight
      if (vw > 0 && vh > 0) {
        const w = Math.round(vw * 0.4), h = Math.round(vh * 0.4)
        setCropBox({ x: Math.round((vw-w)/2), y: Math.round((vh-h)/2), w, h })
      }
    }, 800)
    return () => clearTimeout(t)
  }, [camaraActiva])

  useEffect(() => {
    if (!popupFechaOpen) return
    function handleClick(e: Event) {
      if (popupFechaRef.current && !popupFechaRef.current.contains(e.target as Node)) {
        setPopupFechaOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('touchstart', handleClick) }
  }, [popupFechaOpen])

  useEffect(() => {
    if (!camaraActiva) return
    const bloquear = (e: PopStateEvent) => {
      e.preventDefault()
      // Re-push para mantener el estado actual
      window.history.pushState(null, '', window.location.href)
    }
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', bloquear)
    return () => window.removeEventListener('popstate', bloquear)
  }, [camaraActiva])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    if (!['empresa', 'supervisor', 'bodega'].includes(user?.role)) { router.push('/inicio'); return }
    if (origenForzado && origenForzado !== 'propia') {
      // Viene de /bodega/[slug] — usar empresa forzada, no cargar selector
      cargarDatos(origenForzado)
    } else {
      fetch('/api/bodega/empresas-origen').then(r => r.json()).then(lista => {
        setEmpresasOrigen(lista)
        if (lista.length > 0) {
          setOrigenId(lista[0].id)
          setOrigenSeleccion(lista[0].id)
          cargarDatos(lista[0].id)
        }
      }).catch(() => { setOrigenSeleccion('propia'); cargarDatos('propia') })
    }
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
    limpiarCache()
  }, [status, origenForzado])

  async function cargarTab(tab: 'pendiente'|'alistado'|'despachado', origen?: string, reset = false) {
    await cargarTabHook(tab, origen ?? origenId, reset, busqueda, cursores)
  }

  async function cargarDatos(origen?: string) {
    await cargarDatosHook(origen ?? origenId, busqueda)
    cargarDespachoLog(true, origen)
  }

  async function cargarDespachoLog(reset = false, origen?: string) {
    const id = origen ?? origenId
    const params = new URLSearchParams()
    if (id !== 'propia') params.set('origenId', id)
    if (!reset && logNextCursor) params.set('cursor', logNextCursor)
    const data = await fetch(`/api/bodega/despacho-log?${params}`).then(r => r.json())
    setDespachoLog(prev => reset ? (data.data || []) : [...prev, ...(data.data || [])])
    setLogNextCursor(data.nextCursor || null)
    setLogHayMas(!!data.hayMas)
  }

  async function cargarMasDespacholog() {
    if (cargandoLogMas || !logHayMas) return
    setCargandoLogMas(true)
    try { await cargarDespachoLog(false) } finally { setCargandoLogMas(false) }
  }

  async function cargarMasTab() {
    await cargarMasTabHook(tabActivo, origenId, busqueda)
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
    await cargarDatos(origenId)
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
        const ordenActualizada = data.orden
        actualizarOrden(id, ordenActualizada)
        const estadoFinal = ordenActualizada.estado
        const esDespachada = ['en_entrega','en_transito','entregado'].includes(estadoFinal)
        const esAlistada = estadoFinal === 'alistado'
        setDespachosPorTab(prev => {
          const next = { ...prev }
          for (const tab of Object.keys(next) as Array<'pendiente'|'alistado'|'despachado'>) {
            if (esDespachada && tab !== 'despachado') {
              next[tab] = next[tab].filter((d: any) => d.id !== id)
            } else if (esDespachada && tab === 'despachado') {
              const yaExiste = next[tab].some((d: any) => d.id === id)
              if (yaExiste) {
                next[tab] = next[tab].map((d: any) => d.id === id ? { ...d, ...ordenActualizada } : d)
              } else {
                next[tab] = [{ ...ordenActualizada }, ...next[tab]]
              }
            } else if (esAlistada && tab === 'pendiente') {
              next[tab] = next[tab].filter((d: any) => d.id !== id)
            } else if (esAlistada && tab === 'alistado') {
              const yaExiste = next[tab].some((d: any) => d.id === id)
              if (yaExiste) {
                next[tab] = next[tab].map((d: any) => d.id === id ? { ...d, ...ordenActualizada } : d)
              } else {
                next[tab] = [...next[tab], { ...ordenActualizada }]
              }
            } else {
              next[tab] = next[tab].map((d: any) => d.id === id ? { ...d, ...ordenActualizada } : d)
            }
          }
          return next
        })
        // Promise chain: primero recargar log completo (JOIN), luego navegar
        if (esDespachada) {
          cargarDespachoLog(true).then(() => setTabActivo('despachado'))
        } else if (esAlistada) {
          setTabActivo('alistado')
        }
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
    setCropTouched(false)

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    streamRef.current = stream
    const track = stream.getVideoTracks()[0]
    trackRef.current = track
    setZoomLevel(1)
    const capabilities = track.getCapabilities() as any
    setSoportaZoom(!!capabilities.zoom)
    if (videoRef.current) {
      videoRef.current.srcObject = stream

    }
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
    if (cropBox && video.offsetWidth > 0) {
      const scaleX = video.videoWidth / video.offsetWidth
      const scaleY = video.videoHeight / video.offsetHeight
      const sx = cropBox.x * scaleX, sy = cropBox.y * scaleY
      const sw = cropBox.w * scaleX, sh = cropBox.h * scaleY
      canvas.width = sw; canvas.height = sh
      canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
    } else {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      canvas.getContext('2d')!.drawImage(video, 0, 0)
    }
    const base64 = canvas.toDataURL('image/jpeg', 0.85)
    setAnotaciones([]); setAnotArrow(null); setAnotText(''); setAnotShowToolbar(false)
    setAnotTextPendiente(null); setAnotTextPos(null)
    streamRef.current?.getTracks().forEach(t => { t.enabled = false })
    setCamaraActiva(false)
    setAnotacionSrc(base64)
  }

  function confirmarAnotacion() {
    const canvas = anotCanvasRef.current
    if (!canvas) return
    setFotosCapturadas(prev => [...prev, canvas.toDataURL('image/jpeg', 0.9)])
    setAnotacionSrc(null)
    // Reactivar stream y cámara para más fotos
    streamRef.current?.getTracks().forEach(t => { t.enabled = true })
    setCamaraActiva(true)
    setCropTouched(false)
  }
  function descartarAnotacion() {
    // Reactivar stream — usuario puede retomar
    streamRef.current?.getTracks().forEach(t => { t.enabled = true })
    setAnotacionSrc(null)
    setCamaraActiva(true)
    setCropTouched(false)
  }
  function dibujarAnotaciones(canvas: HTMLCanvasElement, imgSrc: string, items: any[], arrow: any) {
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      ctx.drawImage(img, 0, 0)
      const rect = canvas.getBoundingClientRect()
      const displayW = rect.width || canvas.offsetWidth || img.naturalWidth
      const displayH = rect.height || canvas.offsetHeight || img.naturalHeight
      const sx = img.naturalWidth / displayW
      const sy = img.naturalHeight / displayH
      items.forEach((a: any) => {
        if (a.type === 'text') {
          ctx.font = `bold ${Math.round(28*sx)}px sans-serif`
          ctx.fillStyle = a.color; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4*sx
          ctx.strokeText(a.text, a.x*sx, a.y*sy); ctx.fillText(a.text, a.x*sx, a.y*sy)
        }
        if (a.type === 'arrow') {
          const [x1,y1,x2,y2]=[a.x1*sx,a.y1*sy,a.x2*sx,a.y2*sy]
          const angle=Math.atan2(y2-y1,x2-x1), hw=18*sx
          ctx.strokeStyle=a.color; ctx.fillStyle=a.color; ctx.lineWidth=5*sx; ctx.lineCap='round'
          ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x2,y2)
          ctx.lineTo(x2-hw*Math.cos(angle-0.4),y2-hw*Math.sin(angle-0.4))
          ctx.lineTo(x2-hw*Math.cos(angle+0.4),y2-hw*Math.sin(angle+0.4))
          ctx.closePath(); ctx.fill()
        }
      })
      if (arrow) {
        const {x1,y1,x2,y2}=arrow
        const [ax1,ay1,ax2,ay2]=[x1*sx,y1*sy,x2*sx,y2*sy]
        const angle=Math.atan2(ay2-ay1,ax2-ax1), hw=18*sx
        ctx.strokeStyle='#FFFF00'; ctx.fillStyle='#FFFF00'; ctx.lineWidth=5*sx; ctx.lineCap='round'
        ctx.beginPath(); ctx.moveTo(ax1,ay1); ctx.lineTo(ax2,ay2); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(ax2,ay2)
        ctx.lineTo(ax2-hw*Math.cos(angle-0.4),ay2-hw*Math.sin(angle-0.4))
        ctx.lineTo(ax2-hw*Math.cos(angle+0.4),ay2-hw*Math.sin(angle+0.4))
        ctx.closePath(); ctx.fill()
      }
    }
    img.src = imgSrc
  }

  function eliminarFotoCapturada(idx: number) {
    setFotosCapturadas(prev => prev.filter((_, i) => i !== idx))
  }

  async function enviarFotos() {
    if (!fotosCapturadas.length || !camaraOrdenId) return
    // Detener stream — la cámara ya no se necesita
    streamRef.current?.getTracks().forEach(t => t.stop())
    const ordenId = camaraOrdenId
    setSaving(p => ({ ...p, [ordenId]: true }))
    try {
      for (const foto of fotosCapturadas) {
        const res = await fetch('/api/bodega/foto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ordenId, fotoBase64: foto }),
        }).then(r => r.json())
        if (res.orden) {
          actualizarOrden(ordenId, res.orden)
          setDespachosPorTab(prev => {
            const next = { ...prev }
            for (const tab of Object.keys(next)) {
              next[tab] = next[tab].map((d: any) => d.id === ordenId ? { ...d, ...res.orden } : d)
            }
            return next
          })
        }
      }
    } finally {
      setSaving(p => ({ ...p, [ordenId]: false }))
      // NO limpiar fotosCapturadas aquí — las necesita el countdown para mostrarlas
    }
    // Fotos subidas — iniciar countdown para alistar automáticamente
    setCountdownSec(2)
    countdownRef.current = setInterval(() => {
      setCountdownSec(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current!)
          countdownRef.current = null
          // Alistar y cerrar
          marcarAlistado(ordenId).then(() => {
            setCamaraActiva(false)
            setCamaraOrdenId(null)
            setCountdownSec(null)
            setFotosCapturadas([])
          })
          return null
        }
        return prev - 1
      })
    }, 1000)
  }

  function cancelarCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setCountdownSec(null)
    setCamaraActiva(false)
    setPreview(null)
    // Revertir fotos en BD
    const ordenId = camaraOrdenId
    setCamaraOrdenId(null)
    setFotosCapturadas([])
    if (ordenId) {
      fetch(`/api/bodega/despachos/${ordenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearFotos: true }),
      }).then(r => r.json()).then(data => {
        if (data.orden) {
          setDespachosPorTab(prev => {
            const next = { ...prev }
            for (const tab of Object.keys(next)) {
              next[tab] = next[tab].map((d: any) => d.id === ordenId ? { ...d, ...data.orden } : d)
            }
            return next
          })
        }
      }).catch(() => {})
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
    return patchOrden(id, { estado: 'alistado' })
  }

  async function asignarRepartidor(id: string) {
    const rid = editRepartidor[id]
    if (!rid) return
    const cajasLocal = cajasEdit[id] ?? 0
    await patchOrden(id, { repartidorId: rid, estado: 'en_entrega', observacion: obsEdit[id] || null, num_cajas: cajasLocal })
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
    const alistadas = (despachosPorTab['alistado'] || [])
    for (const d of alistadas) {
      await patchOrden(d.id, { repartidorId: asignarTodasRepartidor, estado: 'en_entrega' })
    }
    setAsignandoTodas(false)
    setAsignarTodasRepartidor('')
  }

  async function guardarTransporte(id: string) {
    const t = editTransporte[id]
    const cajas = cajasEdit[id] ?? 0
    const obs = obsEdit[id] || null
    if (cajas <= 0 && !obs) return
    await patchOrden(id, {
      transportadora: t?.transportadora,
      guiaTransporte: t?.guia || null,
      num_cajas: cajas,
      estado: 'en_transito',
      observacion: obsEdit[id] || null
    })
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
        if (envioFiltro !== 'todos') {
          const esLocal = ciudadLocal && d.ciudad &&
            d.ciudad.split('/').pop()?.trim().toLowerCase() === ciudadLocal?.trim().toLowerCase()
          if (envioFiltro === 'local' && !esLocal) return false
          if (envioFiltro === 'guia' && esLocal) return false
        }
        if (!busqueda) return true
        const q = busqueda.toLowerCase()
        return (d.clienteNombre || '').toLowerCase().includes(q) ||
               (d.numeroFactura || '').toLowerCase().includes(q)
      })
    }, [tabActivo, pendientes, alistados, despachados, busqueda, envioFiltro, ciudadLocal])

  async function syncOrdenes() {
    limpiarCache()
    setSyncing(true); setMsgSync('')
    try {
      const res = await fetch('/api/sync/delta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      const nuevas = data.resultados?.reduce((s: number, r: any) => s + (r.nuevasOrdenes || 0), 0) || 0
      setMsgSync(`✅ ${nuevas} nueva${nuevas !== 1 ? 's' : ''}`)
      await cargarDatos()
    } catch { setMsgSync('❌ Error') }
    finally {
      setSyncing(false)
      setTimeout(() => setMsgSync(''), 5000)
    }
  }

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

  if (cargando) {
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


      {/* Selector empresa origen + buscador */}
      <div className="flex gap-2" style={{width: '100%'}}>
        {empresasOrigen.length > 1 && !esForzado && (
          <>
            <select
              value={origenSeleccion}
              onChange={e => setOrigenSeleccion(e.target.value)}
              className="rounded-xl px-3 py-2 text-white text-sm min-w-0" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)",width: '40%'}}>
              {empresasOrigen.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
            <button
              onClick={() => { setOrigenId(origenSeleccion); cargarDatos(origenSeleccion); setBusqueda('') }}
              disabled={origenSeleccion === origenId}
              className="rounded-xl px-2 py-2 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              style={{background:"rgba(59,130,246,0.20)",border:"1px solid rgba(59,130,246,0.35)",width: '10%'}}>
              Ir
            </button>
          </>
        )}
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ejecutarBusqueda()}
          placeholder="Cliente u orden..."
          className={`min-w-0 flex-1 bg-[#0d1220] text-white rounded-lg px-3 py-2 text-sm focus:outline-none ${busqueda ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}
        />
        {ciudadLocal && (
          <select value={envioFiltro} onChange={e => { setEnvioFiltro(e.target.value as any); setSeleccionados([]) }}
            className={`flex-shrink-0 w-28 bg-[#0d1220] text-white rounded-lg px-2 py-2 text-sm focus:outline-none ${envioFiltro !== 'todos' ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}>
            <option value="todos">📍 Envío</option>
            <option value="local">🏠 Local</option>
            <option value="guia">🚛 Guía</option>
          </select>
        )}

        {tabActivo === 'despachado' && (
          <div className="relative flex-shrink-0" ref={popupFechaRef}>
            <button
              onClick={() => setPopupFechaOpen(v => !v)}
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
              style={{background:'#0d1220', border: (fechaFiltro || ordenDesc !== null || ciudadFiltro) ? '1px solid #ef4444' : '1px solid #1e2a3d', color: 'white'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2l-6 6v6l-4-2v-4L4 8V6z"/></svg>
            </button>
            {popupFechaOpen && (
              <div className="absolute right-0 top-12 z-50 flex items-center gap-2 px-3 py-2 rounded-xl shadow-xl"
                style={{background:'#0d1220', border:'1px solid #1e2a3d', minWidth: 'max-content'}}>
                <div className="relative">
                  <button
                    onClick={() => inputFechaRef.current?.showPicker?.()}
                    className="flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm cursor-pointer"
                    style={{background:'#111827', border:'1px solid #1e2a3d', color: fechaFiltro ? '#f59e0b' : 'white'}}>
                    {fechaFiltro ? new Date(fechaFiltro + 'T12:00:00').getDate() : new Date().getDate()}
                  </button>
                  <input type="date" ref={inputFechaRef} value={fechaFiltro}
                    onChange={e => { setFechaFiltro(e.target.value); setPopupFechaOpen(false) }}
                    className="absolute opacity-0 pointer-events-none"
                    style={{top:0, left:0, width:1, height:1}} />
                </div>
                {(() => {
                  const ciudades = [...new Set(despachoLog.map((l:any) => l.ciudad?.trim()).filter(Boolean))].sort()
                  if (ciudades.length === 0) return null
                  return (
                    <select value={ciudadFiltro} onChange={e => setCiudadFiltro(e.target.value)}
                      className="rounded-lg text-xs outline-none cursor-pointer"
                      style={{background:'#111827', border: ciudadFiltro ? '1px solid #ef4444' : '1px solid #1e2a3d', color: ciudadFiltro ? '#ef4444' : '#9ca3af', padding:'6px 8px', maxWidth:120}}>
                      <option value=''>Ciudad</option>
                      {ciudades.map((c:string) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )
                })()}
                <button onClick={() => setOrdenDesc(v => v === null ? 'desc' : null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                  style={{background:'#111827', border:'1px solid #1e2a3d', opacity: ordenDesc ? 1 : 0.35}}>
                  ⬇️
                </button>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Sub-tabs + toolbar */}
      <div className="space-y-2">
        <div className="flex gap-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl p-1">
          {([
            { id: 'pendiente',  label: 'PENDIENTES',  count: cPendientes,      activeC: 'bg-amber-500',    countC: 'text-white' },
            { id: 'alistado',   label: 'ALISTADOS',   count: cAlistados,       activeC: 'bg-emerald-600',  countC: 'text-white' },
            { id: 'despachado', label: 'DESPACHADOS', count: despachados.length, activeC: 'bg-blue-600',   countC: 'text-white' },
          ] as const).map(p => (
            <button key={p.id}
              onClick={() => { cambiarTab(p.id as any); if (p.id === 'despachado' && despachoLog.length === 0) cargarDespachoLog(true) }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-all ${
                tabActivo === p.id ? p.activeC : 'hover:bg-zinc-800'
              }`}>
              <span className={`text-xl font-black leading-none tabular-nums ${
                tabActivo === p.id ? 'text-white' : 'text-white/55'
              }`}>{p.count}</span>
              <span className={`text-[8px] font-bold tracking-wider ${
                tabActivo === p.id ? 'text-white/80' : 'text-white/45'
              }`}>{p.label}</span>
            </button>
          ))}

        </div>

        {msgSync && <span className="text-xs text-emerald-400">{msgSync}</span>}
      </div>


      {despachosVisibles.length === 0 && busquedaRemota.length === 0 && tabActivo !== 'despachado' ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-10 text-center">
          {buscandoRemoto ? <p className="text-zinc-300 text-sm">Buscando...</p> : <p className="text-zinc-300 text-sm">Sin órdenes en el período configurado</p>}
        </div>
      ) : tabActivo === 'despachado' ? null : (() => {
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
              const horaOrden = d.fechaFactura ? formatFechaCorta(d.fechaFactura) : (d.fechaOrden ? formatFechaCorta(d.fechaOrden) : formatFechaCorta(d.createdAt))
              const fotoKey = d.fotoAlistamiento
              const fotos: string[] = (d.fotosAlistamiento as string[] | null) || (fotoKey ? [fotoKey] : [])
              const tieneFotos = fotos.length > 0
              const btnFoto = (
                <button
                  onClick={tieneFotos ? () => abrirGaleriaConUrls(fotos, d.alistadoEl) : undefined}
                  disabled={!tieneFotos}
                  className="w-8 flex items-center gap-0.5 text-zinc-400 hover:text-white text-xs disabled:opacity-30 disabled:cursor-default flex-shrink-0">
                  📷{fotos.length > 1 ? <span className="text-[10px] font-semibold">{fotos.length}</span> : null}
                </button>
              )

              return (
                <div key={d.id}
                  className={`bg-zinc-900 border-t border-r border-b border-zinc-800 border-l-4 ${border} rounded-2xl overflow-hidden ${(() => { const coc = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''; const elc = ciudadLocal ? coc === ciudadLocal.trim().toLowerCase() : true; return modoSeleccion && d.estado === 'alistado' && elc ? 'cursor-pointer' : modoSeleccion && d.estado === 'alistado' && !elc ? 'opacity-40 cursor-not-allowed' : '' })()} ${modoSeleccion && seleccionados.includes(d.id) ? 'ring-2 ring-blue-500' : ''}`}
                  onContextMenu={d.estado === 'alistado' && (ciudadLocal ? (d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? '') === ciudadLocal.trim().toLowerCase() : true) ? (e) => { e.preventDefault(); if (!modoSeleccion) { setModoSeleccion(true); setSeleccionados([d.id]) } } : undefined}
                  onTouchStart={d.estado === 'alistado' && (ciudadLocal ? (d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? '') === ciudadLocal.trim().toLowerCase() : true) ? () => { longPressTimer.current = setTimeout(() => { setModoSeleccion(true); setSeleccionados([d.id]) }, 600) } : undefined}
                  onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                  onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                  onClick={modoSeleccion && d.estado === 'alistado' && (ciudadLocal ? (d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? '') === ciudadLocal.trim().toLowerCase() : true) ? () => setSeleccionados(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]) : undefined}>
                  <div className={`px-3 py-3 flex items-center gap-2 ${d.estado === 'alistado' ? 'cursor-pointer select-none' : ''}`}
                    onClick={d.estado === 'alistado' ? () => toggleExpanded(d.id) : undefined}>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5 overflow-hidden">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="text-white font-mono text-xs flex-shrink-0">F_{d.numeroFactura || d.numeroOrden}</span>
                        <span className="text-zinc-700 flex-shrink-0">·</span>
                        <span className="text-white font-semibold text-xs truncate flex-1">{nombreCorto(d.clienteNombre)}</span>
                        {ciudadNombre && <span className="text-zinc-400 text-xs flex-shrink-0 ml-1">{ciudadNombre}</span>}
                      </div>
                      {d.direccion && (
                        <span className="text-zinc-500 text-xs truncate block">{d.direccion}</span>
                      )}
                    </div>
                  </div>

                  {d.estado === 'pendiente' && (
                    <div className="px-3 pb-3 pt-1 flex items-center gap-2 border-t border-zinc-800/60">
                      <span className="text-white text-xs flex-shrink-0">{horaOrden}</span>
                      {tieneFotos ? (
                        btnFoto
                      ) : (
                        <button onClick={() => abrirCamara(d.id)} disabled={isSaving}
                          className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                          📷 Foto
                        </button>
                      )}
                    </div>
                  )}

                  {d.estado === 'alistado' && (
                    <div className="px-3 pb-1.5 pt-1 border-t border-zinc-800/60">
                      {/* Barra: foto + fecha + dropdown modo */}
                      {(() => {
                        const ciudadB = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''
                        const esLocalB = ciudadLocal ? ciudadB === ciudadLocal.trim().toLowerCase() : false
                        const modoB = modoEnvio[d.id] ?? (esLocalB ? 'local' : 'transportadora')
                        const opcionesB = esLocalB
                          ? [{ v: 'local', label: '🚚 Local' }, { v: 'transportadora', label: '📦 Guía' }, { v: 'personal', label: '🤝 Personal' }]
                          : [{ v: 'transportadora', label: '📦 Guía' }, { v: 'personal', label: '🤝 Personal' }]
                        const labelB = opcionesB.find(o => o.v === modoB)?.label ?? opcionesB[0].label
                        return (
                          <div className="flex items-center gap-2 mt-1">
                            {btnFoto}
                            {d.alistadoEl && (
                              <span className="text-zinc-400 text-xs flex-1">{formatFechaCorta(d.alistadoEl)}</span>
                            )}
                            <div className="relative ml-auto">
                              <select
                                value={modoB}
                                onChange={e => {
                                  setModoEnvio(p => ({ ...p, [d.id]: e.target.value }))
                                  if (!isExpanded) toggleExpanded(d.id)
                                }}
                                className="appearance-none bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl pl-3 pr-7 py-1.5 outline-none cursor-pointer"
                                style={{ WebkitAppearance: 'none' }}>
                                {opcionesB.map(o => (
                                  <option key={o.v} value={o.v}>{o.label}</option>
                                ))}
                              </select>
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">▼</span>
                            </div>
                          </div>
                        )
                      })()}
                      <div className="flex flex-col gap-3 mt-2">

                      </div>
                      {isExpanded && (
                        <div className="mt-2 space-y-3">
                          {/* Local — una línea */}
                          {(() => { const ciudadOrdenModo2 = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''; const esLocalModo2 = ciudadLocal ? ciudadOrdenModo2 === ciudadLocal.trim().toLowerCase() : false; const modoActual2 = modoEnvio[d.id] ?? (esLocalModo2 ? 'local' : 'transportadora'); return modoActual2 === 'local' })() && (() => {
                            const ciudadOrden = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''
                            const esLocalidad2 = ciudadLocal ? ciudadOrden === ciudadLocal.trim().toLowerCase() : false
                            // Preseleccionar único repartidor si es localidad y no hay selección
                            if (esLocalidad2 && repartidores.length === 1 && !editRepartidor[d.id]) {
                              setTimeout(() => setEditRepartidor(p => ({ ...p, [d.id]: repartidores[0].id })), 0)
                            }
                            if (!esLocalidad2) {
                              const cajas = cajasEdit[d.id] ?? d.num_cajas ?? 0
                              return (
                                <div className="flex items-center gap-2">
                                  <button onClick={() => setCajasEdit(p => ({ ...p, [d.id]: Math.max(0, (p[d.id] ?? d.num_cajas ?? 0) - 1) }))}
                                    className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700">−</button>
                                  <span className="text-white text-xs font-semibold min-w-[52px] text-center">{cajas} {cajas === 1 ? 'caja' : 'cajas'}</span>
                                  <button onClick={async () => {
                                    const n = (cajasEdit[d.id] ?? d.num_cajas ?? 0) + 1
                                    setCajasEdit(p => ({ ...p, [d.id]: n }))
                                    await patchOrden(d.id, { num_cajas: n })
                                  }} className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700">+</button>
                                </div>
                              )
                            }
                            return (
                              <div className="space-y-1.5">
                                <div className="flex gap-2 items-center">
                                  <select
                                    value={editRepartidor[d.id] ?? ''}
                                    onChange={e => setEditRepartidor(p => ({ ...p, [d.id]: e.target.value }))}
                                    className="flex-1 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}}>
                                    <option value="">— Repartidor —</option>
                                    {repartidores.map((r: any) => (
                                      <option key={r.id} value={r.id}>{r.nombre}</option>
                                    ))}
                                  </select>
                                  <button onClick={() => asignarRepartidor(d.id)}
                                    disabled={isSaving || (!editRepartidor[d.id] && !obsEdit[d.id])}
                                    className="h-9 px-3 rounded-xl border border-blue-700 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-xs font-semibold flex-shrink-0 flex items-center justify-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed">
                                    {isSaving ? '...' : '🚀 Enviar'}
                                  </button>
                                </div>
                                <textarea
                                  rows={2}
                                  placeholder="Observación (opcional)..."
                                  value={obsEdit[d.id] ?? ''}
                                  onChange={e => setObsEdit(p => ({ ...p, [d.id]: e.target.value }))}
                                  className="w-full bg-blue-950/40 border border-blue-500/30 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-400 resize-none"
                                />
                              </div>
                            )
                          })()}

                          {/* Guía — una línea */}
                          {(() => { const cm = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''; const eloc = ciudadLocal ? cm === ciudadLocal.trim().toLowerCase() : false; return (modoEnvio[d.id] ?? (eloc ? 'local' : 'transportadora')) === 'transportadora' })() && (
                            <div className="space-y-1.5 pb-2">
                              {(() => {
                                const cajas = cajasEdit[d.id] ?? 0
                                const guia = editTransporte[d.id]?.guia ?? ''
                                const puedeEnviar = cajas > 0
                                return (
                                  <>
                                  {/* Línea 1: Cajas + 🔻 Opciones + Enviar */}
                                  <div className="flex gap-1.5 items-center">
                                    <button onClick={() => setCajasEdit(p => ({ ...p, [d.id]: Math.max(0, (p[d.id] ?? 0) - 1) }))}
                                      disabled={cajas === 0}
                                      className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700 disabled:opacity-30 flex-shrink-0">−</button>
                                    <span className="text-white text-sm flex-shrink-0 min-w-[20px] text-center">
                                      <span className="text-base">{cajas === 0 ? '📦' : `${cajas}c`}</span>
                                    </span>
                                    <button onClick={async () => {
                                      const n = (cajasEdit[d.id] ?? 0) + 1
                                      setCajasEdit(p => ({ ...p, [d.id]: n }))
                                      await patchOrden(d.id, { num_cajas: n })
                                    }} className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700 flex-shrink-0">+</button>
                                    <span className="flex-1" />
                                    <button onClick={() => setObsPopup(obsPopup === d.id ? null : d.id)}
                                      className={`h-9 px-3 rounded-xl border text-xs font-semibold transition-colors flex-shrink-0 flex items-center justify-center ${obsEdit[d.id] || guia ? 'border-blue-500 text-blue-300 bg-blue-950/30' : 'border-zinc-700 text-zinc-400 bg-zinc-800 hover:bg-zinc-700'}`}>
                                      🔻 Opciones
                                    </button>
                                    <span className="flex-1" />
                                    <button onClick={() => guardarTransporte(d.id)}
                                      disabled={isSaving || (!puedeEnviar && !obsEdit[d.id])}
                                      className="h-9 px-2.5 rounded-xl border border-amber-600 bg-amber-900/40 hover:bg-amber-800/60 text-amber-300 text-xs font-semibold flex-shrink-0 flex items-center justify-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap">
                                      📦 Enviar
                                    </button>
                                  </div>
                                  {/* Línea 2: desplegable al tocar Opciones */}
                                  {obsPopup === d.id && (
                                    <div className="flex gap-1.5 items-center mt-1">
                                      <div className="relative flex-1">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">✍🏼</span>
                                        <input
                                          autoFocus
                                          type="text"
                                          maxLength={120}
                                          placeholder="Observación..."
                                          value={obsEdit[d.id] ?? ''}
                                          onChange={e => setObsEdit(p => ({ ...p, [d.id]: e.target.value }))}
                                          onKeyDown={e => { if (e.key === 'Enter') setObsPopup(null) }}
                                          className="w-full bg-blue-950/40 border border-blue-500/30 rounded-xl pl-8 pr-3 py-2 text-white text-xs outline-none focus:border-blue-400"
                                        />
                                      </div>
                                      {guia ? (
                                        <span className="text-white text-xs font-mono px-2 py-2 bg-zinc-800 border border-amber-500/40 rounded-xl cursor-pointer flex-shrink-0"
                                          onClick={() => setEditTransporte(p => ({ ...p, [d.id]: { ...p[d.id], guia: '' } }))}>
                                          {guia} ✕
                                        </span>
                                      ) : (
                                        <button title="Escanear guía" onClick={() => setEscanerOrdenId(d.id)}
                                          className="w-9 h-9 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                                            <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                                            <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                                            <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                                            <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                                            <rect x="22" y="4" width="1" height="16"/>
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  </>
                                )
                              })()}
                            </div>
                          )}

                          {/* Entrega personal con firma */}
                          {(() => { const cm2 = d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''; const eloc2 = ciudadLocal ? cm2 === ciudadLocal.trim().toLowerCase() : false; return (modoEnvio[d.id] ?? (eloc2 ? 'local' : 'transportadora')) === 'personal' })() && (
                            <div className="space-y-1.5 pb-2">
                              {/* Línea: ✍🏼 obs + 🖊️ Firmar */}
                              <div className="flex gap-1.5 items-center">
                                <div className="relative flex-1">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">✍🏼</span>
                                  <input
                                    type="text"
                                    maxLength={120}
                                    placeholder="Observación..."
                                    value={obsEdit[d.id] ?? ''}
                                    onChange={e => setObsEdit(p => ({ ...p, [d.id]: e.target.value }))}
                                    className="w-full bg-blue-950/40 border border-blue-500/30 rounded-xl pl-8 pr-3 py-2 text-white text-xs outline-none focus:border-blue-400"
                                  />
                                </div>
                                <button onClick={() => setObsPopup(`firma-${d.id}`)}
                                  className="h-9 px-3 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex-shrink-0 flex items-center justify-center gap-1">
                                  🖊️ Firmar
                                </button>
                                <button
                                  disabled={isSaving || !obsEdit[d.id]}
                                  onClick={async () => { await patchOrden(d.id, { estado: 'entregado', entregadoEl: new Date().toISOString(), observacion: obsEdit[d.id] || null }) }}
                                  className="h-9 px-3 rounded-xl border border-emerald-700 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 text-xs font-semibold flex-shrink-0 flex items-center justify-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed">
                                  🤝 Enviar
                                </button>
                              </div>
                              {obsPopup === `firma-${d.id}` && (
                                <FirmaCanvas
                                  autoOpen
                                  firma={firmaData[d.id] || null}
                                  onFirma={async (dataUrl) => {
                                    if (dataUrl) {
                                      setFirmaData(p => ({...p, [d.id]: dataUrl}))
                                      await patchOrden(d.id, { estado: 'entregado', entregadoEl: new Date().toISOString(), firmaBase64: dataUrl, observacion: obsEdit[d.id] || null })
                                      setObsPopup(null)
                                    } else {
                                      setFirmaData(p => { const n = {...p}; delete n[d.id]; return n })
                                      setObsPopup(null)
                                    }
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(d.estado === 'en_entrega' || d.estado === 'en_transito') && (() => {
                    const isExpD = expanded[d.id] || false
                    const cajas = cajasEdit[d.id] ?? d.num_cajas ?? 0
                    const guia = editTransporte[d.id]?.guia ?? d.guiaTransporte ?? ''
                    const despachadoEl = d.despachadoEl ?? d.alistadoEl
                    return (
                      <div className="border-t border-zinc-800/60">
                        {/* Barra tappable */}
                        <div className="px-4 py-1.5 flex items-center gap-2 cursor-pointer select-none"
                          onClick={() => setExpanded(p => ({ ...p, [d.id]: !p[d.id] }))}>
                          <span className="text-zinc-500 text-xs">🚚</span>
                          <span className="text-zinc-400 text-xs flex-1">
                            {d.guiaTransporte ? '#' + d.guiaTransporte : formatFechaCorta(despachadoEl)}
                            {d.num_cajas > 0 && <span className="ml-2 text-zinc-500">{d.num_cajas} caja{d.num_cajas > 1 ? 's' : ''}</span>}
                          </span>
                          <span className="text-zinc-500 text-xs">{isExpD ? '▲' : '▼'}</span>
                        </div>
                        {/* Timeline desplegado */}
                        {isExpD && (
                          <div className="px-3 pb-3 space-y-0.5 border-t border-zinc-800/40 pt-2">
                            {[
                              { icon: '📋', label: 'Orden',      fecha: d.fechaOrden,    quien: null },
                              { icon: '🧾', label: 'Facturado',  fecha: d.fechaFactura,  quien: null },
                              { icon: '📦', label: 'Alistado',   fecha: d.alistadoEl,    quien: d.alistadoPor?.nombre || null },
                              ...(!d.guiaTransporte && !d.repartidorId && d.estado === 'entregado' ? [] : [{ icon: d.guiaTransporte ? '🚛' : '🚚', label: d.guiaTransporte ? 'Transporte' : 'Despacho', fecha: despachadoEl, quien: [d.repartidor?.nombre, d.num_cajas > 0 && !d.firmaEntrega ? `${d.num_cajas} caja${d.num_cajas > 1 ? 's' : ''}` : null].filter(Boolean).join(' · '), firmaEntrega: d.firmaEntrega, observacion: d.observacion, alistadoPorNombre: d.alistadoPor?.nombre }]),
                              { icon: '✅', label: 'Entregado',  fecha: d.entregadoEl,   quien: null },
                            ].map((e: any, i) => (
                              <div key={i} className="flex items-center gap-2 py-1">
                                <span className="text-base flex-shrink-0">{e.icon}</span>
                                <span className="text-zinc-400 text-xs w-[60px] flex-shrink-0">{e.label}</span>
                                <span className="text-white text-xs flex-shrink-0">{e.fecha ? formatFechaCorta(e.fecha) : '—'}</span>
                                {e.quien && <span className="text-zinc-500 text-xs truncate flex-1">{e.quien}</span>}
                                {e.firmaEntrega && (
                                  <button onClick={() => setModalFirmaUrl(e.firmaEntrega)}
                                    className="text-zinc-400 hover:text-white text-base flex-shrink-0">🤝</button>
                                )}
                                {!e.firmaEntrega && e.observacion && (
                                  <button onClick={() => setModalObsTexto(e.observacion)}
                                    className="text-zinc-400 hover:text-white text-base flex-shrink-0">✍🏼</button>
                                )}
                              </div>
                            ))}
                            {/* Guía + cajas editables */}
                            <div className="flex gap-1.5 items-center mt-2 pt-2 border-t border-zinc-800/40">
                              <button onClick={() => setCajasEdit(p => ({ ...p, [d.id]: Math.max(0, (p[d.id] ?? d.num_cajas ?? 0) - 1) }))}
                                className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700 flex-shrink-0">−</button>
                              <span className="text-white text-sm flex-shrink-0 min-w-[24px] text-center">
                                {cajas === 0 ? '📦' : `${cajas}c`}
                              </span>
                              <button onClick={async () => {
                                const n = (cajasEdit[d.id] ?? d.num_cajas ?? 0) + 1
                                setCajasEdit(p => ({ ...p, [d.id]: n }))
                                await patchOrden(d.id, { num_cajas: n })
                              }} className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700 flex-shrink-0">+</button>
                              <button onClick={() => setGuiaPopup(guiaPopup === d.id ? null : d.id)}
                                className={`flex-1 min-w-0 py-2 rounded-xl flex items-center justify-center gap-2 border text-xs ${guia ? 'bg-zinc-800 border-orange-500/40 text-orange-300' : 'bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-white'}`}>
                                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0">
                                  <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                                  <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                                  <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                                  <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                                  <rect x="22" y="4" width="1" height="16"/>
                                </svg>
                                <span className="font-mono truncate">{guia || 'Guía'}</span>
                              </button>
                            </div>
                            {guiaPopup === d.id && (
                              <div className="flex gap-1.5 items-center mt-2">
                                <input autoFocus type="text" placeholder="Número de guía..."
                                  value={guia}
                                  onChange={e => setEditTransporte(p => ({ ...p, [d.id]: { ...p[d.id], guia: e.target.value } }))}
                                  onKeyDown={e => { if (e.key === 'Enter') setGuiaPopup(null) }}
                                  className="flex-1 bg-orange-950/30 border border-orange-500/30 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:border-orange-400" />
                                <button title="Escanear" onClick={() => setEscanerOrdenId(d.id)}
                                  className="w-9 h-9 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                                    <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                                    <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                                    <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                                    <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                                    <rect x="22" y="4" width="1" height="16"/>
                                  </svg>
                                </button>
                                <button onClick={async () => { await patchOrden(d.id, { guiaTransporte: guia || null, num_cajas: cajas }); setEditTransporte(p => { const n = {...p}; delete n[d.id]; return n }); setGuiaPopup(null) }}
                                  disabled={isSaving || guia === (d.guiaTransporte ?? '')}
                                  className="w-9 h-9 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                                  💾
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {d.estado === 'entregado' && (
                    <div className="px-3 pb-3 pt-1 border-t border-zinc-800/60 mt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-500 text-xs font-semibold">🤝 {formatFechaCorta(d.entregadoEl)}</span>
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
      {/* Control de consecutivos — DespachoLog */}
      {tabActivo === 'despachado' && (
        <div className="space-y-1">
          {despachoLog.length === 0 ? (
            null
          ) : (() => {
            const hayFiltro = envioFiltro !== 'todos' || !!fechaFiltro || !!busqueda || !!ciudadFiltro
            // Deduplicar por numeroFactura usando string (parseInt falla con prefijos como "F_")
            const logMap = new Map(despachoLog.map((l: any) => [String(l.numeroFactura), l]))
            const allNums = despachoLog.map((x: any) => parseInt(x.numeroFactura)).filter((n: number) => !isNaN(n))
            if (allNums.length === 0) return null
            const rangeMax = Math.max(...allNums)
            const rangeMin = Math.min(...allNums)
            const filas: number[] = []
            if (ordenDesc !== null) {
              const logsOrdenados = [...despachoLog].sort((a: any, b: any) => {
                const ta = a.despachadoEl ? new Date(a.despachadoEl).getTime() : 0
                const tb = b.despachadoEl ? new Date(b.despachadoEl).getTime() : 0
                return ordenDesc === 'asc' ? ta - tb : tb - ta
              })
              logsOrdenados.forEach((l: any) => { const n = parseInt(l.numeroFactura); if (!isNaN(n)) filas.push(n) })
            } else {
              for (let n = rangeMax; n >= rangeMin; n--) filas.push(n)
            }
            const gridItems = filas.map(n => {
              const log = logMap.get(String(n))
              if (!log) {
                if (hayFiltro || ordenDesc !== null) return null
                return (
                  <div key={n} className="bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center px-4 py-3">
                    <span className="text-white/40 font-mono text-xs">F_{n}</span>
                  </div>
                )
              }
              // Aplicar filtros al log
              if (busqueda) {
                const q = busqueda.toLowerCase()
                const match = (log.clienteNombre || '').toLowerCase().includes(q) ||
                              (log.numeroFactura || '').toString().includes(q) ||
                              (log.ciudad || '').toLowerCase().includes(q) ||
                              (log.guiaTransporte || '').toLowerCase().includes(q)
                if (!match) return null
              }
              if (envioFiltro !== 'todos') {
                const esLocal = ciudadLocal && log.ciudad &&
                  log.ciudad.split('/').pop()?.trim().toLowerCase() === ciudadLocal?.trim().toLowerCase()
                if (envioFiltro === 'local' && !esLocal) return null
                if (envioFiltro === 'guia' && esLocal) return null
              }
              if (fechaFiltro) {
                if (!log.despachadoEl) return null
                const d = new Date(log.despachadoEl)
                const bogota = new Date(d.getTime() - 5 * 60 * 60 * 1000)
                const yy = bogota.getUTCFullYear()
                const mm = String(bogota.getUTCMonth() + 1).padStart(2, '0')
                const dd = String(bogota.getUTCDate()).padStart(2, '0')
                if (`${yy}-${mm}-${dd}` !== fechaFiltro) return null
              }
              if (ciudadFiltro && (log.ciudad?.trim() || '') !== ciudadFiltro) return null
              // Usar datos del log directamente (tiene JOIN con OrdenDespacho)
              const fotos2: string[] = (log.fotosAlistamiento as string[] | null) || (log.fotoAlistamiento ? [log.fotoAlistamiento] : [])
              const ciudad2 = log.ciudad?.split('/').pop()?.trim() || null
              const isExpLog = expanded[log.id] || false
              const cajasLog = cajasEdit[log.id] ?? log.num_cajas ?? 0
              const guiaLog = editTransporte[log.id]?.guia ?? log.guiaTransporte ?? ''
              return (
                <div key={n} className={`bg-zinc-900 border-t border-r border-b border-zinc-800 border-l-4 ${log.entregadoEl ? 'border-l-emerald-600' : log.modo === 'repartidor' ? 'border-l-cyan-400' : 'border-l-orange-400'} rounded-2xl overflow-hidden`}>
                  {/* Header tappable */}
                  <div className="px-3 py-3 flex items-start gap-2 cursor-pointer"
                    onClick={() => setExpanded(p => ({ ...p, [log.id]: !p[log.id] }))}>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5 overflow-hidden">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="text-white font-mono text-xs flex-shrink-0">F_{log.numeroFactura}</span>
                        <span className="text-zinc-700 flex-shrink-0">·</span>
                        <span className="text-white font-semibold text-xs truncate flex-1">{nombreCorto(log.clienteNombre)}</span>
                        {ciudad2 && <span className="text-zinc-400 text-xs flex-shrink-0">{ciudad2}</span>}
                      </div>
                      {log.direccion && <span className="text-zinc-500 text-xs truncate block">{log.direccion}</span>}
                    </div>
                    <span className="text-xs mt-0.5 flex-shrink-0">
                      {isExpLog ? '▲' : log.entregadoEl ? '✅' : log.modo === 'personal' ? '🤝' : log.modo === 'repartidor' ? '🚚' : (
                        <span className="relative inline-flex">
                          🚛{log.guiaTransporte && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-zinc-900" />}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Timeline desplegado */}
                  {isExpLog && (
                    <div className="px-3 pb-3 space-y-0.5 border-t border-zinc-800/40 pt-2">
                      {[
                        { icon: '📋', label: 'Orden',      fecha: log.fechaOrden,    quien: log.vendedorNombre ? log.vendedorNombre.split(' ')[0].charAt(0).toUpperCase() + log.vendedorNombre.split(' ')[0].slice(1).toLowerCase() : null },
                        { icon: '🧾', label: 'Facturado',  fecha: log.fechaFactura,  quien: 'Admin' },
                        { icon: '📦', label: 'Alistado',   fecha: log.alistadoEl,    quien: log.alistadoPor?.nombre || null,
                          accion: fotos2.length > 0 ? () => abrirGaleriaConUrls(fotos2, log.alistadoEl) : null },
                        ...(log.modo === 'personal' ? [] : [{ icon: log.modo === 'repartidor' ? '🚚' : '🚛', label: log.modo === 'repartidor' ? 'Despacho' : 'Transporte', fecha: log.despachadoEl, quien: [log.despachadoPorNombre || log.repartidor?.nombre, log.num_cajas > 0 && !log.firmaEntrega ? `${log.num_cajas} caja${log.num_cajas > 1 ? 's' : ''}` : null].filter(Boolean).join(' · '), esDespacho: true, firmaEntrega: log.firmaEntrega, observacion: log.observacion }]),
                        { icon: '✅', label: 'Entregado',  fecha: log.entregadoEl,   quien: null },
                      ].map((e: any, i) => (
                        <div key={i} className="flex items-center gap-2 py-1">
                          <span className="text-base flex-shrink-0">{e.icon}</span>
                          <span className="text-zinc-400 text-xs w-[60px] flex-shrink-0">{e.label}</span>
                          <span className="text-white text-xs flex-shrink-0">{e.fecha ? formatFechaCorta(e.fecha) : '—'}</span>
                          {e.quien && <span className="text-zinc-500 text-xs truncate flex-1">{e.quien}</span>}
                          {e.accion && <button onClick={ev => { ev.stopPropagation(); e.accion!() }} className="text-zinc-400 hover:text-white text-xs">🖼️</button>}
                          {e.firmaEntrega && (
                            <button onClick={() => setModalFirmaUrl(e.firmaEntrega)}
                              className="text-zinc-400 hover:text-white text-base flex-shrink-0">🤝</button>
                          )}
                          {!e.firmaEntrega && e.observacion && (
                            <button onClick={() => setObsPopupLog(obsPopupLog === log.id ? null : log.id)}
                              className={`text-base flex-shrink-0 ${obsPopupLog === log.id ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>✍🏼</button>
                          )}
                          {e.esDespacho && !e.firmaEntrega && (log.modo === 'transportadora' || !!log.guiaTransporte) && (
                            <button onClick={() => setGuiaPopup(guiaPopup === log.id ? null : log.id)}
                              className="flex-shrink-0 relative text-zinc-500 hover:text-white">
                              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                                <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                                <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                                <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                                <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                                <rect x="22" y="4" width="1" height="16"/>
                              </svg>
                              {(log.guiaTransporte || guiaLog) && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-zinc-900" />
                              )}
                            </button>
                          )}
                        </div>
                      ))}
                      {/* Popup observación — solo lectura inline */}
                      {obsPopupLog === log.id && log.observacion && (
                        <div className="flex gap-1.5 items-center mt-2 pt-2 border-t border-zinc-800/40">
                          <span className="text-base flex-shrink-0">✍🏼</span>
                          <p className="flex-1 text-white text-xs bg-blue-950/30 border border-blue-500/20 rounded-xl px-3 py-2">{log.observacion}</p>
                        </div>
                      )}
                      {/* Popup guía */}
                      {guiaPopup === log.id && (
                        <div className="flex gap-1.5 items-center mt-2 pt-2 border-t border-zinc-800/40">
                          {log.guiaTransporte && guiaEditando !== log.id ? (
                            // Solo lectura
                            <>
                              <span className="flex-1 text-white text-xs font-mono bg-zinc-800 border border-orange-500/30 rounded-xl px-3 py-2">{guiaLog || log.guiaTransporte}</span>
                              <button onClick={() => setGuiaEditando(log.id)}
                                className="w-9 h-9 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-zinc-300 rounded-xl flex items-center justify-center flex-shrink-0 text-xs">✏️</button>
                            </>
                          ) : (
                            // Edición
                            <>
                              <input autoFocus type="text" placeholder="Número de guía..."
                                value={guiaLog}
                                onChange={e => setEditTransporte(p => ({ ...p, [log.id]: { ...p[log.id], guia: e.target.value } }))}
                                onKeyDown={e => { if (e.key === 'Enter') setGuiaEditando(null) }}
                                className="flex-1 bg-orange-950/30 border border-orange-500/30 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:border-orange-400" />
                              <button title="Escanear" onClick={() => { setEscanerOrdenId(log.ordenId || log.id); setEscanerLogId(log.id) }}
                                className="w-9 h-9 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                                  <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                                  <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                                  <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                                  <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                                  <rect x="22" y="4" width="1" height="16"/>
                                </svg>
                              </button>
                              <button onClick={async (ev) => {
                                  ev.stopPropagation()
                                  const oid = log.ordenId || log.id
                                  const guiaVal = guiaLog
                                  const res = await fetch(`/api/bodega/despachos/${oid}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ guiaTransporte: guiaVal || null }) })
                                  await res.json()
                                  setGuiaEditando(null)
                                  setGuiaPopup(null)
                                  setEditTransporte(p => { const nv = {...p}; delete nv[log.id]; return nv })
                                  cargarDespachoLog(true)
                                }}
                                disabled={!guiaLog.trim()}
                                className="w-9 h-9 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                                💾
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
            return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">{gridItems}</div>
          })()}
        </div>
      )}
      {tabActivo === 'despachado' && logHayMas && (
        <button onClick={cargarMasDespacholog} disabled={cargandoLogMas}
          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold py-3 rounded-2xl hover:text-white disabled:opacity-40 transition-colors">
          {cargandoLogMas ? 'Cargando...' : 'Cargar más facturas'}
        </button>
      )}
      {hayMasPorTab[tabActivo] && (
        <button onClick={cargarMasTab} disabled={cargandoMasTab}
          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold py-3 rounded-2xl hover:text-white disabled:opacity-40 transition-colors">
          {cargandoMasTab ? 'Cargando...' : 'Cargar más'}
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
            <button onClick={() => {
                if (repartidores.length === 1) setAsignarTodasRepartidor(repartidores[0].id)
                else if (repartidores.length > 1 && !asignarTodasRepartidor) setAsignarTodasRepartidor(repartidores[0].id)
                setModalEnviarMasivo(true)
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
              🚚 Enviar {seleccionados.length}
            </button>
          )}
        </div>
      )}
      {/* Modal enviar masivo */}
      {modalEnviarMasivo && (
        <div className="fixed inset-0 z-[1100] bg-black/95 flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold">Asignar repartidor</p>
              <span className="text-zinc-400 text-sm">{seleccionados.length} orden{seleccionados.length > 1 ? 'es' : ''}</span>
            </div>
            <select value={asignarTodasRepartidor} onChange={e => setAsignarTodasRepartidor(e.target.value)}
              className="w-full  rounded-xl px-3 py-3 text-white text-sm" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}}>
              <option value="">— Selecciona repartidor —</option>
              {repartidores.map((r: any) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setModalEnviarMasivo(false)}
                className="flex-1 bg-zinc-800 text-white py-3 rounded-xl text-sm">Cancelar</button>
              <button onClick={() => enviarMasivo(asignarTodasRepartidor)} disabled={asignandoTodas || !asignarTodasRepartidor}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold">
                {asignandoTodas ? 'Enviando...' : '🚚 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cámara fullscreen */}
      {camaraActiva && (
        <div className="fixed inset-0 overflow-hidden touch-none" style={{zIndex:9999,background:'#000'}}>

          {countdownSec !== null ? (
            /* ── Modo countdown: fotos fullscreen + número encima ── */
            <div className="absolute inset-0 bg-black">
              {/* Mosaico fullscreen */}
              {fotosCapturadas.length === 1 ? (
                <img src={fotosCapturadas[0]} className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full grid gap-0.5 ${fotosCapturadas.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'}`}>
                  {fotosCapturadas.map((f, i) => (
                    <img key={i} src={f}
                      className={`w-full h-full object-cover ${fotosCapturadas.length === 3 && i === 0 ? 'col-span-2' : ''}`} />
                  ))}
                </div>
              )}
              {/* Número encima, centrado en la mitad superior */}
              <div className="absolute inset-x-0 top-0 h-1/2 flex flex-col items-center justify-center gap-2">
                <div className="bg-black/60 backdrop-blur-sm rounded-3xl px-6 py-3 flex flex-col items-center gap-1">
                  <span className="text-white/70 text-xs font-semibold tracking-widest uppercase">Alistando en</span>
                  <span className="text-white text-7xl font-black tabular-nums leading-none">{countdownSec}</span>
                </div>
                <button onClick={cancelarCountdown}
                  className="mt-1 px-8 py-2.5 rounded-2xl bg-black/60 border border-white/30 backdrop-blur-sm text-white text-sm font-semibold">
                  ✕ Cancelar
                </button>
              </div>
            </div>
          ) : (
            /* ── Modo cámara normal ── */
            <div className="absolute inset-0 bg-black flex flex-col">
              <div className="relative flex-1 overflow-hidden"
                onPointerDown={(e)=>{
                  const rect=(e.currentTarget as HTMLElement).getBoundingClientRect()
                  const px=e.clientX-rect.left,py=e.clientY-rect.top
                  if(!cropBox){setCropBox({x:px,y:py,w:0,h:0});setCropResizing(true);setCropResizeStart({px,py,bw:0,bh:0})}
                  else{const hx=cropBox.x+cropBox.w,hy=cropBox.y+cropBox.h
                    if(Math.abs(px-hx)<28&&Math.abs(py-hy)<28){setCropResizing(true);setCropResizeStart({px,py,bw:cropBox.w,bh:cropBox.h})}
                    else if(px>=cropBox.x&&px<=cropBox.x+cropBox.w&&py>=cropBox.y&&py<=cropBox.y+cropBox.h){setCropDragging(true);setCropDragStart({px,py,bx:cropBox.x,by:cropBox.y})}
                    else{setCropBox({x:px,y:py,w:0,h:0});setCropResizing(true);setCropResizeStart({px,py,bw:0,bh:0})}}
                }}
                onPointerMove={(e)=>{
                  const rect=(e.currentTarget as HTMLElement).getBoundingClientRect()
                  const px=e.clientX-rect.left,py=e.clientY-rect.top
                  if(cropResizing&&cropResizeStart&&cropBox){const el=e.currentTarget as HTMLElement;const maxW=el.offsetWidth-cropBox.x-4,maxH=el.offsetHeight-cropBox.y-4;setCropBox(b=>b?{...b,w:Math.min(maxW,Math.max(40,cropResizeStart.bw+(px-cropResizeStart.px))),h:Math.min(maxH,Math.max(40,cropResizeStart.bh+(py-cropResizeStart.py)))}:b)}
                  else if(cropDragging&&cropDragStart)setCropBox(b=>b?{...b,x:cropDragStart.bx+(px-cropDragStart.px),y:cropDragStart.by+(py-cropDragStart.py)}:b)
                }}
                onPointerUp={()=>{setCropDragging(false);setCropResizing(false);setTimeout(()=>setCropTouched(true),1200)}}
                onPointerLeave={()=>{setCropDragging(false);setCropResizing(false)}}>
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" style={{touchAction:'none'}}/>
                {cropBox&&cropBox.w>10&&cropBox.h>10&&(
                  <div className="absolute pointer-events-none border-2 border-white" style={{left:cropBox.x,top:cropBox.y,width:cropBox.w,height:cropBox.h,boxShadow:'0 0 0 9999px rgba(0,0,0,0.45)'}}>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-sm opacity-80"/>
                  </div>
                )}
                {cropBox&&<button className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full text-xs flex items-center justify-center" onPointerDown={e=>{e.stopPropagation();setCropBox(null);setTimeout(()=>setCropTouched(true),1200)}}>✕</button>}
              </div>
              <div className="absolute bottom-0 left-0 right-0 pb-8 px-4 pointer-events-none">
                {fotosCapturadas.length > 0 && (
                  <div className="flex gap-2 mb-4 overflow-x-auto pointer-events-auto">
                    {fotosCapturadas.map((f, i) => (
                      <div key={i} className="relative flex-shrink-0">
                        <img src={f} className="w-14 h-14 object-cover rounded-xl border-2 border-white/60" />
                        <button onClick={() => eliminarFotoCapturada(i)}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center">
                  <div className="flex items-center gap-2 pointer-events-auto w-16">
                    <button onClick={cerrarCamara}
                      className="w-16 h-16 rounded-2xl bg-zinc-800/80 border border-zinc-600 text-white text-xs flex flex-col items-center justify-center gap-1">
                      <span className="text-lg">✕</span>
                      <span>Cancelar</span>
                    </button>
                  </div>
                  <div className="flex-1 flex justify-center">
                    {cropTouched && (
                      <button onClick={capturarFoto}
                        className="w-20 h-20 rounded-full bg-white border-4 border-zinc-400 active:scale-95 transition-transform shadow-lg pointer-events-auto" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 pointer-events-auto w-16 justify-end">
                    {fotosCapturadas.length > 0 ? (
                      <button onClick={enviarFotos}
                        className="w-16 h-16 rounded-2xl bg-emerald-500 text-white text-xs flex flex-col items-center justify-center gap-1 font-bold">
                        <span className="text-lg">✓</span>
                        <span>{fotosCapturadas.length} foto{fotosCapturadas.length > 1 ? 's' : ''}</span>
                      </button>
                    ) : soportaZoom ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => aplicarZoom(zoomLevel - 0.5)} className="w-7 h-7 rounded-full bg-zinc-700/80 text-white text-base flex items-center justify-center">−</button>
                        <span className="text-white text-xs w-8 text-center">{zoomLevel.toFixed(1)}x</span>
                        <button onClick={() => aplicarZoom(zoomLevel + 0.5)} className="w-7 h-7 rounded-full bg-zinc-700/80 text-white text-base flex items-center justify-center">+</button>
                      </div>
                    ) : <div className="w-16" />}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Modal Escaner de guia */}
      {escanerOrdenId && (
        <ModalEscaner
          onDetect={(codigo) => {
            const oid = escanerOrdenId
            const lid = escanerLogId
            if (lid) {
              setEditTransporte(p => ({ ...p, [lid]: { ...p[lid], guia: codigo } }))
              setGuiaPopup(lid)
              setGuiaEditando(lid)
            } else {
              setEditTransporte(p => ({ ...p, [oid]: { ...p[oid], guia: codigo } }))
            }
            setEscanerOrdenId(null)
            setEscanerLogId(null)
          }}
          onClose={() => setEscanerOrdenId(null)}
        />
      )}

      {/* Modal Anotación */}
      {anotacionSrc && (
        <div className="fixed inset-0 bg-black z-[1000] flex flex-col">
          {anotShowToolbar && (
            <div className="absolute top-0 left-0 right-0 z-10 bg-black/70 px-3 py-2 flex items-center justify-center gap-2 flex-wrap">
              <button onClick={()=>{setAnotTool('text');setAnotText('');setAnotTextPendiente(null);setAnotTextPos(null)}}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${anotTool==='text'?'bg-blue-500 text-white':'bg-zinc-700 text-zinc-300'}`}>T Texto</button>
              <button onClick={()=>{setAnotTool('arrow');setAnotTextPendiente(null);setAnotTextPos(null)}}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${anotTool==='arrow'?'bg-blue-500 text-white':'bg-zinc-700 text-zinc-300'}`}>➜ Flecha</button>
              <div className="flex gap-1.5">
                {['#FFFFFF','#FF3B30','#FFD60A','#30D158','#000000'].map(col=>(
                  <button key={col} onClick={()=>setAnotColor(col)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${anotColor===col?'border-white scale-110':'border-transparent'}`}
                    style={{background:col}}/>
                ))}
              </div>
              {(anotaciones.length>0||anotTextPendiente)&&(
                <button onClick={()=>{
                  if(anotTextPendiente){setAnotTextPendiente(null);setAnotTextPos(null);return}
                  const next=anotaciones.slice(0,-1);setAnotaciones(next)
                  const cv=anotCanvasRef.current;if(cv)dibujarAnotaciones(cv,anotacionSrc!,next,null)
                }} className="ml-auto text-zinc-400 text-xs px-2 py-1.5 bg-zinc-800/80 rounded-xl">↩</button>
              )}
            </div>
          )}
          <div className="relative flex-1 overflow-hidden"
            onPointerDown={(e)=>{
              const rect=(e.currentTarget as HTMLElement).getBoundingClientRect()
              const px=e.clientX-rect.left,py=e.clientY-rect.top
              // Texto pendiente: arrastrar para posicionar
              if(anotTool==='text'&&anotTextPendiente){setAnotTextDragging(true);setAnotTextPos({x:px,y:py});return}
              // Verificar si toca un item existente para moverlo
              const hitIdx = anotaciones.findLastIndex((a:any)=>{
                if(a.type==='text') return Math.abs(px-a.x)<60&&Math.abs(py-a.y)<30
                if(a.type==='arrow') {
                  const mx=(a.x1+a.x2)/2,my=(a.y1+a.y2)/2
                  return Math.abs(px-mx)<40&&Math.abs(py-my)<40
                }
                return false
              })
              if(hitIdx>=0){
                setAnotTextDragging(true)
                setAnotTextPos({x:px,y:py})
                setAnotTextPendiente(`__move__${hitIdx}`)
                return
              }
              if(anotTool==='arrow'){setAnotDrawing(true);setAnotStart({x:px,y:py})}
            }}
            onPointerMove={(e)=>{
              const rect=(e.currentTarget as HTMLElement).getBoundingClientRect()
              const px=e.clientX-rect.left,py=e.clientY-rect.top
              if(anotTextDragging&&anotTextPendiente)setAnotTextPos({x:px,y:py})
              else if(anotDrawing&&anotStart)setAnotArrow({x1:anotStart.x,y1:anotStart.y,x2:px,y2:py})
            }}
            onPointerUp={(e)=>{
              const rect=(e.currentTarget as HTMLElement).getBoundingClientRect()
              const px=e.clientX-rect.left,py=e.clientY-rect.top
              if(anotTextDragging&&anotTextPendiente){
                setAnotTextDragging(false)
                if(anotTextPendiente.startsWith('__move__')){
                  // Mover item existente
                  const idx=parseInt(anotTextPendiente.replace('__move__',''))
                  const next=anotaciones.map((a:any,i:number)=>{
                    if(i!==idx) return a
                    if(a.type==='text') return {...a,x:px,y:py}
                    if(a.type==='arrow'){const dx=px-(a.x1+a.x2)/2,dy=py-(a.y1+a.y2)/2;return {...a,x1:a.x1+dx,y1:a.y1+dy,x2:a.x2+dx,y2:a.y2+dy}}
                    return a
                  })
                  setAnotaciones(next);setAnotTextPendiente(null);setAnotTextPos(null)
                  const cv=anotCanvasRef.current;if(cv)dibujarAnotaciones(cv,anotacionSrc!,next,null)
                } else {
                  const next=[...anotaciones,{type:'text',text:anotTextPendiente!,color:anotColor,x:px,y:py}]
                  setAnotaciones(next);setAnotTextPendiente(null);setAnotTextPos(null);setAnotText('')
                  const cv=anotCanvasRef.current;if(cv)dibujarAnotaciones(cv,anotacionSrc!,next,null)
                }
              } else if(anotDrawing&&anotStart){
                const next=[...anotaciones,{type:'arrow',x1:anotStart.x,y1:anotStart.y,x2:px,y2:py,color:anotColor}]
                setAnotaciones(next);setAnotArrow(null);setAnotDrawing(false)
                const cv=anotCanvasRef.current;if(cv)dibujarAnotaciones(cv,anotacionSrc!,next,null)
              }
            }}>
            <canvas className="w-full h-full object-contain" style={{touchAction:'none'}}
              ref={(el)=>{(anotCanvasRef as any).current=el;if(el&&anotacionSrc)dibujarAnotaciones(el,anotacionSrc,anotaciones,anotArrow)}}/>
            {anotTextPendiente&&anotTextPos&&(
              <div className="absolute pointer-events-none font-bold text-lg select-none"
                style={{left:anotTextPos.x,top:anotTextPos.y,color:anotColor,transform:'translate(-50%,-50%)',textShadow:'0 0 4px rgba(0,0,0,0.8)'}}>
                {anotTextPendiente}
              </div>
            )}
            {anotShowToolbar&&anotTool==='text'&&!anotTextPendiente&&(
              <div className="absolute bottom-4 left-3 right-3 z-10 flex gap-2">
                <input type="text" placeholder="Escribe un texto..." value={anotText}
                  onChange={e=>setAnotText(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&anotText.trim()){setAnotTextPendiente(anotText.trim());setAnotTextPos({x:80,y:80});setAnotShowToolbar(false)}}}
                  className="flex-1 bg-black/70 border border-white/30 rounded-2xl px-4 py-2.5 text-white text-sm outline-none focus:border-white/60 placeholder-white/40"/>
                <button onClick={()=>{if(anotText.trim()){setAnotTextPendiente(anotText.trim());setAnotTextPos({x:80,y:80});setAnotShowToolbar(false)}}}
                  disabled={!anotText.trim()}
                  className="w-10 h-10 bg-blue-500 disabled:opacity-40 text-white font-bold rounded-full flex items-center justify-center self-center">→</button>
              </div>
            )}
          </div>
          <div style={{background:'#060a24',paddingBottom:'max(16px, env(safe-area-inset-bottom))',marginBottom:'2%'}} className="px-6 pt-3 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex gap-3" style={{marginRight:'10%'}}>
                <button onClick={descartarAnotacion}
                  className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-600 text-white text-xs flex flex-col items-center justify-center gap-1">
                  <span className="text-lg">🗑️</span><span>Descartar</span>
                </button>
                <button onClick={()=>{setAnotShowToolbar(p=>!p);setAnotText('')}}
                  className={`w-16 h-16 rounded-2xl text-xs flex flex-col items-center justify-center gap-1 font-bold border ${anotShowToolbar?'bg-blue-600 border-blue-400 text-white':'bg-zinc-700 border-zinc-600 text-zinc-300'}`}>
                  <span className="text-xl">✏️</span><span>Tools</span>
                </button>
              </div>
              <button onClick={confirmarAnotacion}
                className="w-16 h-16 rounded-2xl bg-emerald-500 text-white text-xs flex flex-col items-center justify-center gap-1 font-bold">
                <span className="text-lg">✓</span><span>Usar</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal galería fullscreen */}
      {galeriaLoading && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
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

      {/* Modal firma */}
      {modalFirmaUrl && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setModalFirmaUrl(null)}>
          <div className="relative max-w-sm w-full bg-white rounded-2xl p-3" onClick={e => e.stopPropagation()}>
            <img src={modalFirmaUrl} alt="Firma" className="w-full object-contain rounded-xl max-h-[60vh]" />
            <button onClick={() => setModalFirmaUrl(null)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm">✕</button>
          </div>
        </div>
      )}

      {/* Modal observación */}
      {modalObsTexto && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setModalObsTexto(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <p className="text-zinc-400 text-xs mb-2">✍🏼 Observación</p>
            <p className="text-white text-sm">{modalObsTexto}</p>
            <button onClick={() => setModalObsTexto(null)}
              className="mt-4 w-full bg-zinc-800 text-zinc-300 py-2 rounded-xl text-xs">Cerrar</button>
          </div>
        </div>
      )}
    </>
  )
}
