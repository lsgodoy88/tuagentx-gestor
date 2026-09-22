'use client'

import ModalEscaner from '@/components/ModalEscaner'
import { SyncIcon } from '@/components/SyncIcon'
import { nowBogota } from '@/lib/fechas'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useBodegaContext } from '@/lib/bodega-context'
import { useOrdenesData } from '@/hooks/useOrdenesData'
import { useRouter } from 'next/navigation'

import { TabActivo, GaleriaState, EditTransporte, OrdenDesc } from '@/app/(app)/ordenes/_lib/tipos'
import { isHoy, tiempoDesdeSync } from '@/app/(app)/ordenes/_lib/utils'
import FiltroIconEstado from '@/app/(app)/ordenes/_components/FiltroIconEstado'
import OrdenCard from '@/app/(app)/ordenes/_components/OrdenCard'
import TabDespachados from '@/app/(app)/ordenes/_components/TabDespachados'
import ModalCamara from '@/app/(app)/ordenes/_components/ModalCamara'
import BarraSeleccionMasiva from '@/app/(app)/ordenes/_components/BarraSeleccionMasiva'
import ModalGaleria from '@/app/(app)/ordenes/_components/ModalGaleria'
import { ModalObsTexto, ModalFirma } from '@/app/(app)/ordenes/_components/ModalesSimples'

