'use client'
import React from 'react'

class ErrorBoundary extends React.Component<{children: React.ReactNode},{err:any}> {
  constructor(p: any) { super(p); this.state = {err: null} }
  static getDerivedStateFromError(e: any) { return {err: e} }
  render() {
    if (this.state.err) return (
      <div className="flex items-center justify-center min-h-screen">
        <div style={{padding:16,color:'#fff',background:'#1a0000',margin:16,borderRadius:8,border:'1px solid #f00',fontSize:11,wordBreak:'break-all'}}>
          <b>ERR:</b> {String(this.state.err?.message||this.state.err)}<br/>
          <small>{String(this.state.err?.stack||'').slice(0,300)}</small>
        </div>
      </div>
    )
    return this.props.children
  }
}
import { fetchApi, errorMsg } from '@/lib/fetchApi'
import InputMoneda from '@/components/InputMoneda'
import { useSession } from 'next-auth/react'
import { loadSnapshot } from '@/lib/dashboardSnapshot'
import { useGpsEnDemanda } from '@/components/useGpsEnDemanda'
import { GpsIndicator } from '@/components/GpsIndicator'
import { estadoMasCritico } from '@/lib/cartera'
import { useEffect, useState, useRef } from 'react'
import { CountUp, LiveDot, SkeletonCard, LoadingBorder } from '@/components/FX'
import type { VendedorStats, TurnoActivo } from '@/lib/types/vendedor'
import type { AdminStats } from '@/lib/types/admin'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CardKPI, CardKPIGroup, CardDark, CardSub, CardCountAdmin, CardCountAdminSkeleton } from '@/components/ui/cards'
import dynamic from 'next/dynamic'

// Lazy — solo cargan cuando se necesitan
const FirmaCanvas = dynamic(() => import('@/components/FirmaCanvas'), { ssr: false })
const ModalVisita = dynamic(() => import('@/components/ModalVisita'), { ssr: false })
const CarteraCard = dynamic(() => import('@/components/CarteraCard'), { ssr: false })
const ModalRecaudo = dynamic(() => import('@/components/ModalRecaudo'), { ssr: false })
const EntregaCard = dynamic(() => import('@/components/EntregaCard'), { ssr: false })
const DashboardVendedor = dynamic(() => import('./_components/DashboardVendedor'), {
  ssr: false,
  loading: () => (
    <div className="space-y-3 pb-20">
      {/* Pill turno */}
      <div className="animate-pulse rounded-2xl" style={{height:44,background:'rgba(148,160,185,0.15)',border:'1px solid rgba(148,180,255,0.12)'}} />
      {/* 4 cards stats */}
      <div className="grid grid-cols-2 gap-3">
        {[0,1].map(i => <div key={i} className="animate-pulse rounded-2xl" style={{height:110,background:'rgba(148,160,185,0.12)',border:'1px solid rgba(148,180,255,0.10)'}} />)}
      </div>
      <div className="animate-pulse rounded-2xl" style={{height:80,background:'rgba(148,160,185,0.12)'}} />
      <div className="animate-pulse rounded-2xl" style={{height:80,background:'rgba(148,160,185,0.12)'}} />
    </div>
  )
})
const DashboardBodega    = dynamic(() => import('./_components/DashboardBodega'), {
  ssr: false,
  loading: () => (
    <div className="space-y-3 pb-20">
      <div className="animate-pulse rounded-2xl" style={{height:44,background:'rgba(148,160,185,0.15)',border:'1px solid rgba(148,180,255,0.12)'}} />
      <div className="animate-pulse rounded-2xl" style={{height:96,background:'rgba(148,160,185,0.12)'}} />
      <div className="animate-pulse rounded-2xl" style={{height:96,background:'rgba(148,160,185,0.12)'}} />
    </div>
  )
})
const DashboardEntregas  = dynamic(() => import('./_components/DashboardEntregas'), {
  ssr: false,
  loading: () => (
    <div className="space-y-3 pb-20">
      <div className="animate-pulse rounded-2xl" style={{height:44,background:'rgba(148,160,185,0.15)',border:'1px solid rgba(148,180,255,0.12)'}} />
      <div className="animate-pulse rounded-2xl" style={{height:96,background:'rgba(148,160,185,0.12)'}} />
      <div className="animate-pulse rounded-2xl" style={{height:96,background:'rgba(148,160,185,0.12)'}} />
    </div>
  )
})
const DashboardAdmin     = dynamic(() => import('./_components/DashboardAdmin'), {
  ssr: false,
  loading: () => (
    <div className="space-y-3 pb-20">
      <div className="animate-pulse rounded-2xl" style={{height:44,background:'rgba(148,160,185,0.15)',border:'1px solid rgba(148,180,255,0.12)'}} />
      <div className="animate-pulse rounded-2xl" style={{height:96,background:'rgba(148,160,185,0.12)'}} />
      <div className="animate-pulse rounded-2xl" style={{height:96,background:'rgba(148,160,185,0.12)'}} />
    </div>
  )
})

