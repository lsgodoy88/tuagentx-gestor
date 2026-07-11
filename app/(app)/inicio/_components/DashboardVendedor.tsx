'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { fetchApi } from '@/lib/fetchApi'

// Formatea "HH:mm" (24h, formato guardado en BD) a texto legible 12h con AM/PM
function fmtHora12(hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const meridiano = h >= 12 ? 'PM' : 'AM'
  let hora12 = h % 12
  if (hora12 === 0) hora12 = 12
  return `${hora12}:${String(m).padStart(2, '0')} ${meridiano}`
}
import { useGpsEnDemanda } from '@/components/useGpsEnDemanda'
import { estadoMasCritico } from '@/lib/cartera'
import { CountUp, SkeletonCard, LoadingBorder } from '@/components/FX'
import { TurnoTimer, PausaTimer } from '@/components/TurnoTimer'
import type { VendedorStats, TurnoActivo } from '@/lib/types/vendedor'
import { CardKPIGroup, CardSub, CardCountAdmin, CardCountAdminSkeleton } from '@/components/ui/cards'
import dynamic from 'next/dynamic'

const ModalVisita  = dynamic(() => import('@/components/ModalVisita'),  { ssr: false })
const BuscadorInlineAccion = dynamic(() => import('@/components/BuscadorInlineAccion'), { ssr: false })
const CarteraCard  = dynamic(() => import('@/components/CarteraCard'),  { ssr: false })
const ModalRecaudo = dynamic(() => import('@/components/ModalRecaudo'), { ssr: false })

// ── Helpers ─────────────────────────────────────────────────────────────────
type LineaPago = { id: string; metodoPago: 'efectivo' | 'transferencia'; monto: string; voucherKey: string | null; voucherDatosIA: any; cargandoVoucher: boolean }
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16) })
}
function crearLinea(): LineaPago { return { id: genId(), metodoPago: 'efectivo', monto: '', voucherKey: null, voucherDatosIA: null, cargandoVoucher: false } }

// Skeleton inline — muestra placeholder mientras el dato es null/undefined
function SkVal({ v, w = 'w-16', h = 'h-4' }: { v: any, w?: string, h?: string }) {
  if (v !== null && v !== undefined) return <>{v}</>
  return <span className={`inline-block ${w} ${h} rounded bg-zinc-700/60 align-middle`} />
}
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const RR_LIMIT = 10

// ── Cache sessionStorage ─────────────────────────────────────────────────────
// Clave BASE — namespaced por userId en runtime (ver cacheKeyFor), nunca se
// usa directamente. Evita que dos usuarios distintos en el mismo navegador
// lean/escriban el mismo slot de sessionStorage (bug real: usuario B veía
// datos de usuario A hasta refrescar manualmente).
const CACHE_KEY_BASE  = 'inicio_cache'
const CACHE_TTL       = 10 * 60 * 1000  // stats/cartera: 10min
const CACHE_TTL_RUTA  =  5 * 60 * 1000  // ruta: 5min
const CACHE_TTL_TURNO =  2 * 60 * 1000  // turno: 2min

function cacheKeyFor(userId: string | undefined): string {
  return userId ? `${CACHE_KEY_BASE}_${userId}` : CACHE_KEY_BASE
}
function getCached(cacheKey: string) {
  if (cacheKey === CACHE_KEY_BASE) return null
  try {
    const raw = sessionStorage.getItem(cacheKey)
    if (!raw) return null
    const { ts, data, empresaId: eid } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(cacheKey); return null }
    return { ...data, ts, _empresaId: eid }
  } catch { return null }
}
function setCached(cacheKey: string, patch: Record<string, any>, empresaId?: string) {
  try {
    const prev = getCached(cacheKey) || {}
    sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), empresaId: empresaId || (prev as any)._empresaId, data: { ...prev, ...patch } }))
  } catch {}
}
function vieneDelLogin(cacheKey: string) {
  try { return document.referrer.includes('/login') || sessionStorage.getItem(cacheKey) === null }
  catch { return true }
}

// ── Componente ───────────────────────────────────────────────────────────────

// ── Anillo SVG — % meta mes ─────────────────────────────────
function RingChart({ pct, color, size = 72, stroke = 7, instant = false }: { pct: number, color: string, size?: number, stroke?: number, instant?: boolean }) {
  const [drawn, setDrawn] = useState(instant)
  useEffect(() => {
    if (instant) return
    const t = setTimeout(() => setDrawn(true), 150)
    return () => clearTimeout(t)
  }, [instant])

  const accent = color
  const accentTrack = 'rgba(255,255,255,0.22)'

  const R = (size / 2) - stroke
  const C = size / 2
  const circ = 2 * Math.PI * R
  const cappedPct = Math.min(pct, 100)
  const dash = drawn ? (cappedPct / 100) * circ : 0

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, padding: 4, margin: -4, boxSizing: 'content-box' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        <circle cx={C} cy={C} r={R} fill="none" stroke={accentTrack} strokeWidth={stroke * 0.45} />
        <circle cx={C} cy={C} r={R} fill="none"
          stroke={accent} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.85s cubic-bezier(.4,0,.2,1)' }}
        />

      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'white', fontSize: 15, fontWeight: 800 }}>
          {pct > 0 ? `${cappedPct}%` : '—'}
        </span>
      </div>
    </div>
  )
}