export default function ModuloOrdenes() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any
  const { origenId: origenForzado, forzado: esForzado } = useBodegaContext()

  // — Estado UI básico —
  const [origenId, setOrigenId] = useState<string>(origenForzado)
  const [origenSeleccion, setOrigenSeleccion] = useState<string>(origenForzado)
  const [empresasOrigen, setEmpresasOrigen] = useState<any[]>([])
  const [repartidores, setRepartidores] = useState<any[]>([])
  const [syncing, setSyncing] = useState(false)
  const [msgSync, setMsgSync] = useState('')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [tabActivo, setTabActivo] = useState<TabActivo>('pendiente')
  function cambiarTab(tab: TabActivo) { setTabActivo(tab); setEnvioFiltro('todos'); setSeleccionados([]) }

  // — Hook datos —
  const {
    despachosPorTab, setDespachosPorTab,
    cargando, refrescando,
    cursores, hayMasPorTab, cargandoMasTab,
    ciudadLocal, bodegaPuedeEnviar, ultimaSync,
    cargarDatos: cargarDatosHook,
    cargarTab: cargarTabHook,
    cargarMasTab: cargarMasTabHook,
    actualizarOrden, moverOrdenEntreTab,
    limpiarCache,
  } = useOrdenesData(origenForzado)

  // — DespachoLog —
  const [despachoLog, setDespachoLog] = useState<any[]>([])
  const [logHayMas, setLogHayMas] = useState(false)
  const [logNextCursor, setLogNextCursor] = useState<string | null>(null)
  const [cargandoLogMas, setCargandoLogMas] = useState(false)

  // — Filtros —
  const [busqueda, setBusqueda] = useState('')
  const [envioFiltro, setEnvioFiltro] = useState<'todos' | 'local' | 'guia'>('todos')
  const [fechaFiltro, setFechaFiltro] = useState<string>('')
  const [ordenDesc, setOrdenDesc] = useState<OrdenDesc>(null)
  const [ciudadFiltro, setCiudadFiltro] = useState<string>('')
  const [iconEstadoFiltro, setIconEstadoFiltro] = useState<string>('')
  const [iconEstadoOpen, setIconEstadoOpen] = useState(false)
  const [popupFechaOpen, setPopupFechaOpen] = useState(false)
  const popupFechaRef = useRef<HTMLDivElement>(null)
  const inputFechaRef = useRef<HTMLInputElement>(null)

  // — Cards estado —
  const [toastEnvio, setToastEnvio] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editTransporte, setEditTransporte] = useState<Record<string, EditTransporte>>({})
  const [editRepartidor, setEditRepartidor] = useState<Record<string, string>>({})
  const [cajasEdit, setCajasEdit] = useState<Record<string, number>>({})
  const [obsEdit, setObsEdit] = useState<Record<string, string>>({})
  const [obsPopup, setObsPopup] = useState<string | null>(null)
  const [obsPopupLog, setObsPopupLog] = useState<string | null>(null)
  const [guiaPopup, setGuiaPopup] = useState<string | null>(null)
  const [guiaEditando, setGuiaEditando] = useState<string | null>(null)
  const [firmaData, setFirmaData] = useState<Record<string, string>>({})
  const [modalObsTexto, setModalObsTexto] = useState<string | null>(null)
  const [modalFirmaUrl, setModalFirmaUrl] = useState<string | null>(null)

  // — Selección masiva —
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [modalEnviarMasivo, setModalEnviarMasivo] = useState(false)
  const [asignarTodasRepartidor, setAsignarTodasRepartidor] = useState('')
  const [asignandoTodas, setAsignandoTodas] = useState(false)
  const [busquedaRemota, setBusquedaRemota] = useState<any[]>([])
  const [buscandoRemoto, setBuscandoRemoto] = useState(false)
  const [modoEnvio, setModoEnvio] = useState<Record<string, string>>({})
  const [escanerOrdenId, setEscanerOrdenId] = useState<string | null>(null)
  const [escanerLogId, setEscanerLogId] = useState<string | null>(null)

  // — Galería / modales —
  const [galeria, setGaleria] = useState<GaleriaState | null>(null)
  const [galeriaLoading, setGaleriaLoading] = useState(false)

  // — Cámara —
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [countdownSec, setCountdownSec] = useState<number | null>(null)
  const [camaraOrdenId, setCamaraOrdenId] = useState<string | null>(null)
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null)
  const [keysPrevias, setKeysPrevias] = useState<string[]>([])
  const [fotosCapturadas, setFotosCapturadas] = useState<string[]>([])
  const [zoomLevel, setZoomLevel] = useState(1)
  const [soportaZoom, setSoportaZoom] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const enviandoFotosRef = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // — Anotación —
  const [anotacionSrc, setAnotacionSrc] = useState<string | null>(null)
  const [anotTool, setAnotTool] = useState<'text' | 'arrow'>('text')
  const [anotColor, setAnotColor] = useState('#FFFFFF')
  const [anotText, setAnotText] = useState('')
  const [anotaciones, setAnotaciones] = useState<any[]>([])
  const [anotArrow, setAnotArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [anotDrawing, setAnotDrawing] = useState(false)
  const [anotStart, setAnotStart] = useState<{ x: number; y: number } | null>(null)
  const [anotTextPendiente, setAnotTextPendiente] = useState<string | null>(null)
  const [anotTextPos, setAnotTextPos] = useState<{ x: number; y: number } | null>(null)
  const [anotTextDragging, setAnotTextDragging] = useState(false)
  const [anotShowToolbar, setAnotShowToolbar] = useState(false)
  const anotCanvasRef = useRef<HTMLCanvasElement>(null)
  const cargadoInicialRef = useRef(false)

  const esAdmin = user?.role === 'empresa' || user?.role === 'supervisor'

  // — Effects —
  useEffect(() => {
    if (!camaraActiva || !streamRef.current) return
    const video = videoRef.current
    if (!video) return
    streamRef.current.getTracks().forEach(t => { t.enabled = true })
    if (video.srcObject !== streamRef.current) video.srcObject = streamRef.current
    video.play().catch(() => {})
  }, [camaraActiva])

  useEffect(() => {
    if (!popupFechaOpen) return
    function handleClick(e: Event) {
      if (popupFechaRef.current && !popupFechaRef.current.contains(e.target as Node)) setPopupFechaOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('touchstart', handleClick) }
  }, [popupFechaOpen])

  useEffect(() => {
    if (!camaraActiva) return
    const bloquear = (e: PopStateEvent) => { e.preventDefault(); window.history.pushState(null, '', window.location.href) }
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', bloquear)
    return () => window.removeEventListener('popstate', bloquear)
  }, [camaraActiva])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    if (!['empresa', 'supervisor', 'bodega'].includes(user?.role)) { router.push('/inicio'); return }
    if (cargadoInicialRef.current) return
    cargadoInicialRef.current = true
    if (origenForzado && origenForzado !== 'propia') {
      cargarDatos(origenForzado)
    } else {
      fetch('/api/bodega/empresas-origen').then(r => r.json()).then(lista => {
        setEmpresasOrigen(lista)
        if (lista.length > 0) { setOrigenId(lista[0].id); setOrigenSeleccion(lista[0].id); cargarDatos(lista[0].id) }
      }).catch(() => { setOrigenSeleccion('propia'); cargarDatos('propia') })
    }
    fetch('/api/empleados?rol=entregas').then(r => r.json()).then(d => {
      const lista = d.empleados || []
      setRepartidores(lista)
      if (lista.length === 1) setEditRepartidor(prev => ({ ...prev, __default__: lista[0].id }))
    }).catch(() => {})
  }, [status, origenForzado])

  // — Funciones de datos —
  async function cargarTab(tab: TabActivo, origen?: string, reset = false) {
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
  async function cargarMasTab() { await cargarMasTabHook(tabActivo, origenId, busqueda) }

  // — Patch / acciones —
  async function patchOrden(id: string, body: Record<string, unknown>) {
    setSaving(p => ({ ...p, [id]: true }))
    try {
      const res = await fetch(`/api/bodega/despachos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.orden) {
        const ordenActualizada = data.orden
        actualizarOrden(id, ordenActualizada)
        const estadoFinal = ordenActualizada.estado
        const esDespachada = ['en_entrega', 'en_transito', 'entregado'].includes(estadoFinal)
        const esAlistada = estadoFinal === 'alistado'
        setDespachosPorTab(prev => {
          const next = { ...prev }
          for (const tab of Object.keys(next) as Array<TabActivo>) {
            if (esDespachada && tab !== 'despachado') { next[tab] = next[tab].filter((d: any) => d.id !== id) }
            else if (esDespachada && tab === 'despachado') {
              const yaExiste = next[tab].some((d: any) => d.id === id)
              next[tab] = yaExiste ? next[tab].map((d: any) => d.id === id ? { ...d, ...ordenActualizada } : d) : [{ ...ordenActualizada }, ...next[tab]]
            } else if (esAlistada && tab === 'pendiente') { next[tab] = next[tab].filter((d: any) => d.id !== id) }
            else if (esAlistada && tab === 'alistado') {
              const yaExiste = next[tab].some((d: any) => d.id === id)
              next[tab] = yaExiste ? next[tab].map((d: any) => d.id === id ? { ...d, ...ordenActualizada } : d) : [...next[tab], { ...ordenActualizada }]
            } else { next[tab] = next[tab].map((d: any) => d.id === id ? { ...d, ...ordenActualizada } : d) }
          }
          return next
        })
        if (esDespachada) cargarDespachoLog(true).then(() => setTabActivo('despachado'))
        else if (esAlistada) setTabActivo('alistado')
      }
      if (data.rutaAsignada && data.repartidorNombre) {
        setToastEnvio(`${data.repartidorNombre} ha recibido la orden`)
        setTimeout(() => setToastEnvio(null), 3500)
      }
    } finally { setSaving(p => ({ ...p, [id]: false })) }
  }

  async function marcarAlistado(id: string) { return patchOrden(id, { estado: 'alistado' }) }

  async function asignarRepartidor(id: string) {
    const rid = editRepartidor[id]
    if (!rid) return
    const cajasLocal = cajasEdit[id] ?? 0
    await patchOrden(id, { repartidorId: rid, estado: 'en_entrega', observacion: obsEdit[id] || null, num_cajas: cajasLocal })
    setEditRepartidor(p => { const n = { ...p }; delete n[id]; return n })
    setExpanded(p => ({ ...p, [id]: false }))
  }

  async function guardarTransporte(id: string) {
    const t = editTransporte[id]
    const cajas = cajasEdit[id] ?? 0
    const obs = obsEdit[id] || null
    if (cajas <= 0 && !obs) return
    await patchOrden(id, { transportadora: t?.transportadora, guiaTransporte: t?.guia || null, num_cajas: cajas, estado: 'en_transito', observacion: obsEdit[id] || null })
    setEditTransporte(p => { const n = { ...p }; delete n[id]; return n })
    setExpanded(p => ({ ...p, [id]: false }))
  }

  async function enviarMasivo(repartidorId: string) {
    if (!seleccionados.length || !repartidorId) return
    setAsignandoTodas(true)
    for (const id of seleccionados) await patchOrden(id, { repartidorId, estado: 'en_entrega' })
    setSeleccionados([]); setModoSeleccion(false); setModalEnviarMasivo(false); setAsignandoTodas(false)
  }

  async function syncOrdenes() {
    limpiarCache(); setSyncing(true); setMsgSync('')
    try {
      const res = await fetch('/api/sync/delta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      const nuevas = data.resultados?.reduce((s: number, r: any) => s + (r.nuevasOrdenes || 0), 0) || 0
      setMsgSync(`✅ ${nuevas} nueva${nuevas !== 1 ? 's' : ''}`)
      await cargarDatos()
    } catch { setMsgSync('❌ Error') }
    finally { setSyncing(false); setTimeout(() => setMsgSync(''), 5000) }
  }

  async function ejecutarBusqueda() {
    if (!busqueda.trim()) { setBusquedaRemota([]); return }
    setBuscandoRemoto(true)
    try {
      const res = await fetch(`/api/bodega/buscar?q=${encodeURIComponent(busqueda)}&origenId=${encodeURIComponent(origenId)}`)
      const data = await res.json()
      setBusquedaRemota(data.despachos || [])
    } finally { setBuscandoRemoto(false) }
  }

  // — Cámara —
  async function abrirGaleriaConUrls(keys: string[], fecha?: string | null, esFirma = false) {
    setGaleriaLoading(true)
    try {
      const urls = await Promise.all(keys.map(async (key) => {
        if (key.startsWith('data:') || key.startsWith('http')) return key
        if (key.startsWith('/fotos/') || key.startsWith('/api/fotos/')) return key.startsWith('/api/fotos/') ? key.replace('/api/fotos/', '/fotos/') : key
        const res = esFirma
          ? await fetch('/api/firma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firma: key }) })
          : await fetch(`/api/egresos/url?key=${encodeURIComponent(key)}`)
        const data = await res.json()
        return data.url || key
      }))
      setGaleria({ fotos: urls, index: 0, fecha, esFirma })
    } finally { setGaleriaLoading(false) }
  }

  async function abrirCamara(ordenId: string) {
    setCamaraOrdenId(ordenId); setCamaraActiva(true); setFotosCapturadas([])
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
    streamRef.current = stream
    const track = stream.getVideoTracks()[0]; trackRef.current = track
    setZoomLevel(1)
    const capabilities = track.getCapabilities() as any
    setSoportaZoom(!!capabilities.zoom)
    if (videoRef.current) videoRef.current.srcObject = stream
  }

  async function retomar(ordenId: string, fotosExistentes: string[]) {
    setKeysPrevias(fotosExistentes)
    const urls: string[] = []
    for (const key of fotosExistentes) {
      try { const r = await fetch(`/api/egresos/url?key=${encodeURIComponent(key)}`); const d = await r.json(); urls.push(d.url || key) }
      catch { urls.push(key) }
    }
    setFotosCapturadas(urls); setCamaraOrdenId(ordenId); setAnotacionSrc(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      streamRef.current = stream; setCamaraActiva(true)
    } catch { setCamaraActiva(true) }
  }

  async function aplicarZoom(nivel: number) {
    const track = trackRef.current; if (!track) return
    const capabilities = track.getCapabilities() as any
    const nuevoZ = Math.min(capabilities.zoom?.max ?? 5, Math.max(capabilities.zoom?.min ?? 1, nivel))
    await track.applyConstraints({ advanced: [{ zoom: nuevoZ } as any] })
    setZoomLevel(nuevoZ)
  }

  function capturarFoto() {
    const video = videoRef.current; if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false; ctx.drawImage(video, 0, 0)
    setAnotaciones([]); setAnotArrow(null); setAnotText(''); setAnotShowToolbar(false); setAnotTextPendiente(null); setAnotTextPos(null)
    streamRef.current?.getTracks().forEach(t => { t.enabled = false })
    setCamaraActiva(false); setAnotacionSrc(canvas.toDataURL('image/jpeg', 0.85))
  }

  function confirmarAnotacion() {
    const canvas = anotCanvasRef.current; if (!canvas) return
    setFotosCapturadas(prev => [...prev, canvas.toDataURL('image/jpeg', 0.9)])
    setAnotacionSrc(null); setCamaraActiva(true)
  }
  function descartarAnotacion() { setAnotacionSrc(null); setCamaraActiva(true) }

  function dibujarAnotaciones(canvas: HTMLCanvasElement, imgSrc: string, items: any[], arrow: any) {
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      ctx.drawImage(img, 0, 0)
      const rect = canvas.getBoundingClientRect()
      const displayW = rect.width || canvas.offsetWidth || img.naturalWidth
      const displayH = rect.height || canvas.offsetHeight || img.naturalHeight
      const sx = img.naturalWidth / displayW, sy = img.naturalHeight / displayH
      items.forEach((a: any) => {
        if (a.type === 'text') {
          ctx.font = `bold ${Math.round(28 * sx)}px sans-serif`; ctx.fillStyle = a.color; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4 * sx
          ctx.strokeText(a.text, a.x * sx, a.y * sy); ctx.fillText(a.text, a.x * sx, a.y * sy)
        }
        if (a.type === 'arrow') {
          const [x1, y1, x2, y2] = [a.x1 * sx, a.y1 * sy, a.x2 * sx, a.y2 * sy]
          const angle = Math.atan2(y2 - y1, x2 - x1), hw = 18 * sx
          ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = 5 * sx; ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - hw * Math.cos(angle - 0.4), y2 - hw * Math.sin(angle - 0.4)); ctx.lineTo(x2 - hw * Math.cos(angle + 0.4), y2 - hw * Math.sin(angle + 0.4)); ctx.closePath(); ctx.fill()
        }
      })
      if (arrow) {
        const { x1, y1, x2, y2 } = arrow; const [ax1, ay1, ax2, ay2] = [x1 * sx, y1 * sy, x2 * sx, y2 * sy]
        const angle = Math.atan2(ay2 - ay1, ax2 - ax1), hw = 18 * sx
        ctx.strokeStyle = '#FFFF00'; ctx.fillStyle = '#FFFF00'; ctx.lineWidth = 5 * sx; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(ax2, ay2); ctx.lineTo(ax2 - hw * Math.cos(angle - 0.4), ay2 - hw * Math.sin(angle - 0.4)); ctx.lineTo(ax2 - hw * Math.cos(angle + 0.4), ay2 - hw * Math.sin(angle + 0.4)); ctx.closePath(); ctx.fill()
      }
    }
    img.src = imgSrc
  }

  async function enviarFotos() {
    if (!fotosCapturadas.length || !camaraOrdenId) return
    if (enviandoFotosRef.current) return
    enviandoFotosRef.current = true
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
    const ordenId = camaraOrdenId
    const fotosAEnviar = [...fotosCapturadas].filter(f => f.startsWith('data:'))
    setCountdownSec(2)
    countdownRef.current = setInterval(() => {
      setCountdownSec(prev => {
        if (prev === null || prev <= 1) { clearInterval(countdownRef.current!); countdownRef.current = null; return null }
        return prev - 1
      })
    }, 1000)
    setSaving(p => ({ ...p, [ordenId]: true }))
    try {
      const fotasPrevias: string[] = keysPrevias; let keys: string[] = []
      for (let i = 0; i < fotosAEnviar.length; i++) {
        const res = await fetch('/api/bodega/foto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordenId, fotoBase64: fotosAEnviar[i], idx: fotasPrevias.length + i }) }).then(r => r.json())
        if (!res.key) throw new Error('Error subiendo foto ' + (i + 1))
        keys.push(res.key)
      }
      const res = await fetch(`/api/bodega/despachos/${ordenId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fotosAlistamiento: [...fotasPrevias, ...keys] }) }).then(r => r.json())
      if (res.orden) moverOrdenEntreTab(ordenId, 'pendiente', 'alistado', res.orden)
    } catch (err: any) {
      console.error('[alistamiento] fallo:', err.message)
      setSaving(p => ({ ...p, [ordenId]: false })); enviandoFotosRef.current = false
      clearInterval(countdownRef.current!); countdownRef.current = null
      setCamaraActiva(false); setCamaraOrdenId(null); setCountdownSec(null); setFotosCapturadas([])
      return
    } finally { setSaving(p => ({ ...p, [ordenId]: false })); enviandoFotosRef.current = false }
    clearInterval(countdownRef.current!); countdownRef.current = null
    setCamaraActiva(false); setCamaraOrdenId(null); setCountdownSec(null); setFotosCapturadas([]); setKeysPrevias([])
  }

  function cancelarCountdown() {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    setCountdownSec(null); setCamaraActiva(false)
    const ordenId = camaraOrdenId; setCamaraOrdenId(null); setFotosCapturadas([])
    if (ordenId) {
      fetch(`/api/bodega/despachos/${ordenId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearFotos: true }) })
        .then(r => r.json()).then(data => {
          if (data.orden) setDespachosPorTab(prev => {
            const next = { ...prev }
            for (const tab of Object.keys(next)) next[tab] = next[tab].map((d: any) => d.id === ordenId ? { ...d, ...data.orden } : d)
            return next
          })
        }).catch(() => {})
    }
  }

  function cerrarCamara() { streamRef.current?.getTracks().forEach(t => t.stop()); setCamaraActiva(false); setCamaraOrdenId(null); setFotosCapturadas([]) }

  // — Datos derivados —
  const pendientes = despachosPorTab['pendiente'] || []
  const alistados = despachosPorTab['alistado'] || []
  const despachados = despachosPorTab['despachado'] || []
  const countNovedad = despachados.filter((l: any) => l.modo === 'transportadora').slice(0, 30)
    .filter((l: any) => ((l.trRawEstados as any[])?.at(-1)?.estado_nombre || '').toUpperCase().includes('NOVEDAD')).length

  const despachosVisibles = useMemo(() => {
    const base = tabActivo === 'pendiente' ? pendientes : tabActivo === 'alistado' ? alistados : despachados
    return base.filter((d: any) => {
      if (envioFiltro !== 'todos') {
        const esLocal = ciudadLocal && d.ciudad && d.ciudad.split('/').pop()?.trim().toLowerCase() === ciudadLocal?.trim().toLowerCase()
        if (envioFiltro === 'local' && !esLocal) return false
        if (envioFiltro === 'guia' && esLocal) return false
      }
      if (!busqueda) return true
      const q = busqueda.toLowerCase()
      return (d.clienteNombre || '').toLowerCase().includes(q) || (d.numeroFactura || '').toLowerCase().includes(q)
    })
  }, [tabActivo, pendientes, alistados, despachados, busqueda, envioFiltro, ciudadLocal])

  if (cargando) {
    return <div className="flex items-center justify-center py-20"><span className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
  }

  const puedeEnviar = esAdmin || bodegaPuedeEnviar
  const cPendientes = pendientes.length
  const cAlistados = alistados.length
  const cEntregadosHoy = despachados.filter((d: any) => d.estado === 'entregado' && isHoy(d.entregadoEl)).length
  const sync_ = tiempoDesdeSync(ultimaSync)

  // Callbacks para setters de estado anidados
  const handleSetModoEnvio = (id: string, v: string) => setModoEnvio(p => ({ ...p, [id]: v }))
  const handleSetObsEdit = (id: string, v: string) => setObsEdit(p => ({ ...p, [id]: v }))
  const handleSetFirmaData = (id: string, v: string | null) => setFirmaData(p => { if (!v) { const n = { ...p }; delete n[id]; return n } return { ...p, [id]: v } })
  const handleSetEditTransporte = (id: string, v: EditTransporte) => setEditTransporte(p => ({ ...p, [id]: v }))
  const handleSetCajasEdit = (id: string, v: number) => setCajasEdit(p => ({ ...p, [id]: v }))
  const handleSetEditRepartidor = (id: string, v: string) => setEditRepartidor(p => ({ ...p, [id]: v }))

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Selector empresa + buscador */}
        <div className="flex gap-2" style={{ width: '100%' }}>
          {empresasOrigen.length > 1 && !esForzado && (
            <>
              <select value={origenSeleccion} onChange={e => setOrigenSeleccion(e.target.value)}
                className="rounded-xl px-3 py-2 text-white text-sm min-w-0"
                style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)', width: '40%' }}>
                {empresasOrigen.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <button onClick={() => { setOrigenId(origenSeleccion); cargarDatos(origenSeleccion); setBusqueda('') }}
                disabled={origenSeleccion === origenId}
                className="rounded-xl px-2 py-2 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                style={{ background: 'rgba(59,130,246,0.20)', border: '1px solid rgba(59,130,246,0.35)', width: '10%' }}>Ir</button>
            </>
          )}
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ejecutarBusqueda()}
            placeholder="Cliente u orden..."
            className={`min-w-0 flex-1 bg-[#0d1220] text-white rounded-lg px-3 py-2 text-sm focus:outline-none ${busqueda ? 'border border-red-500' : 'border border-[#1e2a3d]'}`} />
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
              <button onClick={() => setPopupFechaOpen(v => !v)}
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                style={{ background: '#0d1220', border: (fechaFiltro || ordenDesc !== null || ciudadFiltro || iconEstadoFiltro) ? '1px solid #ef4444' : '1px solid #1e2a3d', color: 'white' }}>
                {countNovedad > 0
                  ? <span style={{ width: 19, height: 19, borderRadius: '50%', background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{countNovedad}</span>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2l-6 6v6l-4-2v-4L4 8V6z" /></svg>}
              </button>
              {popupFechaOpen && (
                <div className="absolute right-0 top-12 z-50 flex items-center gap-2 px-3 py-2 rounded-xl shadow-xl"
                  style={{ background: '#0d1220', border: '1px solid #1e2a3d', minWidth: 'max-content' }}>
                  <div className="relative">
                    <button onClick={() => inputFechaRef.current?.showPicker?.()}
                      className="flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm cursor-pointer"
                      style={{ background: '#111827', border: fechaFiltro ? '1px solid #ef4444' : '1px solid #1e2a3d', color: fechaFiltro ? '#ef4444' : 'white' }}>
                      {fechaFiltro ? new Date(fechaFiltro + 'T12:00:00').getDate() : new Date().getDate()}
                    </button>
                    <input type="date" ref={inputFechaRef} value={fechaFiltro}
                      onChange={e => { setFechaFiltro(e.target.value); setPopupFechaOpen(false) }}
                      className="absolute opacity-0 pointer-events-none" style={{ top: 0, left: 0, width: 1, height: 1 }} />
                  </div>
                  {(() => {
                    const ciudades = [...new Set(despachoLog.map((l: any) => l.ciudad?.trim()).filter(Boolean))].sort()
                    if (ciudades.length === 0) return null
                    return (
                      <select value={ciudadFiltro} onChange={e => setCiudadFiltro(e.target.value)}
                        className="rounded-lg text-xs outline-none cursor-pointer"
                        style={{ background: '#111827', border: ciudadFiltro ? '1px solid #ef4444' : '1px solid #1e2a3d', color: ciudadFiltro ? '#ef4444' : '#9ca3af', padding: '6px 8px', maxWidth: 120 }}>
                        <option value=''>Ciudad</option>
                        {ciudades.map((c: string) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )
                  })()}
                  <button onClick={() => { setOrdenDesc(v => v === null ? 'desc' : null); setPopupFechaOpen(false) }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                    style={{ background: '#111827', border: ordenDesc ? '1px solid #ef4444' : '1px solid #1e2a3d', opacity: ordenDesc ? 1 : 0.35 }}>⬇️</button>
                  <FiltroIconEstado value={iconEstadoFiltro} onChange={(v) => { setIconEstadoFiltro(v); setPopupFechaOpen(false) }} open={iconEstadoOpen} setOpen={setIconEstadoOpen} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="space-y-2">
          <div className="flex gap-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl p-1">
            {([
              { id: 'pendiente', label: 'PENDIENTES', count: cPendientes, activeC: 'bg-amber-500' },
              { id: 'alistado', label: 'ALISTADOS', count: cAlistados, activeC: 'bg-emerald-600' },
              { id: 'despachado', label: 'DESPACHADOS', count: despachados.length, activeC: 'bg-blue-600' },
            ] as const).map(p => (
              <button key={p.id}
                onClick={() => { cambiarTab(p.id); if (p.id === 'despachado' && despachoLog.length === 0) cargarDespachoLog(true) }}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-all ${tabActivo === p.id ? p.activeC : 'hover:bg-zinc-800'}`}>
                <span className={`text-xl font-black leading-none tabular-nums ${tabActivo === p.id ? 'text-white' : 'text-white/55'}`}>{p.count}</span>
                <span className={`text-[8px] font-bold tracking-wider ${tabActivo === p.id ? 'text-white/80' : 'text-white/45'}`}>{p.label}</span>
              </button>
            ))}
          </div>
          {msgSync && <span className="text-xs text-emerald-400">{msgSync}</span>}
        </div>

        {/* Grid órdenes (pendiente / alistado) */}
        {!refrescando && despachosVisibles.length === 0 && busquedaRemota.length === 0 && tabActivo !== 'despachado' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-10 text-center">
            {buscandoRemoto ? <p className="text-zinc-300 text-sm">Buscando...</p> : <p className="text-zinc-300 text-sm">Sin órdenes en el período configurado</p>}
          </div>
        ) : tabActivo === 'despachado' ? null : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {(despachosVisibles.length > 0 ? despachosVisibles : busquedaRemota).map((d: any) => (
              <OrdenCard
                key={d.id}
                d={d}
                ciudadLocal={ciudadLocal}
                modoSeleccion={modoSeleccion}
                seleccionados={seleccionados}
                modoEnvio={modoEnvio}
                saving={saving}
                expanded={expanded}
                cajasEdit={cajasEdit}
                obsEdit={obsEdit}
                obsPopup={obsPopup}
                firmaData={firmaData}
                editTransporte={editTransporte}
                guiaPopup={guiaPopup}
                repartidores={repartidores}
                editRepartidor={editRepartidor}
                longPressTimer={longPressTimer}
                onToggleSelect={(id) => setSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                onContextMenu={(e, id) => { e.preventDefault(); if (!modoSeleccion) { setModoSeleccion(true); setSeleccionados([id]) } }}
                onTouchStart={(id) => { longPressTimer.current = setTimeout(() => { setModoSeleccion(true); setSeleccionados([id]) }, 600) }}
                onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                onToggleExpanded={(id) => setExpanded(p => ({ ...p, [id]: !p[id] }))}
                onSetModoEnvio={handleSetModoEnvio}
                onSetObsEdit={handleSetObsEdit}
                onSetObsPopup={setObsPopup}
                onSetFirmaData={handleSetFirmaData}
                onSetEditTransporte={handleSetEditTransporte}
                onSetCajasEdit={handleSetCajasEdit}
                onSetGuiaPopup={setGuiaPopup}
                onSetEscanerOrdenId={setEscanerOrdenId}
                onSetEditRepartidor={handleSetEditRepartidor}
                onAbrirCamara={abrirCamara}
                onRetomar={retomar}
                onAbrirGaleria={abrirGaleriaConUrls}
                onPatchOrden={patchOrden}
                onMarcarAlistado={marcarAlistado}
                onAsignarRepartidor={asignarRepartidor}
                onGuardarTransporte={guardarTransporte}
                onSetModalObsTexto={setModalObsTexto}
              />
            ))}
          </div>
        )}

        {/* Tab despachados */}
        {tabActivo === 'despachado' && (
          <TabDespachados
            despachoLog={despachoLog}
            ciudadLocal={ciudadLocal}
            envioFiltro={envioFiltro}
            fechaFiltro={fechaFiltro}
            busqueda={busqueda}
            ciudadFiltro={ciudadFiltro}
            iconEstadoFiltro={iconEstadoFiltro}
            ordenDesc={ordenDesc}
            expanded={expanded}
            cajasEdit={cajasEdit}
            editTransporte={editTransporte}
            guiaPopup={guiaPopup}
            obsPopupLog={obsPopupLog}
            saving={saving}
            guiaEditando={guiaEditando}
            onToggleExpanded={(id) => setExpanded(p => ({ ...p, [id]: !p[id] }))}
            onSetCajasEdit={handleSetCajasEdit}
            onSetEditTransporte={handleSetEditTransporte}
            onSetGuiaPopup={setGuiaPopup}
            onSetObsPopupLog={setObsPopupLog}
            onSetGuiaEditando={setGuiaEditando}
            onSetEscanerOrdenId={setEscanerOrdenId}
            onSetEscanerLogId={setEscanerLogId}
            onAbrirGaleria={abrirGaleriaConUrls}
            onPatchOrden={patchOrden}
            onCargarDespachoLog={cargarDespachoLog}
            onSetModalObsTexto={setModalObsTexto}
          />
        )}

        {/* Cargar más */}
        {(tabActivo === 'despachado' ? (logHayMas || hayMasPorTab[tabActivo]) : hayMasPorTab[tabActivo]) && (
          <button
            onClick={() => { if (tabActivo === 'despachado' && logHayMas) cargarMasDespacholog(); if (hayMasPorTab[tabActivo]) cargarMasTab() }}
            disabled={cargandoLogMas || cargandoMasTab}
            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold py-3 rounded-2xl hover:text-white disabled:opacity-40 transition-colors">
            {(cargandoLogMas || cargandoMasTab) ? 'Cargando...' : 'Cargar más'}
          </button>
        )}

        {/* Selección masiva */}
        {modoSeleccion && (
          <BarraSeleccionMasiva
            seleccionados={seleccionados}
            totalVisibles={despachosVisibles.length}
            repartidores={repartidores}
            asignarTodasRepartidor={asignarTodasRepartidor}
            setAsignarTodasRepartidor={setAsignarTodasRepartidor}
            asignandoTodas={asignandoTodas}
            modalEnviarMasivo={modalEnviarMasivo}
            setModalEnviarMasivo={setModalEnviarMasivo}
            onToggleAll={() => { const ids = despachosVisibles.map((d: any) => d.id); setSeleccionados(prev => prev.length === ids.length ? [] : ids) }}
            onCancelar={() => { setModoSeleccion(false); setSeleccionados([]) }}
            onEnviarMasivo={enviarMasivo}
          />
        )}
      </div>

      {/* Cámara */}
      {camaraActiva && (
        <ModalCamara
          fotosCapturadas={fotosCapturadas}
          countdownSec={countdownSec}
          anotacionSrc={anotacionSrc}
          anotShowToolbar={anotShowToolbar}
          anotTool={anotTool}
          anotColor={anotColor}
          anotText={anotText}
          anotaciones={anotaciones}
          anotArrow={anotArrow}
          anotTextPendiente={anotTextPendiente}
          anotTextPos={anotTextPos}
          anotTextDragging={anotTextDragging}
          anotDrawing={anotDrawing}
          anotStart={anotStart}
          zoomLevel={zoomLevel}
          soportaZoom={soportaZoom}
          fotoExpandida={fotoExpandida}
          streamRef={streamRef}
          saving={saving}
          camaraOrdenId={camaraOrdenId}
          onSetAnotShowToolbar={setAnotShowToolbar}
          onSetAnotTool={setAnotTool}
          onSetAnotColor={setAnotColor}
          onSetAnotText={setAnotText}
          onSetAnotaciones={setAnotaciones}
          onSetAnotArrow={setAnotArrow}
          onSetAnotDrawing={setAnotDrawing}
          onSetAnotStart={setAnotStart}
          onSetAnotTextPendiente={setAnotTextPendiente}
          onSetAnotTextPos={setAnotTextPos}
          onSetAnotTextDragging={setAnotTextDragging}
          onSetFotoExpandida={setFotoExpandida}
          onCapturarFoto={capturarFoto}
          onEnviarFotos={enviarFotos}
          onCerrarCamara={cerrarCamara}
          onCancelarCountdown={cancelarCountdown}
          onEliminarFoto={(idx) => setFotosCapturadas(prev => prev.filter((_, i) => i !== idx))}
          onAplicarZoom={aplicarZoom}
          onConfirmarAnotacion={confirmarAnotacion}
          onDescartarAnotacion={descartarAnotacion}
          onDibujarAnotaciones={dibujarAnotaciones}
          videoRef={videoRef}
          anotCanvasRef={anotCanvasRef}
        />
      )}

      {/* Escáner guía */}
      {escanerOrdenId && (
        <ModalEscaner
          onDetect={(codigo) => {
            const oid = escanerOrdenId; const lid = escanerLogId
            if (lid) { setEditTransporte(p => ({ ...p, [lid]: { ...p[lid], guia: codigo } })); setGuiaPopup(lid); setGuiaEditando(lid) }
            else setEditTransporte(p => ({ ...p, [oid]: { ...p[oid], guia: codigo } }))
            setEscanerOrdenId(null); setEscanerLogId(null)
          }}
          onClose={() => setEscanerOrdenId(null)}
        />
      )}

      {/* Toast */}
      {toastEnvio && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2">
          <span>✓</span> {toastEnvio}
        </div>
      )}

      {/* Galería loading */}
      {galeriaLoading && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
          <span className="text-white text-sm">Cargando imagen...</span>
        </div>
      )}

      {/* Galería */}
      {galeria && (
        <ModalGaleria
          galeria={galeria}
          onClose={() => setGaleria(null)}
          onNav={(index) => setGaleria(g => g ? { ...g, index } : null)}
        />
      )}

      {/* Modales simples */}
      {modalObsTexto && <ModalObsTexto texto={modalObsTexto} onClose={() => setModalObsTexto(null)} />}
      {modalFirmaUrl && <ModalFirma url={modalFirmaUrl} onClose={() => setModalFirmaUrl(null)} />}
    </>
  )
}