type LineaPago = { id: string; metodoPago: 'efectivo' | 'transferencia'; monto: string; voucherKey: string | null; voucherDatosIA: any; cargandoVoucher: boolean }
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16) })
}
function crearLinea(): LineaPago { return { id: genId(), metodoPago: 'efectivo', monto: '', voucherKey: null, voucherDatosIA: null, cargandoVoucher: false } }
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const fmtShort = (n: number): string => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' mill'
  if (n >= 1_000)     return '$' + (n / 1_000).toLocaleString('es-CO',     { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' K'
  return '$' + Math.round(n).toLocaleString('es-CO')
}
const RR_LIMIT = 10

function DashboardPageInner() {
  const { data: session } = useSession()
  const user = session?.user as any
  const router = useRouter()
  const [stats, setStats] = useState<Partial<AdminStats>>({ empleados: 0, clientes: 0, visitasHoy: 0, enTurno: 0 })
  const [ruta, setRuta] = useState<any>(null)
  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  const [cargandoTurno, setCargandoTurno] = useState(true)
  const [tiempoTurno, setTiempoTurno] = useState('')
  const [statsVendedor, setStatsVendedor] = useState<VendedorStats | null>(null)
  const [visitasRuta, setVisitasRuta] = useState<any[]>([])
  const [resumenFinanciero, setResumenFinanciero] = useState<any>(null)
  const [monitor, setMonitor] = useState<any[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const [empresaDetalleSA, setEmpresaDetalleSA] = useState<string | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [vendedorStatsLoading, setVendedorStatsLoading] = useState(true)
  const [mostrarEstadisticas, setMostrarEstadisticas] = useState(false)
  const [mostrarEstadisticasVendedor, setMostrarEstadisticasVendedor] = useState(false)
  const [mostrarImpulsadoras, setMostrarImpulsadoras] = useState(false)
  const [modalVisita, setModalVisita] = useState<{open: boolean, tipo: string}>({open: false, tipo: 'visita'})
  const [clienteModal, setClienteModal] = useState<any>(null)
  const [ordenesEntregadas, setOrdenesEntregadas] = useState<Set<string>>(new Set())
  const [distanciaLejos, setDistanciaLejos] = useState(false)
  const [clientesOrdenados, setClientesOrdenados] = useState<any[]>([])
  const [puedeCapturarGps, setPuedeCapturarGps] = useState(false)
  const [clienteInicialLibre, setClienteInicialLibre] = useState<any>(null)

  // Recaudo Rápido
  const [modalRecaudoRapido, setModalRecaudoRapido] = useState(false)
  const [rrBuscar, setRrBuscar] = useState('')
  const [rrClientes, setRrClientes] = useState<any[]>([])
  const [rrTotal, setRrTotal] = useState(0)
  const [rrPage, setRrPage] = useState(1)
  const [rrLoadingCli, setRrLoadingCli] = useState(false)
  const [rrCartera, setRrCartera] = useState<any[]>([])
  const [rrLoadingCartera, setRrLoadingCartera] = useState(false)
  const [rrBuscarCartera, setRrBuscarCartera] = useState('')
  const [rrCliente, setRrCliente] = useState<any>(null)
  const [rrVerificando, setRrVerificando] = useState(false)
  const [rrSinDeuda, setRrSinDeuda] = useState(false)
  // Modal pago cartera
  const [recaudandoCartera, setRecaudandoCartera] = useState<any>(null)
  const [detalleData, setDetalleData] = useState<any>(null)
  const gpsRecaudo = useGpsEnDemanda()
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [facturasSeleccionadas, setFacturasSeleccionadas] = useState<string[]>([])
  const [lineasPago, setLineasPago] = useState<LineaPago[]>([crearLinea()])
  const [descuentosPorFactura, setDescuentosPorFactura] = useState<Record<string,string>>({})
  const [notasPago, setNotasPago] = useState('')
  const [guardandoPago, setGuardandoPago] = useState(false)
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())

  const [montoVisita, setMontoVisita] = useState('')
  const [notaVisita, setNotaVisita] = useState('')
  const [facturaVisita, setFacturaVisita] = useState('')
  const [firmaVisita, setFirmaVisita] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [bloqueadoTurno, setBloqueadoTurno] = useState(false)
  const [montado, setMontado] = useState(false)
  const [mostrarPausa, setMostrarPausa] = useState(false)
  const [turnoExpandido, setTurnoExpandido] = useState(false)
  const lastPulseTs = useRef<number>(0) // último pulse sync procesado

  // ── Cache sessionStorage — datos persisten entre navegaciones ──────────────
  // Solo carga frescos si viene del login o si el cache expiró (10 min)
  const CACHE_KEY = 'inicio_cache'
  const CACHE_TTL = 10 * 60 * 1000 // 10 minutos

  const CACHE_TTL_CONTADORES = 2 * 60 * 1000   // bodega: 2min
  const CACHE_TTL_INTEGRACION = 5 * 60 * 1000  // integracion: 5min
  const CACHE_TTL_PRECIOS = 30 * 60 * 1000     // precios: 30min

  function getCached() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const { ts, data } = JSON.parse(raw)
      if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null }
      return { ...data, ts }
    } catch { return null }
  }

  function setCached(patch: Record<string, any>) {
    try {
      const prev = getCached() || {}
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: { ...prev, ...patch } }))
    } catch {}
  }

  function vieneDelLogin() {
    try {
      return document.referrer.includes('/login') || sessionStorage.getItem(CACHE_KEY) === null
    } catch { return true }
  }
  const [pausaMotivo, setPausaMotivo] = useState('Almuerzo')
  const [pausaMotivoCustom, setPausaMotivoCustom] = useState('')
  const [pausaDuracion, setPausaDuracion] = useState(60)
  const [pausaDuracionCustom, setPausaDuracionCustom] = useState(false)
  const [tiempoPausa, setTiempoPausa] = useState('')
  const [pausaCountdown, setPausaCountdown] = useState('')
  const refRuta = useRef<HTMLDivElement>(null)
  const [obteniendoGps, setObteniendoGps] = useState(false)
  const isEmpleado = ['vendedor', 'impulsadora', 'entregas'].includes(user?.role)
  const isImpulsadora = user?.role === 'impulsadora'
  const [bodegaStats, setBodegaStats] = useState<any>(null)
  const [resumenCartera, setResumenCartera] = useState<any>(null)
  const isEmpresa = user?.role === 'empresa'
  const isSupervisor = user?.role === 'supervisor'
  const isBodega = user?.role === 'bodega'
  // Prefetch silencioso — 3s después del primer render
  useEffect(() => {
    const t = setTimeout(() => {
      import('@/components/ModalRecaudo').catch(() => {})
      import('@/components/ModalVisita').catch(() => {})
      import('@/components/CarteraCard').catch(() => {})
      import('@/components/EntregaCard').catch(() => {})
      import('@/components/FirmaCanvas').catch(() => {})
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!turno) return

    // Calcular el tiempo inmediatamente al montar — evita animación desde 0 en refresh
    const calcTiempo = () => {
      const inicio = new Date(turno.inicio)
      const ahora = new Date(Date.now() - 5*60*60*1000)
      const diff = Math.max(0, Math.floor((ahora.getTime() - inicio.getTime()) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0')
    }
    setTiempoTurno(calcTiempo()) // valor inicial inmediato

    const interval = setInterval(() => {
      const inicio = new Date(turno.inicio)
      const ahora = new Date(Date.now() - 5*60*60*1000)
      const diff = Math.max(0, Math.floor((ahora.getTime() - inicio.getTime()) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setTiempoTurno(String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0'))
      // Pausa
      if (turno.pausado && turno.pausaInicio && turno.pausaDuracionMin) {
        const pausaIni = new Date(turno.pausaInicio).getTime()
        const pausaFin = pausaIni + turno.pausaDuracionMin * 60000
        const ahora2 = Date.now()
        const transcurrido = Math.floor((ahora2 - pausaIni) / 1000)
        const restante = Math.max(0, Math.floor((pausaFin - ahora2) / 1000))
        const tp_m = Math.floor(transcurrido / 60); const tp_s = transcurrido % 60
        setTiempoPausa(String(tp_m).padStart(2,'0') + ':' + String(tp_s).padStart(2,'0'))
        const r_m = Math.floor(restante / 60); const r_s = restante % 60
        setPausaCountdown(String(r_m).padStart(2,'0') + ':' + String(r_s).padStart(2,'0'))
        if (restante === 0) reanudarTurno()
      }
    }, 1000)
    return () => clearInterval(interval)

  }, [turno])
  useEffect(() => {
    if (!user) return
    if (user.role === 'vendedor') return // DashboardVendedor maneja sus propios effects
    if (user.role === 'superadmin') {
      // Precios — cache 30min, casi estático
      const cachedPrecios = getCached()
      if (cachedPrecios?.resumenFinanciero && (Date.now() - (cachedPrecios.ts||0)) < CACHE_TTL_PRECIOS) {
        setResumenFinanciero(cachedPrecios.resumenFinanciero)
      } else {
        fetch('/api/precios').then(r => r.json()).then(d => { setResumenFinanciero(d); setCached({ resumenFinanciero: d }) })
      }
      return
    }
    if (isImpulsadora) { router.push('/impulsadora'); return }
    if (isEmpleado) {
      // ── PRIORIDAD 1: turno + me — lo más urgente, muestra UI inmediatamente ──
      Promise.all([
        fetch('/api/turnos').then(r => r.json()),
        fetch('/api/me').then(r => r.json()),
      ]).then(([t, me]) => {
        setTurno(t)
        setCargandoTurno(false)
        if (!t) setTurnoExpandido(false)
        setPuedeCapturarGps(me?.puedeCapturarGps === true)
      })

      // ── PRIORIDAD 2: ruta + stats — en background, no bloquea el turno ──
      fetch('/api/rutas/mi-ruta').then(r => r.json()).then(r => {
        setRuta(r)
        setClientesOrdenados(r?.clientes?.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null, rezago: rc.rezago, orden: rc.orden, notas: rc.notas || null, ordenDespachoId: rc.ordenDespachoId || null, numeroFactura: (rc as any).numeroFactura || null, empresaOrigen: (rc as any).empresaOrigen || null, alistadoPor: (rc as any).alistadoPor || null, asignadoEn: rc.asignadoEn || null, ordenCreadaEl: (rc as any).ordenCreadaEl || null })) || [])
      }).catch(() => {})

      if (user.role === 'vendedor') {
        // Si viene del login o no hay cache → carga fresca
        // Si navega de vuelta desde otro módulo → usa cache sin re-fetch
        const cached = getCached()
        const desdLogin = vieneDelLogin()
        if (cached && !desdLogin) {
          // Mostrar inmediatamente desde cache
          if (cached.statsVendedor)  { setStatsVendedor(cached.statsVendedor); lastPulseTs.current = cached.ts || 0 }
          if (cached.resumenCartera) setResumenCartera(cached.resumenCartera)
          setLoadingStats(false)
          setVendedorStatsLoading(false)
        }
        // Refrescar en background si expiró o viene del login
        const debeRefrescar = desdLogin || !cached?.statsVendedor || (Date.now() - (cached?.ts||0)) > CACHE_TTL
        if (debeRefrescar) {
          setLoadingStats(true)
          fetch('/api/vendedor/stats').then(r => r.json()).catch(() => null).then(stats => {
            if (stats && !stats.error) { setStatsVendedor(stats); lastPulseTs.current = Date.now(); setCached({ statsVendedor: stats }) }
            setVendedorStatsLoading(false)
          })
          fetch('/api/cartera/resumen').then(r => r.json()).catch(() => null).then(cartera => {
            if (cartera) { setResumenCartera(cartera); setCached({ resumenCartera: cartera }) }
            setLoadingStats(false)
          })
        }
      }
      // (el histórico se carga al presionar Estadísticas si no estaba cargado)
    } else {
      // Paralelo: stats + integracion + bodega en un solo round-trip
      const adminFetches: Promise<any>[] = [
        fetch('/api/stats').then(r => r.json()).catch(() => null),
      ]
      if (isEmpresa || isSupervisor) adminFetches.push(fetch('/api/integracion/estado').then(r => r.json()).catch(() => null))
      if (isEmpresa || isSupervisor || isBodega) adminFetches.push(fetch('/api/bodega/contadores').then(r => r.json()).catch(() => null))
      adminFetches.push(fetch('/api/cartera/resumen').then(r => r.json()).catch(() => null))

      // Mostrar desde cache inmediatamente si existe
      const cachedAdmin = getCached()
      if (cachedAdmin && !vieneDelLogin()) {
        if (cachedAdmin.stats) setStats(cachedAdmin.stats)
        if (cachedAdmin.bodegaStats) setBodegaStats(cachedAdmin.bodegaStats)
        if (cachedAdmin.resumenCartera) setResumenCartera(cachedAdmin.resumenCartera)
      }
      // Siempre refrescar en background
      Promise.all(adminFetches).then(([stats, integracion, bodega, cartera]) => {
        if (stats) { setStats(stats); setCached({ stats }) }
        if (bodega) {
          const b = { pendientes: bodega.pendientes ?? 0, alistados: bodega.alistados ?? 0, entregados: bodega.entregados ?? 0 }
          setBodegaStats(b)
          setCached({ bodegaStats: b })
        }
        if (cartera) { setResumenCartera(cartera); setCached({ resumenCartera: cartera }) }
      })
    }
  }, [user])
  // visibilitychange vendedor → manejado en DashboardVendedor.tsx (evitar doble listener)

  async function cargarStatsVendedor() {
    setMostrarEstadisticasVendedor(prev => !prev)
    // statsVendedor ya se cargó al montar — no recargar
  }

  async function cargarEstadisticas() {
    setMostrarEstadisticas(prev => !prev)
    if (!mostrarEstadisticas) {
      setLoadingStats(true)
      try {
        const d = await fetch('/api/stats').then(r => r.json())
        setStats(d)
      } catch {}
      setLoadingStats(false)
    }
  }

  async function dispararSync() {
    setSincronizando(true)
    try {
      await fetch('/api/integracion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'delta' })
      })
      // recargar stats
      fetch('/api/stats').then(r => r.json()).then(d => setStats(d)).catch(() => {})
    } catch {}
    setSincronizando(false)
  }


  async function iniciarTurno() {
    if (bloqueadoTurno) return
    setBloqueadoTurno(true)
    const ubicacion = await getUbicacion()
    const res = await fetchApi('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'iniciar', ...ubicacion })
    })
    if (res?.ok) { setTurnoExpandido(false); setTurno(res.turno) }
    setBloqueadoTurno(false)
  }

  async function cerrarTurno() {
    if (bloqueadoTurno) return
    setBloqueadoTurno(true)
    const ubicacion = await getUbicacion()
    await fetchApi('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'cerrar', ...ubicacion })
    })
    setTurno(null)
    setBloqueadoTurno(false)
  }

  async function pausarTurno() {
    const motivo = pausaMotivo === 'Otro' ? pausaMotivoCustom : pausaMotivo
    await fetchApi('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'pausar', motivo, duracionMin: pausaDuracion })
    })
    setTurno((prev: any) => prev ? { ...prev, pausado: true, pausaInicio: new Date().toISOString(), pausaMotivo: motivo, pausaDuracionMin: pausaDuracion } : prev)
    setMostrarPausa(false)
  }

  async function reanudarTurno() {
    await fetchApi('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'reanudar' })
    })
    setTurno((prev: any) => prev ? { ...prev, pausado: false, pausaInicio: null, pausaMotivo: null, pausaDuracionMin: null } : prev)
  }


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

  function abrirModalVisita(tipo: string) {
    setModalVisita({ open: true, tipo })
  }

  async function rrLoadCartera(q: string) {
    setRrLoadingCartera(true)
    const data = await fetchApi(`/api/cartera?q=${encodeURIComponent(q)}&limit=50`)
    setRrCartera(data?.carteras || data?.cartera || [])
    setRrLoadingCartera(false)
  }

  async function rrLoadClientes(q: string, p: number) {
    setRrLoadingCli(true)
    const data = await fetchApi(`/api/clientes?q=${encodeURIComponent(q)}&page=${p}&limit=${RR_LIMIT}`)
    setRrClientes(data?.clientes || [])
    setRrTotal(data?.total || 0)
    setRrLoadingCli(false)
  }

  function abrirModalRecaudoRapido() {
    setModalRecaudoRapido(true)
    setRrBuscar(''); setRrPage(1); setRrCliente(null); setRrSinDeuda(false)
    setRrBuscarCartera('')
    setRrCartera([])  // no cargar hasta que el vendedor busque
  }

  function abrirWhatsApp(cartera: any) {
    const telefono = (cartera.telefono || cartera.cliente?.celular || '').replace(/\D/g, '')
    if (!telefono) { alert('Cliente sin teléfono'); return }
    const deudas = (cartera.DetalleCartera || cartera.deudas || [])
      .filter((d: any) => d.estado !== 'pagada' && Number(d.saldo ?? d.saldoPendiente ?? 0) > 0)
    const total = deudas.reduce((s: number, d: any) => s + Number(d.saldo ?? d.saldoPendiente ?? 0), 0)
    const nombre = cartera.nombre || cartera.cliente?.nombre || ''
    const msg = `Hola ${nombre}, te recordamos que tienes una deuda pendiente de $${Math.round(total).toLocaleString('es-CO')}. Por favor comunícate con nosotros para gestionar tu pago. Gracias.`
    window.open(`https://wa.me/57${telefono}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  useEffect(() => {
    if (detalleData) gpsRecaudo.iniciar()
    else gpsRecaudo.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalleData])

  async function cargarDetalleCartera(cartera: any) {
    setLoadingDetalle(true)
    const res = await fetch(`/api/cartera/${cartera.clienteId}`)
    const data = await res.json()
    setLoadingDetalle(false)
    const dc = data.cartera
    if (!dc) { setDetalleData(null); return }
    const { calcularEstado } = await import('@/lib/cartera')
    dc.DetalleCartera = (dc.deudas || []).map((d: any) => ({
      id: d.externalId,
      syncDeudaId: d.id,
      valorFactura: d.valor,
      abonos: d.valor - d.saldoReal,
      saldoPendiente: d.saldoReal,
      ...(() => {
        const saldo = Math.max(0, d.saldoReal)
        const vf = Number(d.valor || 0)
        const ab = vf - saldo
        const fv = d.fechaVencimiento ? new Date(d.fechaVencimiento) : null
        const { estado, label, color } = calcularEstado(saldo, vf, ab, fv)
        return { estado, estadoLabel: label, estadoColor: color }
      })(),
      numeroFactura: d.numeroFactura || d.numeroOrden,
      fechaVencimiento: d.fechaVencimiento,
      _sync: true,
    }))
    setDetalleData(dc)
    const pendientes = (dc.DetalleCartera || [])
      .filter((d: any) => d.estado !== 'pagada')
      .sort((a: any, b: any) => {
        const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity
        const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity
        return fa - fb
      })
    setFacturasSeleccionadas(pendientes[0]?.id ? [pendientes[0].id] : [])
    setLineasPago([crearLinea()])
  }

  async function rrSeleccionarCliente(cliente: any) {
    setRrCliente(cliente)
    setRrVerificando(true)
    const res = await fetch(`/api/cartera/${cliente.id}`)
    const data = await res.json()
    setRrVerificando(false)
    const cartera = data.cartera
    if (cartera && Number(cartera.saldoTotal) > 0) {
      setModalRecaudoRapido(false)
      setRecaudandoCartera(cartera)
      setNotasPago('')
      cargarDetalleCartera({ ...cartera, clienteId: cliente.id })
    } else {
      setRrSinDeuda(true)
    }
  }

  async function subirVoucherArchivo(lineaId: string, file: File) {
    setLineasPago(prev => prev.map(l => l.id === lineaId ? { ...l, cargandoVoucher: true } : l))
    try {
      const archivoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/cartera/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoBase64, mimeType: file.type, pagoId: genId() }),
      })
      const d = await res.json()
      setLineasPago(prev => prev.map(l => l.id === lineaId ? {
        ...l, voucherKey: d.key, voucherDatosIA: d.datosIA, cargandoVoucher: false,
        monto: d.datosIA?.valor ? String(Math.round(d.datosIA.valor)) : l.monto,
      } : l))
    } catch {
      alert('Error al procesar el comprobante')
      setLineasPago(prev => prev.map(l => l.id === lineaId ? { ...l, cargandoVoucher: false } : l))
    }
  }

  async function registrarPago() {
    if (!detalleData) return
    const total = lineasPago.reduce((s, l) => s + Number(l.monto || 0), 0)
    if (total === 0) return

    // Esperar GPS si todavia esta buscando
    let gpsCoords: { lat: number; lng: number } | null = null
    if (gpsRecaudo.estado === 'ok' && gpsRecaudo.pos) {
      gpsCoords = { lat: gpsRecaudo.pos.lat, lng: gpsRecaudo.pos.lng }
    } else if (gpsRecaudo.estado === 'buscando') {
      const pp = await gpsRecaudo.obtener()
      if (pp) gpsCoords = { lat: pp.lat, lng: pp.lng }
    }

    setGuardandoPago(true)
    let ultimoToken: string | null = null
    const idempotencyKey = crypto.randomUUID()
    const lineasValidas = lineasPago
      .filter(l => Number(l.monto || 0) > 0)
      .map(l => ({
        metodoPago: l.metodoPago,
        monto: Number(l.monto || 0),
        voucherKey: l.voucherKey || null,
        voucherDatosIA: l.voucherDatosIA || null,
      }))
    const montoTotal = lineasValidas.reduce((s, l) => s + l.monto, 0)
    const descuentoTotal = Object.values(descuentosPorFactura).reduce((s, v) => s + Number(v || 0), 0)

    const res = await fetch('/api/cartera/pago-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        clienteApiId: detalleData.cliente?.apiId || detalleData.clienteApiId || detalleData.apiId,
        syncDeudaIds: facturasSeleccionadas,
        monto: montoTotal,
        descuento: descuentoTotal,
        descuentosPorFactura: Object.fromEntries(
          Object.entries(descuentosPorFactura).map(([k, v]) => [k, Number(v || 0)])
        ),
        metodoPago: lineasValidas.length === 1 ? lineasValidas[0].metodoPago : 'mixto',
        notas: notasPago || undefined,
        lineasPago: lineasValidas,
        ...(gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng, gpsAccuracy: gpsRecaudo.pos?.accuracy ?? null } : {}),
      })
    })
    const d = await res.json()
    if (d.pago?.reciboToken) ultimoToken = d.pago.reciboToken
    setGuardandoPago(false)
    if (ultimoToken) window.open('/recaudo/recibo?token=' + ultimoToken, '_blank')
    setRecaudandoCartera(null)
    setLineasPago([crearLinea()])
    setDescuentosPorFactura({})
    setNotasPago('')
  }



  // ── Router de roles — early return antes de montar código de otros roles ──
  // Si sesión no hidratada — mostrar snapshot del último render inmediatamente
  if (!user) {
    const snap = typeof window !== 'undefined' ? loadSnapshot() : null
    if (snap) return <DashboardVendedor user={null} _snapshot={snap} />
    return (
      <div className="space-y-3 pb-20">
        <div className="rounded-2xl" style={{height:44,background:'rgba(148,160,185,0.10)',border:'1px solid rgba(148,180,255,0.08)'}} />
        <div className="grid grid-cols-2 gap-3">
          {[0,1].map(i => <div key={i} className="rounded-2xl" style={{height:110,background:'rgba(148,160,185,0.08)'}} />)}
        </div>
        <div className="rounded-2xl" style={{height:80,background:'rgba(148,160,185,0.08)'}} />
        <div className="rounded-2xl" style={{height:80,background:'rgba(148,160,185,0.08)'}} />
      </div>
    )
  }
  if (user.role === 'vendedor')    return <DashboardVendedor user={user} />
  if (user.role === 'bodega')      return <DashboardBodega user={user} />
  if (user.role === 'impulsadora') { router.push('/impulsadora'); return null }
  if (user.role === 'entregas')     return <DashboardEntregas user={user} />
  if (['empresa','supervisor','superadmin'].includes(user.role)) return <DashboardAdmin user={user} />

  const clientesConGps = clientesOrdenados.filter((c: any) => c.ubicacionReal).length
  const totalClientes = clientesOrdenados.length
  const hoyStrRuta = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
  const fechaRuta = ruta?.fecha ? new Date(new Date(ruta.fecha).getTime() - 5*60*60*1000).toISOString().split('T')[0] : hoyStrRuta
  const ejecutadosRuta = clientesOrdenados.filter((c: any) =>
    visitasRuta.some((v: any) => {
      if (v.clienteId !== c.id) return false
      const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      return fv === fechaRuta
    })
).length || 0
  const rutaCompletada = totalClientes > 0 && ejecutadosRuta >= totalClientes
  if (user?.role === 'superadmin') {
    const totalMensual = resumenFinanciero?.resumenEmpresas?.reduce((a: number, e: any) => a + e.total, 0) || 0
    return (
      <div className="space-y-6 pb-20 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">Bienvenido, {user?.name?.split(' ')[0]}</h1>
          <p className="text-zinc-400 text-sm mt-1">Superadmin</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-emerald-400 font-semibold text-lg">💰 Facturación mensual</p>
            <p className="text-zinc-400 text-xs mt-0.5">{resumenFinanciero?.resumenEmpresas?.length || 0} empresa{resumenFinanciero?.resumenEmpresas?.length !== 1 ? 's' : ''} activa{resumenFinanciero?.resumenEmpresas?.length !== 1 ? 's' : ''}</p>
          </div>
          <p className="text-emerald-400 font-bold text-2xl">${totalMensual.toLocaleString('es-CO')}</p>
        </div>
        <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-white font-semibold">Por empresa</p>
          </div>
          {(resumenFinanciero?.resumenEmpresas || []).map((e: any) => (
            <div key={e.id}>
              <button onClick={() => setEmpresaDetalleSA(empresaDetalleSA === e.id ? null : e.id)}
                className="w-full flex items-center justify-between px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🏢</span>
                  <div className="text-left">
                    <p className="text-white text-sm font-medium">{e.nombre}</p>
                    <div className="flex gap-2 mt-0.5">
                      {Object.entries(e.conteo || {}).map(([rol, cant]: any) => (
                        <span key={rol} className="text-zinc-500 text-xs">
                          {rol === 'vendedor' ? '💼' : rol === 'entregas' ? '📦' : rol === 'impulsadora' ? '⭐' : '🔍'}{cant}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold">${e.total.toLocaleString('es-CO')}</p>
                  <span className="text-zinc-500 text-xs">{empresaDetalleSA === e.id ? '▲' : '▼'}</span>
                </div>
              </button>
              {empresaDetalleSA === e.id && (
                <div className="px-4 py-3 border-b space-y-2" style={{"borderColor":"rgba(148,180,255,0.20)"}}>
                  {Object.entries(e.conteo || {}).map(([rol, cant]: any) => {
                    const precio = resumenFinanciero?.precios?.find((p: any) => p.rol === rol)?.precio || 0
                    return (
                      <div key={rol} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">
                          {rol === 'vendedor' ? '💼' : rol === 'entregas' ? '📦' : rol === 'impulsadora' ? '⭐' : '🔍'} {rol} × {cant}
                        </span>
                        <span className="text-white">${(precio * cant).toLocaleString('es-CO')}</span>
                      </div>
                    )
                  })}
                  <div className="border-t border-zinc-700 pt-2 flex justify-between text-sm font-semibold">
                    <span className="text-zinc-300">Total mensual</span>
                    <span className="text-emerald-400">${e.total.toLocaleString('es-CO')}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
          {(!resumenFinanciero?.resumenEmpresas?.length) && (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">Sin empresas activas</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-20 md:pb-0 max-w-5xl mx-auto">
      {!(user?.role === 'vendedor' && turno) && !cargandoTurno && (
        <h1 className="text-2xl font-bold text-white px-1">Bienvenido, {user?.name?.split(' ')[0]}</h1>
      )}
      {(isEmpresa || isSupervisor) && (
        <h1 className="text-2xl font-bold text-white px-1">Bienvenido, {user?.name?.split(' ')[0]}</h1>
      )}
      {(isEmpresa || isSupervisor) && (
        <div className="space-y-6">
          <div className="rounded-2xl" style={{overflow:"hidden",borderRadius:16}}>
          <div className="grid grid-cols-2 gap-3">

            <div className="rounded-2xl p-4 hover-lift card-glass flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">🛍️</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Vendedores</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-white text-2xl font-bold"><CountUp end={stats.vendedoresActivos||0} /></span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold"><CountUp end={stats.totalVendedores||0} /></span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">en turno</span>
                <span className="text-white text-xs">activos</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 hover-lift card-glass flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">⚡</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Impulsos</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-amber-400 text-2xl font-bold"><CountUp end={stats.impulsosActivos||0} /></span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold"><CountUp end={stats.totalImpulsos||0} /></span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">activas</span>
                <span className="text-white text-xs">total</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 hover-lift card-glass flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">📦</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Órdenes hoy</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-emerald-400 text-2xl font-bold"><CountUp end={stats.ordenesDespachadasHoy||0} /></span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold"><CountUp end={stats.ordenesFact||0} /></span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">despacho</span>
                <span className="text-white text-xs">facturas</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 hover-lift card-glass flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">💰</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Recaudado</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-blue-400 text-2xl font-bold"><CountUp end={stats.recaudoHoy||0} prefix="$" /></span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold"><CountUp end={stats.recaudoMes||0} prefix="$" /></span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">hoy</span>
                <span className="text-white text-xs">mes</span>
              </div>
            </div>

          </div>
          </div>

          {/* Botón Estadísticas */}
          <button
            onClick={cargarEstadisticas}
            style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25)',borderRadius:16,width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer'}}>
            <span className="text-white font-semibold text-sm">📊 Estadísticas</span>
            <span className="text-zinc-500 text-xs">{mostrarEstadisticas ? '▲ Ocultar' : '▼ Ver'}</span>
          </button>

          {mostrarEstadisticas ? (
          <div className="md:grid md:grid-cols-2 md:gap-6 space-y-6 md:space-y-0" style={{}}>
          <div className="space-y-6">
          {stats.visitasPorDia && stats.visitasPorDia.length > 0 && (
            <div className="rounded-2xl p-4 card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <p className="text-white font-semibold text-sm mb-4">Visitas últimos 7 días</p>
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...(stats.visitasPorDia || []).map((d: any) => d.cantidad), 1)
                  return (stats.visitasPorDia || []).map((d: any) => (
                    <div key={d.dia} className="flex items-center gap-3">
                      <div className="text-zinc-500 text-xs w-16 flex-shrink-0">{d.dia}</div>
                      <div className="flex-1 bg-zinc-800 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: ((d.cantidad / max) * 100) + '%' }} />
                      </div>
                      <div className="text-white text-xs w-4 text-right">{d.cantidad}</div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}
          {stats.topEmpleados && stats.topEmpleados.length > 0 && (
            <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-white font-semibold text-sm">Top vendedores - 30 dias</p>
              </div>
              {(stats.topEmpleados || []).map((e: any, i: number) => (
                <div key={e.nombre} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{e.nombre}</p>
                    <p className="text-zinc-500 text-xs">{e.ventas} ventas</p>
                  </div>
                  <p className="text-emerald-400 font-semibold text-sm">{"$" + e.monto.toLocaleString('es-CO')}</p>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl p-4 card-glass flex items-center justify-between" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
            <div>
              <p className="text-white font-semibold">Rutas activas</p>
              <p className="text-zinc-500 text-xs mt-0.5">Sin cerrar</p>
            </div>
            <p className="text-2xl font-bold text-white">{stats.rutasActivas || 0}</p>
          </div>
          </div>
          <div className="space-y-6">
          {/* Monitor empleados en turno */}
          {monitor.length > 0 && (
            <div className="space-y-4">
              {['vendedor', 'impulsadora', 'entregas'].map(rol => {
                const empleadosRol = monitor.filter((m: any) => m.rol === rol)
                if (empleadosRol.length === 0) return null
                const titulo = rol === 'vendedor' ? 'Vendedores' : rol === 'impulsadora' ? 'Impulsadoras' : 'Entregas'
                return (
                  <div key={rol} className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
                    <div className="px-4 py-3 border-b border-zinc-800">
                      <p className="text-white font-semibold text-sm">{titulo} en turno</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{background:"#0d1220",borderBottom:"1px solid #1e2a3d"}}>
                            <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:'white',textAlign:'left',whiteSpace:'nowrap' as const,overflow:'hidden' as const}}>Empleado</th>
                            <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:'white',textAlign:'left',whiteSpace:'nowrap' as const,overflow:'hidden' as const}}>Inicio turno</th>
                            <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:'white',textAlign:'left',whiteSpace:'nowrap' as const,overflow:'hidden' as const}}>Ultima visita</th>
                            <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:'white',textAlign:'left',whiteSpace:'nowrap' as const,overflow:'hidden' as const}}>Proximo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empleadosRol.map((m: any) => (
                            <tr key={m.empleado} style={{background:"#141c2e",borderBottom:"1px solid #1e2a3d"}}>
                              <td className="px-3 py-2">
                                <p className="text-white font-medium whitespace-nowrap">{m.empleado}</p>
                                {m.ruta && <p className="text-blue-400 mt-0.5">{m.ruta}</p>}
                                {m.totalRuta > 0 && <p className="text-zinc-500">{m.visitados}/{m.totalRuta}</p>}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <p className="text-white">{new Date(m.inicioTurno).toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota'})}</p>
                                {m.latInicio && m.lngInicio && (
                                  <a href={'https://www.google.com/maps?q=' + m.latInicio + ',' + m.lngInicio} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">📍 ver</a>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {m.ultimaVisita ? (
                                  <div>
                                    <p className="text-white whitespace-nowrap">{new Date(m.ultimaVisita.hora).toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota'})} - {m.ultimaVisita.cliente}</p>
                                    <p className="text-zinc-500 capitalize">{m.ultimaVisita.tipo}</p>
                                    {m.ultimaVisita.lat && m.ultimaVisita.lng && (
                                      <a href={'https://www.google.com/maps?q=' + m.ultimaVisita.lat + ',' + m.ultimaVisita.lng} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">📍 ver</a>
                                    )}
                                  </div>
                                ) : <span className="text-zinc-600">Sin visitas</span>}
                              </td>
                              <td className="px-3 py-2">
                                {m.proximoPendiente ? (
                                  <p className="text-emerald-400 whitespace-nowrap">{m.proximoPendiente}</p>
                                ) : <span className="text-zinc-600">-</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {/* Tabla 7 dias x vendedor */}
          {stats.vendedores7 && stats.vendedores7.length > 0 && (
            <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-white font-semibold text-sm">Visitas por vendedor - ultimos 7 dias</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{background:"#0d1220",borderBottom:"1px solid #1e2a3d"}}>
                      <th className="px-3 py-2 text-left text-zinc-500 font-medium w-24">Dia</th>
                      {(stats.vendedores7 || []).map((v: string) => (
                        <th key={v} className="px-3 py-2 text-center text-zinc-400 font-medium whitespace-nowrap">{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.tabla7dias || []).map((row: any) => (
                      <tr key={row.dia} style={{background:"#141c2e",borderBottom:"1px solid #1e2a3d"}}>
                        <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{row.dia}</td>
                        {(stats.vendedores7 || []).map((v: string) => (
                          <td key={v} className="px-3 py-2 text-center text-white font-medium">
                            {row[v] > 0 ? row[v] : <span className="text-zinc-700">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* Tabla 7 meses x vendedor */}
          {stats.vendedores7m && stats.vendedores7m.length > 0 && (
            <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-white font-semibold text-sm">Visitas por vendedor - ultimos 7 meses</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{background:"#0d1220",borderBottom:"1px solid #1e2a3d"}}>
                      <th className="px-3 py-2 text-left text-zinc-500 font-medium w-24">Mes</th>
                      {(stats.vendedores7m || []).map((v: string) => (
                        <th key={v} className="px-3 py-2 text-center text-zinc-400 font-medium whitespace-nowrap">{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.tabla7meses || []).map((row: any) => (
                      <tr key={row.mes} style={{background:"#141c2e",borderBottom:"1px solid #1e2a3d"}}>
                        <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{row.mes}</td>
                        {(stats.vendedores7m || []).map((v: string) => (
                          <td key={v} className="px-3 py-2 text-center text-white font-medium">
                            {row[v] > 0 ? row[v] : <span className="text-zinc-700">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>
          </div>
          ) : null}
        </div>
      )}
      {/* bodega → DashboardBodega (componente separado) */}
      {isEmpleado && cargandoTurno && (
        <div className="rounded-2xl px-4 py-3" style={{background:'rgba(148,160,185,0.22)',border:'1px solid rgba(148,180,255,0.25)',height:48}} />
      )}
      {isEmpleado && !cargandoTurno && (
        <div className="space-y-4">
          {turno?.pausado ? (
            // ── PAUSA — encogida/desplegada ──
            <div className="card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25)",borderRadius:16,overflow:"hidden"}}>
              {/* Pill encogida */}
              <button onClick={() => setTurnoExpandido(e => !e)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <span className="relative inline-flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 live-ping" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                </span>
                <span className="font-mono font-bold text-amber-400 text-lg flex-1 tabular-nums">{pausaCountdown}</span>
                <span className="text-zinc-500 text-xs">⏸ {turno.pausaMotivo}</span>
                <span className={`text-zinc-600 text-[10px] transition-transform duration-200 ${turnoExpandido ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {/* Desplegado */}
              {turnoExpandido && (
                <div className="border-t border-amber-500/20 px-4 pb-4 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg p-2" style={{background:'rgba(148,160,185,0.28)',border:'1px solid rgba(148,180,255,0.25)'}}><p className="text-zinc-500 text-xs">Inicio pausa</p><p className="text-sm font-bold text-white">{turno.pausaInicio ? new Date(turno.pausaInicio).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",timeZone: 'America/Bogota'}) : "--"}</p></div>
                    <div className="rounded-lg p-2" style={{background:'rgba(148,160,185,0.28)',border:'1px solid rgba(148,180,255,0.25)'}}><p className="text-zinc-500 text-xs">Reanuda a las</p><p className="text-emerald-400 text-sm font-bold">{turno.pausaInicio && turno.pausaDuracionMin ? new Date(new Date(turno.pausaInicio).getTime() + turno.pausaDuracionMin*60000).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",timeZone: 'America/Bogota'}) : "--"}</p></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={reanudarTurno} className="flex-1 bg-zinc-800 border border-emerald-500/30 text-emerald-400 text-sm font-semibold py-2.5 rounded-xl">▶️ Reanudar</button>
                    <a href="/turno" className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1">📅 Historial</a>
                  </div>
                </div>
              )}
            </div>
          ) : turno ? (
            // ── TURNO ACTIVO ──
            <div className="w-full">
              {/* Pill centrado reducido */}
              <div className="flex justify-center">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 cursor-pointer"
                  style={{
                    background:"rgba(255,255,255,0.08)",
                    border:"1px solid rgba(148,180,255,0.35)",
                    borderBottom: turnoExpandido ? "none" : undefined,
                    borderRadius: turnoExpandido ? "16px 16px 0 0" : "16px"}}
                  onClick={() => setTurnoExpandido(e => !e)}>
                  <span className="relative inline-flex h-2 w-2 flex-shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 live-ping" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="font-mono font-semibold text-emerald-400 text-sm tabular-nums">{tiempoTurno}</span>
                  <span
                    className="w-7 h-7 flex items-center justify-center bg-zinc-800 rounded-lg text-xs"
                    onClick={e => { e.stopPropagation(); setMostrarPausa(m => !m); setTurnoExpandido(true) }}>⏸
                  </span>
                  <span className={`text-zinc-600 text-[10px] transition-transform duration-200 ${turnoExpandido ? 'rotate-180' : ''}`}>▼</span>
                </div>
              </div>
              {/* Desplegado */}
              {turnoExpandido && (
                <div className="w-full fade-up" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(148,180,255,0.35)",borderTop:"1px solid rgba(16,185,129,0.15)",borderRadius:"0 0 16px 16px"}}>
                <div className="px-4 pb-4 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg p-2" style={{background:'rgba(148,160,185,0.28)',border:'1px solid rgba(148,180,255,0.25)'}}><p className="text-zinc-500 text-xs">Hora inicio</p><p className="text-sm font-bold text-white">{new Date(turno.inicio).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",timeZone: 'America/Bogota'})}</p></div>
                    <div className="rounded-lg p-2" style={{background:'rgba(148,160,185,0.28)',border:'1px solid rgba(148,180,255,0.25)'}}><p className="text-zinc-500 text-xs">Contador</p><p className="text-emerald-400 font-mono font-bold">{tiempoTurno}</p></div>
                  </div>
                  <button onClick={cerrarTurno} className="w-full bg-red-600 text-white text-sm font-bold py-2.5 rounded-xl">{bloqueadoTurno ? "..." : "Cerrar turno"}</button>
                  <div className="flex gap-2">
                    <button onClick={() => setMostrarPausa(m => !m)} className={"flex-1 text-sm font-semibold py-2.5 rounded-xl border " + (mostrarPausa ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>⏸️ Pausar</button>
                    <a href="/turno" className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1">📅 Historial</a>
                  </div>
                  {mostrarPausa && (
                    <div className="bg-black/30 rounded-xl p-3 border border-zinc-700">
                      <p className="text-zinc-400 text-xs font-bold mb-2">Motivo</p>
                      <div className="flex gap-2 flex-wrap mb-3">
                        {["Almuerzo","Permiso","Otro"].map(m => <button key={m} onClick={() => setPausaMotivo(m)} className={"px-3 py-1.5 rounded-full text-xs font-semibold border " + (pausaMotivo===m ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>{m === "Almuerzo" ? "🍽️" : m === "Permiso" ? "📝" : "📦"} {m}</button>)}
                      </div>
                      {pausaMotivo === "Otro" && <input value={pausaMotivoCustom} onChange={e => setPausaMotivoCustom(e.target.value)} placeholder="¿Cuál es el motivo?" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white mb-3 outline-none" />}
                      <p className="text-zinc-400 text-xs font-bold mb-2">Tiempo estimado</p>
                      <div className="flex gap-2 flex-wrap mb-3">
                        {[{l:"30 min",v:30},{l:"1 hora",v:60},{l:"2 horas",v:120},{l:"Otro",v:0}].map(t => <button key={t.l} onClick={() => { if(t.v > 0){setPausaDuracion(t.v);setPausaDuracionCustom(false)}else{setPausaDuracionCustom(true)} }} className={"px-3 py-1.5 rounded-full text-xs font-semibold border " + ((!pausaDuracionCustom && pausaDuracion===t.v && t.v>0) || (pausaDuracionCustom && t.v===0) ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>{t.l}</button>)}
                      </div>
                      {pausaDuracionCustom && <input type="number" onChange={e => setPausaDuracion(Number(e.target.value))} placeholder="¿Cuántos minutos?" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white mb-3 outline-none" />}
                      <button onClick={pausarTurno} className="w-full bg-gradient-to-r from-amber-600 to-amber-500 text-white text-sm font-bold py-2 rounded-xl">⏸️ Confirmar pausa</button>
                    </div>
                  )}
                </div>
                </div>
              )}
            </div>
          ) : (
            // ── SIN TURNO — 1 línea full width ──
            <div className="card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25)",borderRadius:16,overflow:"hidden"}}>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <button onClick={iniciarTurno}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
                  ⚡ Iniciar turno
                </button>
                <a href="/turno"
                  className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold px-3 py-2 rounded-xl flex-shrink-0">
                  📅
                </a>
              </div>
            </div>
          )}
          {ruta && totalClientes > 0 && !rutaCompletada ? (
            <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              {/* Header */}
              <div className="px-4 pt-4 pb-3">
                {/* Fila 1: nombre ruta */}
                <p className="text-zinc-400 text-xs font-semibold tracking-wide mb-1 truncate">{ruta.nombre}</p>
                {/* Fila 2: contadores + barra */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xl font-black text-white tabular-nums">{totalClientes}</span>
                    <span className="text-zinc-500 text-xs leading-tight">total</span>
                  </div>
                  <div className="w-px h-6 bg-zinc-700" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xl font-black text-emerald-400 tabular-nums">{ejecutadosRuta}</span>
                    <span className="text-zinc-500 text-xs leading-tight">listos</span>
                  </div>
                  <div className="w-px h-6 bg-zinc-700" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xl font-black text-zinc-400 tabular-nums">{totalClientes - ejecutadosRuta}</span>
                    <span className="text-zinc-500 text-xs leading-tight">pendientes</span>
                  </div>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                    style={{width: totalClientes > 0 ? (ejecutadosRuta/totalClientes*100) + '%' : '0%'}} />
                </div>
              </div>
              {/* Botones */}
              <div className="flex border-t border-zinc-800">
                {user?.role === 'entregas' && turno && (
                  <button onClick={() => abrirModalVisita('entrega')}
                    className="flex-1 flex items-center justify-center gap-2 py-3 text-emerald-400 hover:bg-zinc-800 transition-colors border-r border-zinc-800">
                    <span className="text-lg">📦</span>
                    <span className="text-sm font-semibold">Entrega</span>
                  </button>
                )}
                <button onClick={() => router.push('/mapa-ruta')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-zinc-400 hover:bg-zinc-800 transition-colors">
                  <span className="text-lg">🗺️</span>
                  <span className="text-sm font-semibold">Mapa</span>
                </button>
              </div>
            </div>
          ) : null}
          {user?.role === 'vendedor' && turno && (
              <div className="flex gap-2 w-full slide-down">
                  {[
                    { tipo: 'visita', label: 'Visita', icon: '👁️' },
                    { tipo: 'venta', label: 'Venta', icon: '💰' },
                    { tipo: 'cobro', label: 'Recaudo', icon: '💵' },
                    { tipo: 'entrega', label: 'Entrega', icon: '📦' },
                  ].map(b => (
                    <button key={b.tipo} onClick={() => b.tipo === 'cobro' ? abrirModalRecaudoRapido() : abrirModalVisita(b.tipo)}
                      className="flex-1 card-glass text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex flex-col items-center gap-1"
                      style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25)'}}>
                      <span className="text-lg">{b.icon}</span>
                      <span>{b.label}</span>
                    </button>
                  ))}
              </div>
            )}
          {user?.role === 'entregas' && ruta && ruta.clientes?.length > 0 && (
            <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <p className="text-white font-bold">📦 Ruta de hoy</p>
                <span className="text-zinc-400 text-xs">{ejecutadosRuta}/{totalClientes} entregas</span>
              </div>
              <div className="divide-y divide-zinc-800">
                {clientesOrdenados.sort((a: any, b: any) => a.orden - b.orden).map((c: any) => {
                  const entregado = ordenesEntregadas.has(c.ordenDespachoId) || visitasRuta.some((v: any) => {
                    if (v.clienteId !== c.id) return false
                    const fv = v.fechaBogota ? new Date(v.fechaBogota).toISOString().split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
                    return fv === fechaRuta
                  })
                  const esRezago = c.rezago === true
                  return (
                    <EntregaCard
                      key={c.id}
                      cliente={c}
                      numeroFactura={c.numeroFactura}
                      empresaOrigen={c.empresaOrigen || c.supervisorEtiqueta}
                      alistadoPor={c.alistadoPor}
                      asignadoEn={c.asignadoEn || c.ordenCreadaEl}
                      rezago={esRezago}
                      entregado={entregado}
                      turnoActivo={!!turno}
                      onEntregar={() => {
                        setClienteModal(c)
                        const cLat = c.lat || c.latTmp
                        const cLng = c.lng || c.lngTmp
                        if (navigator.geolocation && cLat && cLng) {
                          navigator.geolocation.getCurrentPosition(pos => {
                            const R = 6371000
                            const dLat = (cLat - pos.coords.latitude) * Math.PI / 180
                            const dLng = (cLng - pos.coords.longitude) * Math.PI / 180
                            const a = Math.sin(dLat/2)**2 + Math.cos(pos.coords.latitude*Math.PI/180)*Math.cos(cLat*Math.PI/180)*Math.sin(dLng/2)**2
                            setDistanciaLejos(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) > 300)
                          }, () => setDistanciaLejos(false), { timeout: 3000 })
                        } else { setDistanciaLejos(false) }
                      }}
                    />
                  )
                })}
              </div>
              {rutaCompletada && (
                <div className="px-4 py-3 bg-emerald-500/10 border-t border-emerald-500/20">
                  <p className="text-emerald-400 text-sm font-semibold text-center">✅ Ruta completada</p>
                </div>
              )}
            </div>
          )}
          {user?.role === 'vendedor' && (
            <div className="space-y-4">
              {/* Hoy — siempre visible */}
              {vendedorStatsLoading && (
                <div className="space-y-3">
                  <CardKPIGroup cols={2}>
                    <CardCountAdminSkeleton />
                    <CardCountAdminSkeleton />
                  </CardKPIGroup>
                  <CardCountAdminSkeleton compact />
                  <CardCountAdminSkeleton compact />
                </div>
              )}
              {!vendedorStatsLoading && statsVendedor && (
                <div className="space-y-3">
                  {/* Visitas + Órdenes — 2 columnas sin moneda */}
                  <CardKPIGroup cols={2}>
                    <CardCountAdmin
                      stagger={1}
                      icon="👁️"
                      label="Visitas"
                      primary={<CountUp end={statsVendedor.hoy.total || 0} />}
                      secondary={<CountUp end={statsVendedor.hoy.ayer || 0} />}
                      primaryLabel="hoy"
                      secondaryLabel="ayer"
                      primaryColor="text-white"
                    />
                    <CardCountAdmin
                      stagger={2}
                      icon="📦"
                      label="Órdenes"
                      primary={<CountUp end={statsVendedor.ordenes?.despHoy || 0} />}
                      secondary={<CountUp end={statsVendedor.ordenes?.factHoy || 0} />}
                      primaryLabel="desp hoy"
                      secondaryLabel="fact hoy"
                      primaryColor="text-amber-400"
                    />
                  </CardKPIGroup>
                  {/* Ventas — ancho completo */}
                  <div className="relative" style={{borderRadius:16,overflow:'hidden'}}>
                    <CardCountAdmin
                      stagger={3}
                      icon="💼"
                      label="Ventas"
                      primary={<CountUp end={Math.round(statsVendedor.ordenes?.montoMes || 0)} prefix="$" />}
                      secondary={statsVendedor.ordenes?.metaVentaMes > 0 ? <CountUp end={Math.round(statsVendedor.ordenes.metaVentaMes)} prefix="$" /> : '—'}
                      primaryLabel="mes"
                      secondaryLabel="meta"
                      primaryColor="text-emerald-400"
                    />
                  </div>
                  {/* Recaudo — ancho completo */}
                  <div style={{borderRadius:16,overflow:'hidden'}}>
                    <CardCountAdmin
                      stagger={4}
                      icon="💰"
                      label="Recaudo"
                      primary={<CountUp end={Math.round((statsVendedor.recaudo?.mes || 0) + (statsVendedor.recaudo?.descuentosMes || 0))} prefix="$" />}
                      secondary={statsVendedor.recaudo?.meta > 0 ? `$${Math.round(statsVendedor.recaudo.meta).toLocaleString('es-CO')}` : '—'}
                      primaryLabel="Recaudo+Descuento"
                      secondaryLabel="Meta"
                      primaryColor="text-blue-400"
                    />
                  </div>
                </div>
              )}


                {statsVendedor && statsVendedor.cumplimiento?.length > 0 && (() => {
                  const tieneAlerta = statsVendedor.cumplimiento.some((imp: any) => imp.alerta)
                  return (
                    <div>
                      <button
                        onClick={() => setMostrarImpulsadoras(v => !v)}
                        className='card-glass' style={{background:'rgba(255,255,255,0.08)',border:`1px solid ${tieneAlerta ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.25)'}`,boxShadow:'0 4px 24px rgba(0,0,0,0.25)',borderRadius:16,width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer'}}>
                        <span className="text-white font-semibold text-sm">
                          ⚡ Impulsos
                          {tieneAlerta && <span className="ml-2 text-red-400 text-xs font-bold">● Alerta</span>}
                        </span>
                        <span className="text-zinc-500 text-xs">{mostrarImpulsadoras ? '▲ Ocultar' : '▼ Ver'}</span>
                      </button>
                      {mostrarImpulsadoras && (
                        <div className="mt-2 space-y-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
                          {statsVendedor.cumplimiento.map((imp: any) => {
                            const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
                            const diaHoy = diasSemana[new Date().getDay()]
                            return (
                              <CardSub key={imp.id} alerta={imp.alerta} className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <div className={"w-2 h-2 rounded-full " + (imp.turnoActivo ? "bg-emerald-500" : "bg-zinc-600")} />
                                    <p className="text-white text-sm font-medium">{imp.nombre}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {imp.alerta && <span className="text-red-400 text-xs">Alerta</span>}
                                    {imp.pct !== null && (
                                      <span className={"text-xs font-bold " + (imp.pct >= 80 ? "text-emerald-400" : imp.pct >= 50 ? "text-yellow-400" : "text-red-400")}>{imp.pct}%</span>
                                    )}
                                  </div>
                                </div>
                                {imp.totalPuntos > 0 && (
                                  <div className="space-y-2">
                                    <div>
                                      <p className="text-zinc-400 text-xs mb-1">hoy {diaHoy}: {imp.visitados}/{imp.totalPuntos} puntos</p>
                                      <div className="w-full rounded-full h-1.5 overflow-hidden" style={{background:"#162d4a"}}>
                                        <div className={"h-1.5 rounded-full transition-all " + (imp.pct >= 80 ? "bg-emerald-500" : imp.pct >= 50 ? "bg-yellow-500" : "bg-red-500")}
                                          style={{width: (imp.pct || 0) + '%'}} />
                                      </div>
                                    </div>
                                    {imp.puntoActual && (
                                      <div style={{background:"rgba(148,160,185,0.28)",border:"1px solid rgba(148,180,255,0.35)",borderRadius:8,padding:"8px 10px"}}>
                                        <p className="text-zinc-400 text-xs">📍 Está en:</p>
                                        <p className="text-emerald-400 text-sm font-medium">{imp.puntoActual.nombre}</p>
                                        {imp.puntoActual.nombreComercial && <p className="text-zinc-500 text-xs">{imp.puntoActual.nombreComercial}</p>}
                                      </div>
                                    )}
                                    {!imp.puntoActual && imp.proximoPunto && (
                                      <div style={{background:"rgba(148,160,185,0.28)",border:"1px solid rgba(148,180,255,0.25)",borderRadius:8,padding:"8px 10px"}}>
                                        <p className="text-zinc-400 text-xs">➡️ Va hacia:</p>
                                        <p className="text-white text-sm font-medium">{imp.proximoPunto.nombre}</p>
                                        {imp.proximoPunto.nombreComercial && <p className="text-zinc-500 text-xs">{imp.proximoPunto.nombreComercial}</p>}
                                      </div>
                                    )}
                                    {imp.alertasGps?.length > 0 && (
                                      <div style={{background:"rgba(127,29,29,0.30)",border:"1px solid rgba(239,68,68,0.30)",borderRadius:8,padding:"8px 10px"}}>
                                        <p className="text-red-400 text-xs font-semibold">⚠️ Alertas GPS hoy ({imp.alertasGps.length})</p>
                                        {imp.alertasGps.slice(0,2).map((a: any, i: number) => (
                                          <p key={i} className="text-red-300 text-xs">{a.detalle} — {new Date(a.hora).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})}</p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {imp.totalPuntos === 0 && (
                                  <div>
                                    <p className="text-zinc-500 text-xs">Sin ruta asignada hoy</p>
                                    {imp.proximoDia && <p className="text-zinc-400 text-xs mt-1">📅 Próxima ruta: <span className="text-white">{imp.proximoDia}</span></p>}
                                  </div>
                                )}
                              </CardSub>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}

              {/* Estadísticas — históricos bajo demanda */}
              <button
                onClick={cargarStatsVendedor}
                style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25)',borderRadius:16,width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer'}}>
                <span className="text-white font-semibold text-sm">📊 Estadísticas</span>
                <span className="text-zinc-500 text-xs">{mostrarEstadisticasVendedor ? '▲ Ocultar' : '▼ Ver'}</span>
              </button>
              {mostrarEstadisticasVendedor && loadingStats && <div className="text-zinc-400 text-center py-4 text-sm">Cargando...</div>}
              {mostrarEstadisticasVendedor && !loadingStats && statsVendedor && (
                <div className="space-y-4">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover-lift fade-up stagger-2">
                    <p className="text-white font-bold mb-3">Últimos 6 días</p>
                    <div className="overflow-x-auto">
                      <div>
                        <div className="flex items-center gap-2 mb-2 pb-1 border-b border-zinc-700">
                          <p className="text-zinc-500 text-xs w-14 flex-shrink-0">Dia</p>
                          <p className="text-zinc-500 text-xs flex-1"></p>
                          <p className="text-zinc-500 text-xs w-6 text-right">Vis.</p>
                          <p className="text-zinc-500 text-xs w-16 text-right">Ventas</p>
                          <p className="text-zinc-500 text-xs w-16 text-right">Recaudo</p>
                        </div>
                        <div className="space-y-2">
                          {statsVendedor.dias.slice().reverse().map((d: any) => (
                            <div key={d.fecha} className="flex items-center gap-1">
                              <p className="text-zinc-400 text-xs w-14 flex-shrink-0 capitalize">{d.label}</p>
                              <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                                <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: d.total > 0 ? Math.min(100, d.total * 10) + '%' : '0%' }} />
                              </div>
                              <p className="text-white text-xs w-6 text-right">{d.total}</p>
                              <p className="text-emerald-400 text-xs w-16 text-right">{d.montoVentas > 0 ? '$' + d.montoVentas.toLocaleString('es-CO') : '—'}</p>
                              <p className="text-blue-400 text-xs w-16 text-right">{d.montoCobros > 0 ? '$' + d.montoCobros.toLocaleString('es-CO') : '—'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-white font-bold mb-3">Últimos 6 meses</p>
                    <div className="overflow-x-auto">
                      <div>
                        <div className="flex items-center gap-2 mb-2 pb-1 border-b border-zinc-700">
                          <p className="text-zinc-500 text-xs w-14 flex-shrink-0">Mes</p>
                          <p className="text-zinc-500 text-xs flex-1"></p>
                          <p className="text-zinc-500 text-xs w-6 text-right">Vis.</p>
                          <p className="text-zinc-500 text-xs w-16 text-right">Ventas</p>
                          <p className="text-zinc-500 text-xs w-16 text-right">Recaudo</p>
                        </div>
                        <div className="space-y-2">
                          {statsVendedor.meses.slice().reverse().map((m: any) => (
                            <div key={m.label} className="flex items-center gap-1">
                              <p className="text-zinc-400 text-xs w-14 flex-shrink-0 capitalize">{m.label}</p>
                              <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: m.total > 0 ? Math.min(100, m.total * 2) + '%' : '0%' }} />
                              </div>
                              <p className="text-white text-xs w-6 text-right">{m.total}</p>
                              <p className="text-emerald-400 text-xs w-16 text-right">{m.montoVentas > 0 ? '$' + m.montoVentas.toLocaleString('es-CO') : '—'}</p>
                              <p className="text-blue-400 text-xs w-16 text-right">{m.montoCobros > 0 ? '$' + m.montoCobros.toLocaleString('es-CO') : '—'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    <ModalVisita
        key={`dashboard-modal-visita-${clienteInicialLibre?.id || 'libre'}`}
        open={modalVisita.open}
        onClose={() => { setModalVisita({ open: false, tipo: 'visita' }); setClienteInicialLibre(null) }}
        onRegistrado={() => {
          // Marcar orden como entregada localmente de inmediato
          if (clienteModal?.ordenDespachoId) {
            setOrdenesEntregadas(prev => new Set([...prev, clienteModal.ordenDespachoId]))
          }
          const hoy = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
          Promise.all([
            fetch('/api/rutas/mi-ruta').then(r => r.json()),
            fetch('/api/visitas/todas?fecha=' + hoy).then(r => r.json()),
          ]).then(([r, v]) => {
            setRuta(r)
            setClientesOrdenados(r?.clientes?.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null, rezago: rc.rezago, orden: rc.orden, notas: rc.notas || null, ordenDespachoId: rc.ordenDespachoId || null, numeroFactura: (rc as any).numeroFactura || null, empresaOrigen: (rc as any).empresaOrigen || null, alistadoPor: (rc as any).alistadoPor || null, asignadoEn: rc.asignadoEn || null, ordenCreadaEl: (rc as any).ordenCreadaEl || null })) || [])
            setVisitasRuta(Array.isArray(v?.visitas) ? v.visitas : Array.isArray(v) ? v : [])
          })
        }}
        clienteInicial={clienteInicialLibre || undefined}
        tipoForzado={modalVisita.tipo !== 'visita' && modalVisita.tipo !== 'venta' && modalVisita.tipo !== 'cobro' && modalVisita.tipo !== 'entrega' ? undefined : modalVisita.tipo}
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
          // Marcar orden como entregada localmente de inmediato
          if (clienteModal?.ordenDespachoId) {
            setOrdenesEntregadas(prev => new Set([...prev, clienteModal.ordenDespachoId]))
          }
          const hoy = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
          Promise.all([
            fetch('/api/rutas/mi-ruta').then(r => r.json()),
            fetch('/api/visitas/todas?fecha=' + hoy).then(r => r.json()),
          ]).then(([r, v]) => {
            setRuta(r)
            setClientesOrdenados(r?.clientes?.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null, rezago: rc.rezago, orden: rc.orden, notas: rc.notas || null, ordenDespachoId: rc.ordenDespachoId || null, numeroFactura: (rc as any).numeroFactura || null, empresaOrigen: (rc as any).empresaOrigen || null, alistadoPor: (rc as any).alistadoPor || null, asignadoEn: rc.asignadoEn || null, ordenCreadaEl: (rc as any).ordenCreadaEl || null })) || [])
            setVisitasRuta(Array.isArray(v?.visitas) ? v.visitas : Array.isArray(v) ? v : [])
          })
        }}
        clienteInicial={clienteModal}
        tipoForzado="entrega"
        distanciaLejos={distanciaLejos}
        puedeCapturarGps={puedeCapturarGps}
        titulo="📦 Registrar entrega"
        extraData={clienteModal?.ordenDespachoId ? { ordenDespachoId: clienteModal.ordenDespachoId } : {}}
      />

    {/* Modal Recaudo Rápido */}
    {modalRecaudoRapido && (
      <div className="fixed inset-0 flex items-start justify-center z-50 pt-4 px-2" style={{background:"rgba(15,23,42,0.85)"}}
        onClick={e => { if (e.target === e.currentTarget) { setModalRecaudoRapido(false); setRrCliente(null); setRrSinDeuda(false) } }}>
        <div className="rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain" style={{background:"rgba(15,23,42,0.85)",border:"1px solid rgba(59,130,246,0.50)"}}>
          <div className="flex items-center justify-between px-4 pt-2.5 pb-2.5 border-b" style={{borderColor:"#1d3f6e"}}>
            <h3 className="text-white font-bold text-lg">💵 Recaudo rápido</h3>
            <button onClick={() => { setModalRecaudoRapido(false); setRrCliente(null); setRrSinDeuda(false) }} className="text-zinc-500 hover:text-white text-xl">×</button>
          </div>
          <div className="px-4 py-4 space-y-3">
            {!rrCliente ? (
              <>
                <input
                  value={rrBuscarCartera}
                  onChange={e => { const v = e.target.value; setRrBuscarCartera(v); if (v.length >= 1) rrLoadCartera(v); else setRrCartera([]) }}
                  placeholder="Buscar cliente con deuda..."
                  className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none placeholder:text-zinc-400" style={{background:"rgba(30,41,59,0.80)",border:"1px solid rgba(59,130,246,0.35)"}}
                  autoFocus
                />
                {rrLoadingCartera && (
                  <div className="space-y-2">{Array.from({length:3}).map((_,i) => <div key={i} className="shimmer rounded-xl h-16"/>)}</div>
                )}
                {!rrLoadingCartera && rrCartera.length === 0 && (
                  <p className="text-zinc-500 text-sm text-center py-6">Sin clientes con deuda activa</p>
                )}
                {!rrLoadingCartera && rrCartera.map((cartera: any) => (
                  <CarteraCard
                    key={cartera.id || cartera.clienteId}
                    cartera={cartera}
                    rol={user?.role || 'vendedor'}
                    fmt={fmt}
                    onRecaudar={(c: any) => {
                      setModalRecaudoRapido(false)
                      setRecaudandoCartera(c)
                      cargarDetalleCartera(c)
                    }}
                    onWhatsApp={abrirWhatsApp}
                    variant="modal"
                  />
                ))}
              </>
            ) : rrVerificando ? (
              <div className="py-8 text-center">
                <p className="text-zinc-400 text-sm">Verificando deuda de {rrCliente.nombre}...</p>
              </div>
            ) : rrSinDeuda ? (
              <div className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                  <p className="text-white font-semibold text-base">{rrCliente.nombre}</p>
                  {rrCliente.direccion && <p className="text-zinc-400 text-xs mt-0.5">{rrCliente.direccion}</p>}
                  <div className="mt-3 inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-bold px-3 py-1 rounded-full">
                    <span>✓</span><span>Al día</span>
                  </div>
                  <p className="text-zinc-500 text-xs mt-2">Sin saldo pendiente</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { tipo: 'visita', label: 'Visita', icon: '👁️', color: 'bg-zinc-700 hover:bg-zinc-600' },
                    { tipo: 'venta', label: 'Venta', icon: '💰', color: 'bg-emerald-600 hover:bg-emerald-500' },
                    { tipo: 'entrega', label: 'Entrega', icon: '📦', color: 'bg-orange-600 hover:bg-orange-500' },
                  ] as const).map(op => (
                    <button key={op.tipo}
                      onClick={() => { setModalRecaudoRapido(false); setClienteInicialLibre(rrCliente); abrirModalVisita(op.tipo) }}
                      className={`${op.color} text-white font-semibold py-3 rounded-xl text-sm transition-colors flex flex-col items-center gap-1`}>
                      <span className="text-lg">{op.icon}</span>
                      <span>{op.label}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => { setRrCliente(null); setRrSinDeuda(false) }}
                  className="w-full bg-black border border-blue-500/20 text-zinc-400 hover:text-white text-sm py-2 rounded-xl transition-colors">
                  ← Cambiar cliente
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )}

    {/* Modal Pago Cartera (desde Recaudo Rápido) */}
    {recaudandoCartera && (
      <ModalRecaudo
        cartera={recaudandoCartera}
        detalleData={detalleData}
        loadingDetalle={loadingDetalle}
        lineasPago={lineasPago}
        facturasSeleccionadas={facturasSeleccionadas}
        procesando={guardandoPago}
        fmt={fmt}
        onClose={() => { setRecaudandoCartera(null); setDetalleData(null); setLineasPago([crearLinea()]); setDescuentosPorFactura({}); setFacturasSeleccionadas([]) }}
        onSetLineasPago={setLineasPago}
        onSetFacturasSeleccionadas={setFacturasSeleccionadas}
        descuentosPorFactura={descuentosPorFactura}
        onSetDescuentosPorFactura={setDescuentosPorFactura}
        onSubirVoucher={subirVoucherArchivo}
        onConfirmar={registrarPago}
        crearLinea={crearLinea}
      />
    )}


    </div>
  )
}

export default function DashboardPage() {
  return <ErrorBoundary><DashboardPageInner /></ErrorBoundary>
}