export default function DashboardVendedor({ user, onRegisterRefresh, activo = true }: { user: any, onRegisterRefresh?: (fn: () => void) => void, activo?: boolean }) {

  const router = useRouter()
  const cacheKey = cacheKeyFor(user?.id)



  // Turno
  const [turno, setTurno]               = useState<TurnoActivo | null>(null)
  const [cargandoTurno, setCargandoTurno] = useState(true)
  const [turnoExpandido, setTurnoExpandido] = useState(false)
  const [bloqueadoTurno, setBloqueadoTurno] = useState(false)
  const [mostrarPausa, setMostrarPausa] = useState(false)
  const [pausaMotivo, setPausaMotivo]   = useState('Almuerzo')
  const [pausaMotivoCustom, setPausaMotivoCustom] = useState('')
  const [pausaDuracion, setPausaDuracion] = useState(60)
  const [pausaDuracionCustom, setPausaDuracionCustom] = useState(false)

  // Stats
  const [statsVendedor, setStatsVendedor] = useState<VendedorStats | null>(null)
  const [vendedorStatsLoading, setVendedorStatsLoading] = useState(true)
  const [loadingStats, setLoadingStats] = useState(false)
  const [mostrarEstadisticasVendedor, setMostrarEstadisticasVendedor] = useState(false)
  const [mostrarImpulsadoras, setMostrarImpulsadoras] = useState(false)
  const [resumenCartera, setResumenCartera] = useState<any>(null)
  const lastPulseTs = useRef<number>(0)
  const activoRef = useRef(activo)
  useEffect(() => { activoRef.current = activo }, [activo])
  useEffect(() => {
    // BFCache: permite al layout forzar refresh reseteando el timestamp
    onRegisterRefresh?.(() => { lastPulseTs.current = 0; document.dispatchEvent(new Event('visibilitychange')) })
  }, []) // eslint-disable-line


  // Ruta
  const [ruta, setRuta]                 = useState<any>(null)
  const [clientesOrdenados, setClientesOrdenados] = useState<any[]>([])
  const [visitasRuta, setVisitasRuta]   = useState<any[]>([])
  const [puedeCapturarGps, setPuedeCapturarGps] = useState(false)
  const [obteniendoGps, setObteniendoGps] = useState(false)

  // Modales visita
  const [modalVisita, setModalVisita]   = useState<{open: boolean, tipo: string}>({open: false, tipo: 'visita'})
  const [accionActiva, setAccionActiva] = useState<string | null>(null)
  const [listaAbierta, setListaAbierta] = useState(false)

  const [modalVisitaNuevo, setModalVisitaNuevo] = useState(false)
  const [clienteModal, setClienteModal] = useState<any>(null)
  const [clienteInicialLibre, setClienteInicialLibre] = useState<any>(null)
  const [distanciaLejos, setDistanciaLejos] = useState(false)
  const [ordenesEntregadas, setOrdenesEntregadas] = useState<Set<string>>(new Set())

  // Recaudo rápido
  const [modalRecaudoRapido, setModalRecaudoRapido] = useState(false)
  const [rrBuscarCartera, setRrBuscarCartera] = useState('')
  const [rrCartera, setRrCartera]       = useState<any[]>([])
  const [rrLoadingCartera, setRrLoadingCartera] = useState(false)
  const [rrTotalDeudas, setRrTotalDeudas] = useState<number | null>(null)
  const [rrCliente, setRrCliente]       = useState<any>(null)
  const [rrVerificando, setRrVerificando] = useState(false)
  const [rrSinDeuda, setRrSinDeuda]     = useState(false)

  // Modal pago cartera
  const [recaudandoCartera, setRecaudandoCartera] = useState<any>(null)
  const [detalleData, setDetalleData]   = useState<any>(null)
  const gpsRecaudo = useGpsEnDemanda()
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [facturasSeleccionadas, setFacturasSeleccionadas] = useState<string[]>([])
  const [lineasPago, setLineasPago]     = useState<LineaPago[]>([crearLinea()])
  const [descuentosPorFactura, setDescuentosPorFactura] = useState<Record<string,string>>({})
  const [notasPago, setNotasPago]       = useState('')
  const [guardandoPago, setGuardandoPago] = useState(false)
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())

  // ── Timer turno ─────────────────────────────────────────────────────────
  // Timer del turno — manejado por TurnoTimer/PausaTimer (componentes aislados)

  // ── Carga inicial ────────────────────────────────────────────────────────
  // Prefetch silencioso — 8s después del primer render, carga modales en background
  // (3s competía con fetches de datos aún en curso en mobile lento)
  useEffect(() => {
    // FIX 2026-06-20: requestIdleCallback en vez de timeout fijo de 8s —
    // precarga cuando el navegador realmente está libre, no compite con
    // trabajo real (primer render, fetches iniciales) ni espera de más si
    // el dispositivo ya terminó su trabajo antes. Fallback a setTimeout
    // corto para navegadores sin soporte (Safari).
    const precargar = () => {
      import('@/components/ModalRecaudo').catch(() => {})
      import('@/components/ModalVisita').catch(() => {})
      import('@/components/CarteraCard').catch(() => {})
    }
    if (typeof (window as any).requestIdleCallback === 'function') {
      const id = (window as any).requestIdleCallback(precargar, { timeout: 8000 })
      return () => (window as any).cancelIdleCallback?.(id)
    }
    const t = setTimeout(precargar, 3000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!user) return
    const currentUserId = user.id
    // Reset estados al cambiar usuario
    setStatsVendedor(null)
    setResumenCartera(null)
    setTurno(null)
    setRuta(null)
    // Prioridad 1 — turno + me (UI visible de inmediato)
    Promise.all([
      fetch('/api/turnos').then(r => r.json()),
      fetch('/api/me').then(r => r.json()),
    ]).then(([t, me]) => {
      if (user?.id !== currentUserId) return
      setTurno(t)
      if (t) setCached(cacheKey, { turno: t }, user?.empresaId)
      setCargandoTurno(false)
      if (!t) setTurnoExpandido(false)
      setPuedeCapturarGps(me?.puedeCapturarGps === true)
    })
    // Prioridad 2 — ruta en background
    fetch('/api/rutas/mi-ruta').then(r => r.json()).then(r => {
      setRuta(r)
      if (user?.id !== currentUserId) return
      if (r) setCached(cacheKey, { ruta: r })
      setClientesOrdenados(r?.clientes?.map((rc: any) => ({
        ...rc.cliente,
        supervisorEtiqueta: rc.supervisorEtiqueta || null, rezago: rc.rezago,
        orden: rc.orden, notas: rc.notas || null,
        ordenDespachoId: rc.ordenDespachoId || null,
        numeroFactura: (rc as any).numeroFactura || null,
        empresaOrigen: (rc as any).empresaOrigen || null,
        alistadoPor: (rc as any).alistadoPor || null,
        asignadoEn: rc.asignadoEn || null,
        ordenCreadaEl: (rc as any).ordenCreadaEl || null,
      })) || [])
    }).catch(() => {})
    // Stats — siempre del API, nunca del cache
    setLoadingStats(true)
    fetch('/api/vendedor/stats').then(r => r.json()).catch(() => null).then(stats => {
      if (user?.id !== currentUserId) return
      if (stats && !stats.error) { setStatsVendedor(stats); lastPulseTs.current = Date.now() }
      setVendedorStatsLoading(false); setLoadingStats(false)
    })
    fetch('/api/cartera/resumen').then(r => r.json()).catch(() => null).then(cartera => {
      if (user?.id !== currentUserId) return
      if (cartera) { setResumenCartera(cartera) }
      setLoadingStats(false)
    })
  }, [user])

  // ── Refresco al volver a pantalla ────────────────────────────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!activoRef.current) return
      if (Date.now() - lastPulseTs.current < 3 * 60 * 1000) return
      lastPulseTs.current = Date.now()
      // Solo invalidar stats — mantener turno y ruta en cache (TTL propio)
      // no cache
      fetch('/api/vendedor/stats').then(r => r.json()).catch(() => null).then(s => {
        if (s && !s.error) { setStatsVendedor(s) }
      })
      fetch('/api/cartera/resumen').then(r => r.json()).catch(() => null).then(cv => {
        if (cv) { setResumenCartera(cv) }
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // ── GPS recaudo ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (detalleData) gpsRecaudo.iniciar()
    else gpsRecaudo.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalleData])

  // ── Funciones turno ──────────────────────────────────────────────────────
  async function getUbicacion(): Promise<{lat: number, lng: number} | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
      )
    })
  }
  async function iniciarTurno() {
    if (bloqueadoTurno) return
    setBloqueadoTurno(true)
    setObteniendoGps(true)
    const ubicacion = await getUbicacion()
    setObteniendoGps(false)
    // GPS es obligatorio para iniciar turno — sin coordenadas no se registra
    if (!ubicacion) {
      alert('⚠️ No se pudo obtener tu ubicación GPS.\n\nVerifica que el GPS esté activado y que hayas dado permiso a este sitio.')
      setBloqueadoTurno(false)
      return
    }
    const res = await fetchApi('/api/turnos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'iniciar', ...ubicacion }) })
    if (res?.ok) { setTurnoExpandido(false); setTurno(res.turno); setCached(cacheKey, { turno: res.turno }) }
    setBloqueadoTurno(false)
  }
  async function cerrarTurno() {
    if (bloqueadoTurno) return
    setBloqueadoTurno(true)
    const ubicacion = await getUbicacion()
    await fetchApi('/api/turnos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'cerrar', ...ubicacion }) })
    setTurno(null); setCached(cacheKey, { turno: null })
    setBloqueadoTurno(false)
  }
  async function pausarTurno() {
    const motivo = pausaMotivo === 'Otro' ? pausaMotivoCustom : pausaMotivo
    await fetchApi('/api/turnos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'pausar', motivo, duracionMin: pausaDuracion }) })
    setTurno((prev: any) => prev ? { ...prev, pausado: true, pausaInicio: new Date().toISOString(), pausaMotivo: motivo, pausaDuracionMin: pausaDuracion } : prev)
    setMostrarPausa(false)
  }
  async function reanudarTurno() {
    await fetchApi('/api/turnos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'reanudar' }) })
    setTurno((prev: any) => prev ? { ...prev, pausado: false, pausaInicio: null, pausaMotivo: null, pausaDuracionMin: null } : prev)
  }

  // ── Funciones modales ────────────────────────────────────────────────────
  function abrirModalVisita(tipo: string) { setModalVisita({ open: true, tipo }) }

  async function rrLoadCartera(q: string) {
    setRrLoadingCartera(true)
    const data = await fetchApi(`/api/cartera?q=${encodeURIComponent(q)}&limit=50`)
    setRrCartera(data?.carteras || data?.cartera || [])
    setRrLoadingCartera(false)
  }
  async function rrFetchTotal() {
    const data = await fetchApi('/api/cartera?limit=1&q=')
    setRrTotalDeudas(typeof data?.total === 'number' ? data.total : null)
  }
  function abrirModalRecaudoRapido() {
    setModalRecaudoRapido(true)
    setRrBuscarCartera(''); setRrCliente(null); setRrSinDeuda(false); setRrCartera([])
    setRrTotalDeudas(null)
    rrFetchTotal()
  }
  function abrirWhatsApp(cartera: any) {
    const telefono = (cartera.cliente?.celular || cartera.cliente?.telefono || cartera.telefono || cartera.celular || '').replace(/\D/g, '')
    if (!telefono) { alert('Cliente sin teléfono registrado'); return }

    const deudas = (cartera.DetalleCartera || cartera.deudas || [])
      .filter((d: any) => d.estado !== 'pagada' && Number(d.saldo ?? d.saldoPendiente ?? 0) > 0)
      .sort((a: any, b: any) => new Date(a.fechaVencimiento || 0).getTime() - new Date(b.fechaVencimiento || 0).getTime())

    if (!deudas.length) { alert('Sin facturas pendientes'); return }

    const nombreCliente = cartera.cliente?.nombre || cartera.nombre || ''
    const total = deudas.reduce((sum: number, d: any) => sum + Number(d.saldo ?? d.saldoPendiente ?? 0), 0)

    let mensaje = `Hola Sr(a) *${nombreCliente}*, le recordamos que tiene *${deudas.length} factura${deudas.length > 1 ? 's' : ''} pendiente${deudas.length > 1 ? 's' : ''}*:\n`

    deudas.forEach((d: any) => {
      mensaje += `\n📋 Fact. ${d.numeroFactura || d.numeroOrden || ''} → $${Number(d.saldo ?? d.saldoPendiente ?? 0).toLocaleString('es-CO')}`
      if (d.fechaVencimiento) mensaje += ` _(vence ${new Date(d.fechaVencimiento).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })})_`
    })

    mensaje += `\n\n💰 *Total pendiente: $${total.toLocaleString('es-CO')}*`
    mensaje += `\n\nAgradecemos su pronto pago.`

    window.open(`https://wa.me/57${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank')
  }

  async function cargarDetalleCartera(cartera: any) {
    setLoadingDetalle(true)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    let data: any = {}
    try {
      const res = await fetch(`/api/cartera/${cartera.clienteId}`, { signal: controller.signal })
      data = await res.json()
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    } catch (e: any) {
      clearTimeout(timer)
      setLoadingDetalle(false)
      const msg = e?.name === 'AbortError' ? 'Tiempo de espera agotado. Intenta de nuevo.' : 'No se pudo cargar la deuda. Intenta de nuevo.'
      alert(msg)
      setRecaudandoCartera(null)
      return
    } finally {
      clearTimeout(timer)
      setLoadingDetalle(false)
    }
    const dc = data.cartera
    if (!dc) { setDetalleData(null); return }
    const { calcularEstado } = await import('@/lib/cartera')
    dc.DetalleCartera = (dc.deudas || []).map((d: any) => ({
      id: d.externalId, syncDeudaId: d.id, valorFactura: d.valor, abonos: d.valor - d.saldoReal, saldoPendiente: d.saldoReal,
      ...(() => {
        const saldo = Math.max(0, d.saldoReal), vf = Number(d.valor||0), ab = vf - saldo
        const fv = d.fechaVencimiento ? new Date(d.fechaVencimiento) : null
        const { estado, label, color } = calcularEstado(saldo, vf, ab, fv)
        return { estado, estadoLabel: label, estadoColor: color }
      })(),
      numeroFactura: d.numeroFactura || d.numeroOrden, fechaVencimiento: d.fechaVencimiento, _sync: true,
    }))
    setDetalleData(dc)
    const pendientes = (dc.DetalleCartera || []).filter((d: any) => d.estado !== 'pagada').sort((a: any, b: any) => {
      const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity
      const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity
      return fa - fb
    })
    setFacturasSeleccionadas(pendientes[0]?.id ? [pendientes[0].id] : [])
    setLineasPago([crearLinea()])
  }

  async function rrSeleccionarCliente(cliente: any) {
    setRrCliente(cliente); setRrVerificando(true)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    let data: any = {}
    try {
      const res = await fetch(`/api/cartera/${cliente.id}`, { signal: controller.signal })
      data = await res.json()
    } catch (e: any) {
      clearTimeout(timer)
      setRrVerificando(false)
      setRrSinDeuda(true)
      return
    } finally {
      clearTimeout(timer)
      setRrVerificando(false)
    }
    const cartera = data.cartera
    if (cartera && Number(cartera.saldoTotal) > 0) {
      setModalRecaudoRapido(false)
      setLineasPago([crearLinea()])
      setRecaudandoCartera(cartera)
      setNotasPago('')
      cargarDetalleCartera({ ...cartera, clienteId: cliente.id })
    } else { setRrSinDeuda(true) }
  }

  async function subirVoucherArchivo(lineaId: string, file: File) {
    setLineasPago(prev => prev.map(l => l.id === lineaId ? { ...l, cargandoVoucher: true } : l))
    try {
      const archivoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = e => resolve(e.target?.result as string); reader.onerror = reject; reader.readAsDataURL(file)
      })
      const res = await fetch('/api/cartera/voucher', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archivoBase64, mimeType: file.type, pagoId: genId() }) })
      const d = await res.json()
      setLineasPago(prev => prev.map(l => l.id === lineaId ? { ...l, voucherKey: d.key, voucherDatosIA: d.datosIA, cargandoVoucher: false, monto: d.datosIA?.valor ? String(Math.round(d.datosIA.valor)) : l.monto } : l))
    } catch { alert('Error al procesar el comprobante'); setLineasPago(prev => prev.map(l => l.id === lineaId ? { ...l, cargandoVoucher: false } : l)) }
  }

  async function registrarPago() {
    if (!detalleData) return
    const total = lineasPago.reduce((s, l) => s + Number(l.monto || 0), 0)
    if (total === 0) return
    if (guardandoPago) return  // prevenir doble tap
    setGuardandoPago(true)
    let gpsCoords: { lat: number; lng: number } | null = null
    if (gpsRecaudo.estado === 'ok' && gpsRecaudo.pos) gpsCoords = { lat: gpsRecaudo.pos.lat, lng: gpsRecaudo.pos.lng }
    else if (gpsRecaudo.estado === 'buscando') { const pp = await gpsRecaudo.obtener(); if (pp) gpsCoords = { lat: pp.lat, lng: pp.lng } }
    let ultimoToken: string | null = null
    const idempotencyKey = crypto.randomUUID()
    const lineasValidas = lineasPago.filter(l => Number(l.monto||0) > 0).map(l => ({ metodoPago: l.metodoPago, monto: Number(l.monto||0), voucherKey: l.voucherKey||null, voucherDatosIA: l.voucherDatosIA||null }))
    const montoTotal = lineasValidas.reduce((s, l) => s + l.monto, 0)
    const descuentoTotal = Object.values(descuentosPorFactura).reduce((s, v) => s + Number(v || 0), 0)
    const res = await fetch('/api/cartera/pago-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ clienteApiId: detalleData.cliente?.apiId || detalleData.clienteApiId || detalleData.apiId, syncDeudaIds: facturasSeleccionadas, monto: montoTotal, descuento: descuentoTotal, descuentosPorFactura: Object.fromEntries(Object.entries(descuentosPorFactura).map(([k,v]) => [k, Number(v||0)])), metodoPago: lineasValidas.length === 1 ? lineasValidas[0].metodoPago : 'mixto', notas: notasPago||undefined, lineasPago: lineasValidas, ...(gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng, gpsAccuracy: gpsRecaudo.pos?.accuracy ?? null } : {}) })
    })
    const d = await res.json()
    if (d.pago?.reciboToken) ultimoToken = d.pago.reciboToken
    setGuardandoPago(false)
    if (ultimoToken) window.open('/recaudo/recibo?token=' + ultimoToken, '_blank')
    setRecaudandoCartera(null); setLineasPago([crearLinea()]); setDescuentosPorFactura({}); setNotasPago('')
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const hoyStrRuta   = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
  const fechaRuta    = ruta?.fecha ? new Date(new Date(ruta.fecha).getTime() - 5*60*60*1000).toISOString().split('T')[0] : hoyStrRuta
  const totalClientes = clientesOrdenados.length
  const ejecutadosRuta = clientesOrdenados.filter((c: any) => visitasRuta.some((v: any) => {
    if (v.clienteId !== c.id) return false
    const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
    return fv === fechaRuta
  })).length || 0
  const rutaCompletada = totalClientes > 0 && ejecutadosRuta >= totalClientes

  function recargarRutaVisitas() {
    const hoy = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
    // Actualización optimista — incrementa contador visitas hoy antes del fetch
    setStatsVendedor((prev: any) => prev ? { ...prev, hoy: { ...prev.hoy, total: (prev.hoy?.total || 0) + 1 } } : prev)
    Promise.all([
      fetch('/api/rutas/mi-ruta').then(r => r.json()),
      fetch('/api/visitas/todas?fecha=' + hoy).then(r => r.json()),
      fetch('/api/vendedor/stats').then(r => r.json()),
    ]).then(([r, v, s]) => {
      setRuta(r)
      setClientesOrdenados(r?.clientes?.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta||null, rezago: rc.rezago, orden: rc.orden, notas: rc.notas||null, ordenDespachoId: rc.ordenDespachoId||null, numeroFactura: (rc as any).numeroFactura||null, empresaOrigen: (rc as any).empresaOrigen||null, alistadoPor: (rc as any).alistadoPor||null, asignadoEn: rc.asignadoEn||null, ordenCreadaEl: (rc as any).ordenCreadaEl||null })) || [])
      setVisitasRuta(Array.isArray(v?.visitas) ? v.visitas : Array.isArray(v) ? v : [])
      if (s && !s.error) { setStatsVendedor(s) }
    })
  }

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-20 md:max-w-2xl md:mx-auto">

      {/* Bienvenido — solo cuando no hay turno y ya cargó */}
      {!turno && !cargandoTurno && (
        <h1 className="text-lg font-bold text-white px-1 text-center">Bienvenido, {user?.name?.split(' ')[0]}{user?.empresaNombre ? <span className="text-zinc-400 font-normal text-lg"> · {user.empresaNombre}</span> : ''}</h1>
      )}

      {/* Turno — skeleton exacto mientras carga (misma altura que el pill) */}
      <div className="space-y-4">
          {cargandoTurno ? (
            <div className="card-glass" style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',borderRadius:16,overflow:'hidden'}}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex-1 h-8 rounded-xl bg-zinc-700/50" />
                <div className="w-10 h-8 rounded-xl bg-zinc-700/50 flex-shrink-0" />
              </div>
            </div>
          ) : turno?.pausado ? (
            <div className="card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",borderRadius:16,overflow:"hidden"}}>
              <button onClick={() => setTurnoExpandido(e => !e)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <span className="relative inline-flex h-2.5 w-2.5 flex-shrink-0">
                  
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                </span>
                {turno.pausaInicio && turno.pausaDuracionMin ? <PausaTimer pausaInicio={turno.pausaInicio} pausaDuracionMin={turno.pausaDuracionMin} onExpired={reanudarTurno} /> : <span className="font-mono font-bold text-amber-400 text-lg flex-1 tabular-nums">--:--</span>}
                <span className="text-zinc-500 text-xs">⏸ {turno.pausaMotivo}</span>
                <span className={`text-zinc-600 text-[10px] ${turnoExpandido ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {turnoExpandido && (
                <div className="border-t border-amber-500/20 px-4 pb-4 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg p-2" style={{background:'rgba(148,160,185,0.28)',border:'1px solid rgba(148,180,255,0.25)'}}><p className="text-zinc-500 text-xs">Inicio pausa</p><p className="text-sm font-bold text-white">{turno.pausaInicio ? new Date(turno.pausaInicio).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",timeZone:'America/Bogota'}) : "--"}</p></div>
                    <div className="rounded-lg p-2" style={{background:'rgba(148,160,185,0.28)',border:'1px solid rgba(148,180,255,0.25)'}}><p className="text-zinc-500 text-xs">Reanuda a las</p><p className="text-emerald-400 text-sm font-bold">{turno.pausaInicio && turno.pausaDuracionMin ? new Date(new Date(turno.pausaInicio).getTime() + turno.pausaDuracionMin*60000).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",timeZone:'America/Bogota'}) : "--"}</p></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={reanudarTurno} className="flex-1 bg-zinc-800 border border-emerald-500/30 text-emerald-400 text-sm font-semibold py-2.5 rounded-xl">▶️ Reanudar</button>
                    <a href="/historial-turnos" className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1">📅 Historial</a>
                  </div>
                </div>
              )}
            </div>
          ) : turno ? (
            <div className="w-full md:max-w-2xl md:mx-auto md:w-full">
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 cursor-pointer"
                  style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",borderBottom:turnoExpandido?"none":undefined,borderRadius:turnoExpandido?"16px 16px 0 0":"16px"}}
                  onClick={() => setTurnoExpandido(e => !e)}>
                  <span className="relative inline-flex h-2 w-2 flex-shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 live-ping" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="text-white font-semibold text-sm">{user?.name?.split(' ')[0]}{user?.empresaNombre ? <span className="text-zinc-400 font-normal"> · {user.empresaNombre}</span> : ''}</span>
                  <span className={`text-zinc-600 text-[10px] ${turnoExpandido ? 'rotate-180' : ''}`}>▼</span>
                </div>
              </div>
              {turnoExpandido && (
                <div className="w-full" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",borderTop:"1px solid rgba(16,185,129,0.12)",borderRadius:"0 0 16px 16px"}}>
                  <div className="px-4 pb-4 pt-3 space-y-3">
                    <div className="flex gap-2 items-stretch">
                      <div className="flex-[35%] flex-shrink-0 flex items-center gap-2"><span className="relative inline-flex h-2 w-2 flex-shrink-0"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 live-ping" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span><p className="text-sm font-bold text-white">{new Date(turno.inicio).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",timeZone:'America/Bogota'})}</p></div>
                      <button onClick={() => setMostrarPausa(m => !m)} className="flex-[10%] flex-shrink-0 text-lg flex items-center justify-center">⏸️</button>
                      <a href="/historial-turnos" className="flex-[10%] flex-shrink-0 flex items-center justify-center text-lg">📅</a>
                      <button onClick={cerrarTurno} className="flex-[35%] flex-shrink-0 bg-red-600 text-white text-xs font-bold py-2 rounded-xl">{bloqueadoTurno ? "..." : "Cerrar turno"}</button>
                    </div>
                    {mostrarPausa && (
                      <div className="bg-black/30 rounded-xl p-3 border border-zinc-700">
                        <div className="flex gap-2 items-center">
                          <select value={pausaMotivo} onChange={e => { setPausaMotivo(e.target.value); setPausaMotivoCustom('') }}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none">
                            <option value="Almuerzo">🍽️ Almuerzo</option>
                            <option value="Permiso">📝 Permiso</option>
                            <option value="Otro">📦 Otro</option>
                          </select>
                          <select value={pausaDuracion} onChange={e => setPausaDuracion(Number(e.target.value))}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none">
                            <option value={30}>30 min</option>
                            <option value={60}>1 hora</option>
                            <option value={120}>2 horas</option>
                            <option value={180}>3 horas</option>
                          </select>
                          <button onClick={pausarTurno} className="bg-amber-500 text-white text-lg px-3 py-2.5 rounded-xl">⏸️</button>
                        </div>
                        {pausaMotivo === "Otro" && <input value={pausaMotivoCustom} onChange={e => setPausaMotivoCustom(e.target.value)} placeholder="Especifica el motivo..." className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white mt-2 outline-none" />}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card-glass md:max-w-2xl md:mx-auto md:w-full" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",borderRadius:16,overflow:"hidden"}}>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <button onClick={iniciarTurno} disabled={bloqueadoTurno || obteniendoGps} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">{obteniendoGps ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full" /> Buscando GPS...</> : <>⚡ Iniciar turno</>}</button>
                <a href="/historial-turnos" className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold px-3 py-2 rounded-xl flex-shrink-0">📅</a>
              </div>
            </div>
          )}

          {/* Botones acción */}
          {turno && (
            <div className="w-full md:max-w-2xl md:mx-auto space-y-0">
              <div className="flex gap-2">
                {[
                  { tipo: 'visita',  label: 'Visita',   icon: '👁️' },
                  { tipo: 'venta',   label: 'Venta',    icon: '💰' },
                  { tipo: 'cobro',   label: 'Recaudo',  icon: '💵' },
                  { tipo: 'entrega', label: 'Entrega',  icon: '📦' },
                ].map(b => (
                  <button key={b.tipo}
                    onClick={() => { if (accionActiva === b.tipo) { setAccionActiva(null); setListaAbierta(false) } else { setAccionActiva(b.tipo); setListaAbierta(false) } }}
                    className="flex-1 text-white font-semibold py-2.5 rounded-xl text-sm flex flex-col items-center gap-1 card-glass transition-opacity duration-150"
                    style={{
                      background: accionActiva === b.tipo ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)',
                      border: accionActiva === b.tipo ? '1px solid rgba(59,130,246,0.70)' : '1px solid rgba(255,255,255,0.30)',
                      boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)',
                      opacity: accionActiva && accionActiva !== b.tipo ? 0.35 : 1,
                      pointerEvents: accionActiva && accionActiva !== b.tipo ? 'none' : 'auto',
                    }}>
                    <span className="text-lg">{b.icon}</span>
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>

              {/* Buscador inline */}
              {accionActiva && (
                <BuscadorInlineAccion
                  accion={accionActiva}
                  onHayResultados={setListaAbierta}
                  onSeleccionar={(cliente: any) => {
                    setListaAbierta(false)
                    setAccionActiva(null)
                    setClienteInicialLibre(cliente)
                    if (accionActiva === 'cobro') { setModalRecaudoRapido(true); rrSeleccionarCliente(cliente) }
                    else abrirModalVisita(accionActiva)
                  }}
                  onNuevoProspecto={(nombre: string) => {
                    setListaAbierta(false)
                    setAccionActiva(null)
                    setClienteInicialLibre({ id: '__PROSPECTO__', nombre, clienteNombreLibre: nombre })
                    setModalVisitaNuevo(true)
                  }}
                  onCerrar={() => { setAccionActiva(null); setListaAbierta(false) }}
                />
              )}
            </div>
          )}

          {/* Ruta del día */}
          {ruta && totalClientes > 0 && !rutaCompletada && (
            <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)"}}>
              <div className="px-4 pt-4 pb-3">
                <p className="text-zinc-400 text-xs font-semibold tracking-wide mb-1 truncate">{ruta.nombre}</p>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-1.5"><span className="text-2xl font-black text-white tabular-nums">{totalClientes}</span><span className="text-zinc-500 text-xs leading-tight">total</span></div>
                  <div className="w-px h-6 bg-zinc-700" />
                  <div className="flex items-center gap-1.5"><span className="text-2xl font-black text-emerald-400 tabular-nums">{ejecutadosRuta}</span><span className="text-zinc-500 text-xs leading-tight">listos</span></div>
                  <div className="w-px h-6 bg-zinc-700" />
                  <div className="flex items-center gap-1.5"><span className="text-2xl font-black text-zinc-400 tabular-nums">{totalClientes - ejecutadosRuta}</span><span className="text-zinc-500 text-xs leading-tight">pendientes</span></div>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full " style={{width: totalClientes > 0 ? (ejecutadosRuta/totalClientes*100) + '%' : '0%'}} />
                </div>
              </div>
              <div className="flex border-t border-zinc-800">
                <button onClick={() => router.push('/mapa-ruta')} className="flex-1 flex items-center justify-center gap-2 py-3 text-zinc-400 hover:bg-zinc-800 transition-colors">
                  <span className="text-lg">🗺️</span><span className="text-sm font-semibold">Mapa</span>
                </button>
              </div>
            </div>
          )}
        </div>


      {/* Contenido colapsable al abrir buscador */}
      <div style={{display:"grid", gridTemplateRows: listaAbierta ? "0fr" : "1fr", transition:"grid-template-rows 0.25s ease"}} className={listaAbierta ? "max-h-0 overflow-hidden" : ""}><div style={{overflow:"hidden", minHeight:0}}>
      {/* Stats — solo cuando turno ya cargó, evita que aparezcan antes que el turno */}
      {!cargandoTurno && <div className="space-y-4">
        <div className="space-y-3 md:max-w-2xl md:mx-auto">
          <div className="grid grid-cols-2 gap-3">
            <CardCountAdmin stagger={1} icon="👁️" label="Visitas" onClick={() => router.push('/visitas')}
              primary={<span className={statsVendedor ? 'fade-in-data' : ''}>{statsVendedor ? <CountUp end={statsVendedor.hoy.total||0} /> : '—'}</span>}
              secondary={statsVendedor ? <CountUp end={statsVendedor.hoy.ayer||0} /> : '—'}
              primaryLabel="hoy" secondaryLabel="ayer" primaryColor="text-white" />
            <CardCountAdmin stagger={2} icon="📦" label="Órdenes" onClick={() => router.push('/trazabilidad')}
              primary={<span className={statsVendedor ? 'fade-in-data' : ''}>{statsVendedor ? <CountUp end={statsVendedor.ordenes?.despHoy||0} /> : '—'}</span>}
              secondary={statsVendedor ? <CountUp end={statsVendedor.ordenes?.factHoy||0} /> : '—'}
              primaryLabel="desp hoy" secondaryLabel="fact hoy" primaryColor="text-amber-400" />
          </div>
          {/* Ventas — 20% anillo + 80% valores */}
          <div className="rounded-2xl hover-lift card-glass" style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)',padding:'14px 16px',display:'flex',alignItems:'center',minHeight:110}}>
            <div style={{width:'20%',display:'flex',justifyContent:'center',alignItems:'center',flexShrink:0}}>
              <RingChart key={`v-${statsVendedor?.ordenes?.montoMes||0}`} pct={(statsVendedor?.ordenes?.metaVentaMes ?? 0) > 0 ? Math.round(((statsVendedor?.ordenes?.montoMes ?? 0) / statsVendedor!.ordenes!.metaVentaMes!) * 100) : 0} color="#34d399" />
            </div>
            <div style={{width:1,alignSelf:'stretch',background:'rgba(255,255,255,0.10)',margin:'0 10px',flexShrink:0}} />
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
              <div className="flex items-center justify-center gap-1.5 mb-2"><span className="text-sm">💼</span><span className="text-white text-sm font-bold tracking-wide">Ventas</span></div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-emerald-400 text-lg font-bold"><span className={statsVendedor ? 'fade-in-data' : ''}>{statsVendedor ? <CountUp end={Math.round(statsVendedor.ordenes?.montoMes||0)} prefix='$' /> : '—'}</span></span>
                <span className="text-white/40 text-base font-light">/</span>
                <span className="text-white text-lg font-bold">{statsVendedor ? (statsVendedor.ordenes?.metaVentaMes > 0 ? '$'+Math.round(statsVendedor.ordenes.metaVentaMes).toLocaleString('es-CO') : '—') : '—'}</span>
              </div>
              <div className="flex justify-center gap-4 mt-1"><span className="text-white text-xs">mes</span><span className="text-white text-xs">meta</span></div>
            </div>
          </div>

          {/* Recaudo — 20% anillo + 80% valores */}
          <div className="rounded-2xl hover-lift card-glass" style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)',padding:'14px 16px',display:'flex',alignItems:'center',minHeight:110}} onClick={() => router.push('/cartera')}>
            <div style={{width:'20%',display:'flex',justifyContent:'center',alignItems:'center',flexShrink:0}}>
              <RingChart key={`r-${statsVendedor?.recaudo?.mes||0}`} pct={(statsVendedor?.recaudo?.meta ?? 0) > 0 ? Math.round(((statsVendedor?.recaudo?.mes ?? 0) / statsVendedor!.recaudo!.meta!) * 100) : 0} color="#60a5fa" />
            </div>
            <div style={{width:1,alignSelf:'stretch',background:'rgba(255,255,255,0.10)',margin:'0 10px',flexShrink:0}} />
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
              <div className="flex items-center justify-center gap-1.5 mb-2"><span className="text-sm">💰</span><span className="text-white text-sm font-bold tracking-wide">Recaudo</span></div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-blue-400 text-lg font-bold"><span className={statsVendedor ? 'fade-in-data' : ''}>{statsVendedor ? <CountUp end={Math.round(statsVendedor.recaudo?.mes||0)} prefix='$' /> : '—'}</span></span>
                <span className="text-white/40 text-base font-light">/</span>
                <span className="text-white text-lg font-bold">{statsVendedor ? (statsVendedor.recaudo?.meta > 0 ? '$'+Math.round(statsVendedor.recaudo.meta).toLocaleString('es-CO') : '—') : '—'}</span>
              </div>
              <div className="flex justify-center gap-4 mt-1"><span className="text-white text-xs">mes</span><span className="text-white text-xs">meta</span></div>
            </div>
          </div>
        </div>

        <div className="space-y-4 md:max-w-2xl md:mx-auto">
        {/* Impulsos — botón siempre visible */}
        {(() => {
          const tieneAlerta = statsVendedor?.cumplimiento?.some((imp: any) => imp.todosLosPuntos?.some((pt: any) => pt.alertaHora)) ?? false
          return (
        <div>
          <button onClick={() => setMostrarImpulsadoras(v => !v)}
            className='card-glass' style={{background:'rgba(255,255,255,0.08)',border:`1px solid ${tieneAlerta ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.30)'}`,boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)',borderRadius:16,width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer'}}>
            <span className="text-white font-semibold text-sm">⚡ Impulsos{tieneAlerta && <span className="ml-2 text-red-400 text-xs font-bold">● Alerta</span>}</span>
            <span className="text-zinc-500 text-xs">{mostrarImpulsadoras ? '▲ Ocultar' : '▼ Ver'}</span>
          </button>
          {mostrarImpulsadoras && (
            <div className="mt-2 space-y-3 rounded-2xl p-3" style={{background:'rgba(255,255,255,0.08)',border:`1px solid ${tieneAlerta ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.12)'}`}}>
          {!statsVendedor ? (
            <>{[0,1].map(i => <div key={i} className="h-16 rounded-xl bg-zinc-800/40" />)}</>
          ) : (statsVendedor.cumplimiento?.length ?? 0) === 0 ? (
            <p className="text-zinc-500 text-xs text-center py-2">Sin impulsadoras asignadas</p>
          ) : statsVendedor.cumplimiento.map((imp: any) => {
            const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
            const diaHoy = diasSemana[new Date().getDay()]
            return (
          <CardSub key={imp.id} alerta={false} className="p-3" style={{
            background:'rgba(30,36,58,0.99)',
            border: `1px solid ${imp.todosLosPuntos?.some((pt: any) => pt.alertaHora) ? 'rgba(239,68,68,0.55)' : imp.puntoActual ? 'rgba(16,185,129,0.55)' : 'rgba(255,255,255,0.12)'}`,
          }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={"w-2 h-2 rounded-full " + (imp.turnoActivo ? "bg-emerald-500" : "bg-zinc-600")} />
                <p className="text-white text-sm font-medium">{imp.nombre}</p>
              </div>
              {imp.todosLosPuntos?.some((pt: any) => pt.alertaHora) && (
                <span className="text-red-400 text-xs font-bold">⏰ Retraso</span>
              )}
            </div>
            {imp.totalPuntos > 0 && (
              <div className="space-y-2">
                <div>
                  <p className="text-zinc-400 text-xs mb-1">hoy {diaHoy}: {imp.visitados}/{imp.totalPuntos} puntos</p>
                  <div className="w-full rounded-full h-1.5 overflow-hidden" style={{background:"rgba(59,130,246,0.15)"}}>
                    <div className={"h-1.5 rounded-full " + (imp.pct >= 80 ? "bg-emerald-500" : imp.pct >= 50 ? "bg-yellow-500" : "bg-red-500")} style={{width:(imp.pct||0)+'%'}} />
                  </div>
                </div>
                {imp.puntoActual && <div style={{background:"rgba(148,160,185,0.28)",border:"1px solid rgba(148,180,255,0.35)",borderRadius:8,padding:"8px 12px"}}>
                  <div className="flex items-center gap-1">
                    <div style={{width:'50%'}} className="min-w-0">
                      <p className="text-emerald-400 text-sm font-medium truncate">{imp.puntoActual.nombre}</p>
                      {imp.puntoActual.nombreComercial && <p className="text-zinc-500 text-xs truncate">{imp.puntoActual.nombreComercial}</p>}
                    </div>
                    <div style={{width:'25%'}} className="text-center"><p className="text-zinc-500 text-[10px] uppercase tracking-wide">Entrada</p><p className="text-white text-xs font-medium">{imp.puntoActual.horaEntrada ? new Date(imp.puntoActual.horaEntrada).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}) : '--:--'}</p></div>
                    <div style={{width:'25%'}} className="text-center"><p className="text-zinc-500 text-[10px] uppercase tracking-wide">Salida</p><p className="text-white text-xs font-medium">{imp.puntoActual.horaSalida ? new Date(imp.puntoActual.horaSalida).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}) : '--:--'}</p></div>
                  </div>
                </div>}
                {imp.proximoPunto && <div style={{background: imp.proximoPunto.alertaHora ? "rgba(127,29,29,0.30)" : "rgba(148,160,185,0.28)", border: imp.proximoPunto.alertaHora ? "1px solid rgba(239,68,68,0.55)" : "1px solid rgba(148,180,255,0.25)", borderRadius:8, padding:"8px 12px"}}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-zinc-400 text-xs">➡️ Va hacia:</p>
                    {imp.proximoPunto.horaEntradaPlan && (
                      <p className={"text-xs font-bold " + (imp.proximoPunto.alertaHora ? "text-red-400" : "text-amber-400")}>
                        {imp.proximoPunto.alertaHora ? "⏰ Atrasado · " : "🕐 "}{fmtHora12(imp.proximoPunto.horaEntradaPlan)}
                      </p>
                    )}
                  </div>
                  <p className="text-white text-sm font-medium truncate">{imp.proximoPunto.nombre}</p>
                  {imp.proximoPunto.nombreComercial && <p className="text-zinc-500 text-xs">{imp.proximoPunto.nombreComercial}</p>}
                </div>}
                {imp.puntosCompletados?.length > 0 && imp.puntosCompletados.map((pc: any, i: number) => (
                  <div key={i} style={{background:"rgba(16,185,129,0.12)",border:"1px solid rgba(16,185,129,0.35)",borderRadius:8,padding:"8px 12px"}}>
                    <div className="flex items-center gap-1">
                      <div style={{width:'50%'}} className="min-w-0">
                        <p className="text-emerald-400 text-xs font-medium truncate">✅ {pc.nombre}</p>
                        {pc.nombreComercial && <p className="text-zinc-500 text-xs truncate">{pc.nombreComercial}</p>}
                      </div>
                      <div style={{width:'25%'}} className="text-center"><p className="text-zinc-500 text-[10px] uppercase tracking-wide">Entrada</p><p className="text-white text-xs font-medium">{new Date(pc.horaEntrada).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})}</p></div>
                      <div style={{width:'25%'}} className="text-center"><p className="text-zinc-500 text-[10px] uppercase tracking-wide">Salida</p><p className="text-white text-xs font-medium">{new Date(pc.horaSalida).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})}</p></div>
                    </div>
                  </div>
                ))}
                {imp.alertasGps?.length > 0 && <div style={{background:"rgba(127,29,29,0.30)",border:"1px solid rgba(239,68,68,0.30)",borderRadius:8,padding:"8px 12px"}}><p className="text-red-400 text-xs font-semibold">⚠️ Alertas GPS hoy ({imp.alertasGps.length})</p>{imp.alertasGps.slice(0,2).map((a: any, i: number) => <p key={i} className="text-red-300 text-xs">{a.detalle} — {new Date(a.hora).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})}</p>)}</div>}
                {imp.todosLosPuntos?.length > 0 && (
                  <div className="mt-1">
                    {(() => {
                      // No repetir el punto ya mostrado arriba (puntoActual o proximoPunto)
                      const ordenYaMostrado = imp.puntoActual?.orden ?? imp.proximoPunto?.orden ?? null
                      const restantes = imp.todosLosPuntos.filter((pt: any) => pt.orden !== ordenYaMostrado)
                      if (restantes.length === 0) return null
                      return (
                        <>
                          <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-1">Siguientes puntos</p>
                          <div className="space-y-1">
                            {restantes.map((pt: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{background: pt.alertaHora ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)'}}>
                                <span className={"w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 " + (pt.estado === 'completado' ? 'bg-emerald-500 text-black' : pt.estado === 'dentro' ? 'bg-emerald-500/30 text-emerald-300' : pt.alertaHora ? 'bg-red-500/30 text-red-300' : 'bg-zinc-700 text-zinc-300')}>
                                  {pt.estado === 'completado' ? '✓' : pt.orden + 1}
                                </span>
                                <span className={"text-xs truncate flex-1 " + (pt.estado === 'completado' ? 'text-zinc-500' : 'text-white')}>{pt.nombre}</span>
                                {pt.horaEntradaPlan && (
                                  <span className={"text-[10px] font-bold flex-shrink-0 " + (pt.alertaHora ? "text-red-400" : "text-amber-400")}>
                                    {pt.alertaHora ? "⏰ " : "🕐 "}{fmtHora12(pt.horaEntradaPlan)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
            {imp.totalPuntos === 0 && <div><p className="text-zinc-500 text-xs">Sin ruta asignada hoy</p>{imp.proximoDia && <p className="text-zinc-400 text-xs mt-1">📅 Próxima ruta: <span className="text-white">{imp.proximoDia}</span></p>}</div>}
          </CardSub>
            )
          })}
            </div>
          )}
        </div>
          )
        })()}

        {/* Estadísticas */}
        <button onClick={() => setMostrarEstadisticasVendedor(v => !v)}
          className='card-glass' style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)',borderRadius:16,width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer'}}>
          <span className="text-white font-semibold text-sm">📊 Estadísticas</span>
          <span className="text-zinc-500 text-xs">{mostrarEstadisticasVendedor ? '▲ Ocultar' : '▼ Ver'}</span>
        </button>
        {mostrarEstadisticasVendedor && (!statsVendedor ? (
          <div className="space-y-3">
            <div className="h-24 rounded-2xl bg-zinc-900 border border-zinc-800" />
            <div className="h-24 rounded-2xl bg-zinc-900 border border-zinc-800" />
          </div>
        ) : (
          <div className="space-y-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-white font-bold mb-3">Últimos 6 días</p>
          <div className="overflow-x-auto">
            <div className="flex items-center gap-2 mb-2 pb-1 border-b border-zinc-700">
          <p className="text-zinc-500 text-xs w-14 flex-shrink-0">Dia</p><p className="text-zinc-500 text-xs flex-1"></p>
          <p className="text-zinc-500 text-xs w-6 text-right">Vis.</p><p className="text-zinc-500 text-xs w-16 text-right">Ventas</p><p className="text-zinc-500 text-xs w-16 text-right">Recaudo</p>
            </div>
            <div className="space-y-2">
          {statsVendedor.dias.slice().reverse().map((d: any) => (
            <div key={d.fecha} className="flex items-center gap-1">
          <p className="text-zinc-400 text-xs w-14 flex-shrink-0 capitalize">{d.label}</p>
          <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden"><div className="bg-emerald-500 h-2 rounded-full" style={{width: d.total > 0 ? Math.min(100,d.total*10)+'%' : '0%'}} /></div>
          <p className="text-white text-xs w-6 text-right">{d.total}</p>
          <p className="text-emerald-400 text-xs w-16 text-right">{d.montoVentas > 0 ? '$'+d.montoVentas.toLocaleString('es-CO') : '—'}</p>
          <p className="text-blue-400 text-xs w-16 text-right">{d.montoCobros > 0 ? '$'+d.montoCobros.toLocaleString('es-CO') : '—'}</p>
            </div>
          ))}
            </div>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-white font-bold mb-3">Últimos 6 meses</p>
          <div className="overflow-x-auto">
            <div className="flex items-center gap-2 mb-2 pb-1 border-b border-zinc-700">
          <p className="text-zinc-500 text-xs w-14 flex-shrink-0">Mes</p><p className="text-zinc-500 text-xs flex-1"></p>
          <p className="text-zinc-500 text-xs w-6 text-right">Vis.</p><p className="text-zinc-500 text-xs w-16 text-right">Ventas</p><p className="text-zinc-500 text-xs w-16 text-right">Recaudo</p>
            </div>
            <div className="space-y-2">
          {statsVendedor.meses.slice().reverse().map((m: any) => (
            <div key={m.label} className="flex items-center gap-1">
          <p className="text-zinc-400 text-xs w-14 flex-shrink-0 capitalize">{m.label}</p>
          <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden"><div className="bg-blue-500 h-2 rounded-full" style={{width: m.total > 0 ? Math.min(100,m.total*2)+'%' : '0%'}} /></div>
          <p className="text-white text-xs w-6 text-right">{m.total}</p>
          <p className="text-emerald-400 text-xs w-16 text-right">{m.montoVentas > 0 ? '$'+m.montoVentas.toLocaleString('es-CO') : '—'}</p>
          <p className="text-blue-400 text-xs w-16 text-right">{m.montoCobros > 0 ? '$'+m.montoCobros.toLocaleString('es-CO') : '—'}</p>
            </div>
          ))}
            </div>
          </div>
        </div>
          </div>
        ))}

        </div>
      </div>}



      </div></div>{/* fin colapsable */}

      {/* ── Modales ── */}
      <ModalVisita
        key={`libre-${clienteInicialLibre?.id || 'libre'}`}
        open={modalVisita.open}
        onClose={() => { setModalVisita({ open: false, tipo: 'visita' }); setClienteInicialLibre(null) }}
        onRegistrado={recargarRutaVisitas}
        clienteInicial={clienteInicialLibre || undefined}
        tipoForzado={modalVisita.tipo !== 'visita' && modalVisita.tipo !== 'venta' && modalVisita.tipo !== 'cobro' && modalVisita.tipo !== 'entrega' ? undefined : modalVisita.tipo as any}
        puedeCapturarGps={puedeCapturarGps}
        titulo={modalVisita.tipo === 'visita' ? '👁️ Visita' : modalVisita.tipo === 'venta' ? '💰 Venta' : modalVisita.tipo === 'entrega' ? '📦 Entrega' : '💵 Recaudo'}
        extraData={{ esLibre: true }}
      />
      <ModalVisita
        key={clienteModal?.id || 'sin-cliente-ruta'}
        open={!!clienteModal}
        onClose={() => setClienteModal(null)}
        facturaPreset={clienteModal?.numeroFactura || undefined}
        onRegistrado={() => {
          if (clienteModal?.ordenDespachoId) setOrdenesEntregadas(prev => new Set([...prev, clienteModal.ordenDespachoId]))
          recargarRutaVisitas()
        }}
        clienteInicial={clienteModal}
        tipoForzado="entrega"
        distanciaLejos={distanciaLejos}
        puedeCapturarGps={puedeCapturarGps}
        titulo="📦 Registrar entrega"
        extraData={clienteModal?.ordenDespachoId ? { ordenDespachoId: clienteModal.ordenDespachoId } : {}}
      />

      {/* Modal Visita Cliente Nuevo */}
      {modalVisitaNuevo && (
        <ModalVisita
          open={modalVisitaNuevo}
          onClose={() => { setModalVisitaNuevo(false); setClienteInicialLibre(null); setListaAbierta(false) }}
          onRegistrado={recargarRutaVisitas}
          tipoForzado="visita"
          puedeCapturarGps={puedeCapturarGps}
          titulo="✨ Cliente Nuevo"
          clienteNuevo={true}
          clienteInicial={clienteInicialLibre || undefined}
        />
      )}

      {/* Modal Recaudo Rápido */}
      {modalRecaudoRapido && (
        <div className="fixed inset-0 flex items-start justify-center z-50 pt-4 px-2" style={{background:"rgba(15,23,42,0.85)"}}
          onClick={e => { if (e.target === e.currentTarget) { setModalRecaudoRapido(false); setRrCliente(null); setRrSinDeuda(false) } }}>
          <div className="rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain" style={{background:"rgba(15,23,42,0.85)",border:"1px solid rgba(59,130,246,0.50)"}}>
            <div className="flex items-center justify-between px-4 pt-2.5 pb-2.5 border-b" style={{borderColor:"rgba(59,130,246,0.30)"}}>
              <h3 className="text-white font-bold text-lg">💵 Recaudo rápido</h3>
              <button onClick={() => { setModalRecaudoRapido(false); setRrCliente(null); setRrSinDeuda(false) }} className="text-zinc-500 hover:text-white text-xl">×</button>
            </div>
            <div className="px-4 py-4 space-y-3">
              {!rrCliente ? (
                <>
                  <input value={rrBuscarCartera}
                    onChange={e => { const v = e.target.value; setRrBuscarCartera(v); if (v.length >= 1) rrLoadCartera(v); else setRrCartera([]) }}
                    placeholder="Buscar cliente con deuda..." autoFocus
                    className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none placeholder:text-zinc-400"
                    style={{background:"rgba(30,41,59,0.80)",border:"1px solid rgba(59,130,246,0.35)"}} />
                  {!rrBuscarCartera && (
                    <div className="text-center py-6">
                      {rrTotalDeudas === null
                        ? <p className="text-zinc-500 text-sm">Cargando...</p>
                        : <p className="text-zinc-400 text-sm"><span className="text-white font-bold text-lg">{rrTotalDeudas}</span> cliente{rrTotalDeudas !== 1 ? 's' : ''} con deuda activa</p>
                      }
                    </div>
                  )}
                  {rrBuscarCartera && rrLoadingCartera && <div className="space-y-2">{Array.from({length:3}).map((_,i) => <div key={i} className="rounded-xl h-16 bg-zinc-800/40"/>)}</div>}
                  {rrBuscarCartera && !rrLoadingCartera && rrCartera.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">Sin resultados</p>}
                  {rrBuscarCartera && !rrLoadingCartera && rrCartera.map((cartera: any) => (
                    <CarteraCard key={cartera.id||cartera.clienteId} cartera={cartera} rol={user?.role||'vendedor'} fmt={fmt}
                      onRecaudar={(c: any) => { setModalRecaudoRapido(false); setLineasPago([crearLinea()]); setRecaudandoCartera(c); cargarDetalleCartera({ ...c, clienteId: c.clienteId || c.cliente?.id || c.id }) }}
                      onWhatsApp={abrirWhatsApp} variant="modal" />
                  ))}
                </>
              ) : rrVerificando ? (
                <div className="py-8 text-center"><p className="text-zinc-400 text-sm">Verificando deuda de {rrCliente.nombre}...</p></div>
              ) : rrSinDeuda ? (
                <div className="space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <p className="text-white font-semibold text-base">{rrCliente.nombre}</p>
                    {rrCliente.direccion && <p className="text-zinc-400 text-xs mt-0.5">{rrCliente.direccion}</p>}
                    <div className="mt-3 inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-bold px-3 py-1 rounded-full"><span>✓</span><span>Al día</span></div>
                    <p className="text-zinc-500 text-xs mt-2">Sin saldo pendiente</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([{tipo:'visita',label:'Visita',icon:'👁️',color:'bg-zinc-700 hover:bg-zinc-600'},{tipo:'venta',label:'Venta',icon:'💰',color:'bg-emerald-600 hover:bg-emerald-500'},{tipo:'entrega',label:'Entrega',icon:'📦',color:'bg-orange-600 hover:bg-orange-500'}] as const).map(op => (
                      <button key={op.tipo} onClick={() => { setModalRecaudoRapido(false); setClienteInicialLibre(rrCliente); abrirModalVisita(op.tipo) }}
                        className={`${op.color} text-white font-semibold py-3 rounded-xl text-sm transition-colors flex flex-col items-center gap-1`}>
                        <span className="text-lg">{op.icon}</span><span>{op.label}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setRrCliente(null); setRrSinDeuda(false) }} className="w-full bg-black border border-blue-500/20 text-zinc-400 hover:text-white text-sm py-2 rounded-xl transition-colors">← Cambiar cliente</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal Pago Cartera */}
      {recaudandoCartera && (
        <ModalRecaudo
          cartera={recaudandoCartera} detalleData={detalleData} loadingDetalle={loadingDetalle}
          lineasPago={lineasPago} facturasSeleccionadas={facturasSeleccionadas}
          procesando={guardandoPago} fmt={fmt}
          onClose={() => { setRecaudandoCartera(null); setDetalleData(null); setLineasPago([crearLinea()]); setDescuentosPorFactura({}); setFacturasSeleccionadas([]) }}
          onSetLineasPago={setLineasPago} onSetFacturasSeleccionadas={setFacturasSeleccionadas}
          descuentosPorFactura={descuentosPorFactura} onSetDescuentosPorFactura={setDescuentosPorFactura}
          onSubirVoucher={subirVoucherArchivo} onConfirmar={registrarPago} crearLinea={crearLinea}
        />
      )}
    </div>
  )
}
// MARCADOR_PRUEBA_1782852113
