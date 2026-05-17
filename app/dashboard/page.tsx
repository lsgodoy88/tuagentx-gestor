'use client'
import { fetchApi, errorMsg } from '@/lib/fetchApi'
import FirmaCanvas from '@/components/FirmaCanvas'
import InputMoneda from '@/components/InputMoneda'
import { useSession } from 'next-auth/react'
import ModalVisita from '@/components/ModalVisita'
import CarteraCard from '@/components/CarteraCard'
import { useGpsEnDemanda } from '@/components/useGpsEnDemanda'
import { GpsIndicator } from '@/components/GpsIndicator'
import { estadoMasCritico } from '@/lib/cartera'
import EntregaCard from '@/components/EntregaCard'
import { useEffect, useState, useRef } from 'react'
import { CountUp, LiveDot, SkeletonCard, LoadingBorder } from '@/components/FX'
import { SyncIcon } from '@/components/SyncIcon'
import { useRouter } from 'next/navigation'

type LineaPago = { id: string; metodoPago: 'efectivo' | 'transferencia'; monto: string; descuento: string; voucherKey: string | null; voucherDatosIA: any; cargandoVoucher: boolean }
function crearLinea(): LineaPago { return { id: crypto.randomUUID(), metodoPago: 'efectivo', monto: '', descuento: '', voucherKey: null, voucherDatosIA: null, cargandoVoucher: false } }
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const RR_LIMIT = 10

export default function DashboardPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const router = useRouter()
  const [stats, setStats] = useState<any>({ empleados: 0, clientes: 0, visitasHoy: 0, enTurno: 0 })
  const [ruta, setRuta] = useState<any>(null)
  const [turno, setTurno] = useState<any>(null)
  const [tiempoTurno, setTiempoTurno] = useState('')
  const [statsVendedor, setStatsVendedor] = useState<any>(null)
  const [visitasRuta, setVisitasRuta] = useState<any[]>([])
  const [resumenFinanciero, setResumenFinanciero] = useState<any>(null)
  const [monitor, setMonitor] = useState<any[]>([])
  const [syncInfo, setSyncInfo] = useState<any>(null)
  const [modalSync, setModalSync] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [empresaDetalleSA, setEmpresaDetalleSA] = useState<string | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [mostrarEstadisticas, setMostrarEstadisticas] = useState(false)
  const [mostrarEstadisticasVendedor, setMostrarEstadisticasVendedor] = useState(false)
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
  const [notasPago, setNotasPago] = useState('')
  const [guardandoPago, setGuardandoPago] = useState(false)
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())

  const [montoVisita, setMontoVisita] = useState('')
  const [notaVisita, setNotaVisita] = useState('')
  const [facturaVisita, setFacturaVisita] = useState('')
  const [firmaVisita, setFirmaVisita] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [bloqueadoTurno, setBloqueadoTurno] = useState(false)
  const [mostrarPausa, setMostrarPausa] = useState(false)
  const [turnoExpandido, setTurnoExpandido] = useState(false)
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
  const isEmpresa = user?.role === 'empresa'
  const isSupervisor = user?.role === 'supervisor'
  const isBodega = user?.role === 'bodega'
  useEffect(() => {
    if (!turno) return
    const interval = setInterval(() => {
      const inicio = new Date(turno.inicio)
      const ahora = new Date()
      const diff = Math.floor((ahora.getTime() - inicio.getTime()) / 1000)
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
    if (user.role === 'superadmin') {
      fetch('/api/precios').then(r => r.json()).then(d => setResumenFinanciero(d))
      return
    }
    if (isImpulsadora) { router.push('/dashboard/impulsadora'); return }
    if (isEmpleado) {
      Promise.all([
        fetch('/api/rutas/mi-ruta').then(r => r.json()),
        fetch('/api/turnos').then(r => r.json()),
        fetch('/api/me').then(r => r.json()),
      ]).then(([r, t, me]) => {
        setRuta(r)
        setClientesOrdenados(r?.clientes?.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null, rezago: rc.rezago, orden: rc.orden, notas: rc.notas || null, ordenDespachoId: rc.ordenDespachoId || null, numeroFactura: (rc as any).numeroFactura || null, empresaOrigen: (rc as any).empresaOrigen || null, alistadoPor: (rc as any).alistadoPor || null, asignadoEn: rc.asignadoEn || null, ordenCreadaEl: (rc as any).ordenCreadaEl || null })) || [])
        setTurno(t)
        if (!t) setTurnoExpandido(true)  // sin turno → card abierta
        setPuedeCapturarGps(me?.puedeCapturarGps === true)
      })
      // Cargar hoy inmediatamente al montar para mostrar contadores del día
      if (user.role === 'vendedor') {
        setLoadingStats(true)
        fetch('/api/vendedor/stats').then(r => r.json()).then(d => {
          setStatsVendedor(d)
          setLoadingStats(false)
        }).catch(() => setLoadingStats(false))
      }
      // (el histórico se carga al presionar Estadísticas si no estaba cargado)
    } else {
      // Paralelo: stats + integracion + bodega en un solo round-trip
      const adminFetches: Promise<any>[] = [
        fetch('/api/stats').then(r => r.json()).catch(() => null),
      ]
      if (isEmpresa || isSupervisor) adminFetches.push(fetch('/api/integracion/estado').then(r => r.json()).catch(() => null))
      if (isEmpresa || isSupervisor || isBodega) adminFetches.push(fetch('/api/bodega/contadores').then(r => r.json()).catch(() => null))

      Promise.all(adminFetches).then(([stats, integracion, bodega]) => {
        if (stats) setStats(stats)
        if (integracion) setSyncInfo(integracion)
        if (bodega) setBodegaStats({ pendientes: bodega.pendientes ?? 0, alistados: bodega.alistados ?? 0, entregados: bodega.entregados ?? 0 })
      })
    }
  }, [user])
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
      const res = await fetch('/api/integracion/estado').then(r => r.json())
      setSyncInfo(res)
      // recargar stats
      fetch('/api/stats').then(r => r.json()).then(d => setStats(d)).catch(() => {})
    } catch {}
    setSincronizando(false)
  }

  async function iniciarTurno() {
    setBloqueadoTurno(true)
    setTimeout(() => refRuta.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    const ubicacion = await getUbicacion()
    const res = await fetchApi('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'iniciar', ...ubicacion })
    })
    if (res?.ok) setTurno(res.turno)
    setTimeout(() => setBloqueadoTurno(false), 10000)
  }

  async function cerrarTurno() {
    setBloqueadoTurno(true)
    const ubicacion = await getUbicacion()
    await fetchApi('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'cerrar', ...ubicacion })
    })
    setTurno(null)
    setTimeout(() => setBloqueadoTurno(false), 10000)
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
    rrLoadCartera('')
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
    const detalleCartera = data.cartera
    if (detalleCartera) detalleCartera._modo = data._modo
    if (detalleCartera && data._modo === 'sync') {
      const { calcularEstado } = await import('@/lib/cartera')
      const detallesNorm = (detalleCartera.deudas || []).map((d: any) => ({
        id: d.externalId,
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
      detalleCartera.DetalleCartera = detallesNorm
    }
    setDetalleData(detalleCartera)
    const pendientes = (detalleCartera?.DetalleCartera || [])
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
    if (cartera && Number(cartera.saldoPendiente) > 0) {
      setModalRecaudoRapido(false)
      setRecaudandoCartera(cartera)
      setDetalleData(cartera)
      setLoadingDetalle(false)
      const pendientes = (cartera.DetalleCartera || [])
        .filter((d: any) => d.estado !== 'pagada')
        .map((d: any) => d.id)
      setFacturasSeleccionadas(pendientes)
      setLineasPago([crearLinea()])
      setNotasPago('')
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
        body: JSON.stringify({ archivoBase64, mimeType: file.type, pagoId: crypto.randomUUID() }),
      })
      const d = await res.json()
      setLineasPago(prev => prev.map(l => l.id === lineaId ? {
        ...l, voucherKey: d.key, voucherDatosIA: d.datosIA, cargandoVoucher: false,
        monto: d.datosIA?.valor ? String(Math.round(d.datosIA.valor)) : l.monto, descuento: '0',
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
    const esSync = detalleData._modo === 'sync'
    const lineasValidas = lineasPago
      .filter(l => Number(l.monto || 0) > 0)
      .map(l => ({
        metodoPago: l.metodoPago,
        monto: Number(l.monto || 0),
        descuento: Number(l.descuento || 0),
        voucherKey: l.voucherKey || null,
        voucherDatosIA: l.voucherDatosIA || null,
      }))
    const montoTotal = lineasValidas.reduce((s, l) => s + l.monto, 0)
    const descuentoTotal = lineasValidas.reduce((s, l) => s + l.descuento, 0)

    if (esSync) {
      const res = await fetch('/api/cartera/pago-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteApiId: detalleData.cliente?.apiId || detalleData.clienteApiId || detalleData.apiId,
          syncDeudaIds: facturasSeleccionadas,
          monto: montoTotal,
          descuento: descuentoTotal,
          metodoPago: lineasValidas.length === 1 ? lineasValidas[0].metodoPago : 'mixto',
          notas: notasPago || undefined,
          lineasPago: lineasValidas,
          ...(gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng, gpsAccuracy: gpsRecaudo.pos?.accuracy ?? null } : {}),
        })
      })
      const d = await res.json()
      if (d.pago?.reciboToken) ultimoToken = d.pago.reciboToken
    } else {
      for (const linea of lineasValidas) {
        const res = await fetch('/api/cartera/pago', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            carteraId: detalleData.id,
            monto: linea.monto,
            descuento: linea.descuento,
            tipo: 'abono',
            metodoPago: linea.metodoPago,
            notas: notasPago || undefined,
            detalleIds: facturasSeleccionadas,
            ...(linea.voucherKey ? { voucherKey: linea.voucherKey, voucherDatosIA: linea.voucherDatosIA } : {}),
            ...(gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng, gpsAccuracy: gpsRecaudo.pos?.accuracy ?? null } : {}),
          })
        })
        const d = await res.json()
        if (d.pago?.reciboToken) ultimoToken = d.pago.reciboToken
      }
    }
    setGuardandoPago(false)
    if (ultimoToken) window.open('/recaudo/recibo?token=' + ultimoToken, '_blank')
    setRecaudandoCartera(null)
    setLineasPago([crearLinea()])
    setNotasPago('')
  }



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
        <div className="rounded-2xl overflow-hidden" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
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
                <div className="px-4 py-3 bg-zinc-800/30 border-b border-zinc-800 space-y-2">
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
    <div className="space-y-6 pb-20 md:pb-0 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Bienvenido, {user?.name?.split(' ')[0]}</h1>
        </div>

      </div>
      {(isEmpresa || isSupervisor) && (
        <div className="space-y-6">
          <div className="rounded-2xl" style={{backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)" as any,overflow:"hidden",borderRadius:16}}>
          <div className="grid grid-cols-2 gap-3">

            <div className="rounded-2xl p-4 hover-lift fade-up stagger-1 flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)" as any}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">🛍️</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Vendedores</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-white text-2xl font-bold">{stats.vendedoresActivos||0}</span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold">{stats.totalVendedores||0}</span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">en turno</span>
                <span className="text-white text-xs">activos</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 hover-lift fade-up stagger-2 flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)" as any}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">⚡</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Impulsos</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-amber-400 text-2xl font-bold">{stats.impulsosActivos||0}</span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold">{stats.totalImpulsos||0}</span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">activas</span>
                <span className="text-white text-xs">total</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 hover-lift fade-up stagger-3 flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)" as any}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">📦</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Órdenes hoy</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-emerald-400 text-2xl font-bold">{stats.ordenesDespachadasHoy||0}</span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold">{stats.ordenesFact||0}</span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">despacho</span>
                <span className="text-white text-xs">facturas</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 hover-lift fade-up stagger-4 flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)" as any}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">💰</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Recaudado</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-blue-400 text-2xl font-bold">${(stats.recaudoHoy||0).toLocaleString('es-CO')}</span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold">${(stats.recaudoMes||0).toLocaleString('es-CO')}</span>
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
            className={`w-full flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-2xl px-4 py-3 transition-colors ${loadingStats ? 'btn-shimmer' : ''}`}>
            <span className="text-white font-semibold text-sm">📊 Estadísticas</span>
            <span className="text-zinc-500 text-xs">{mostrarEstadisticas ? '▲ Ocultar' : '▼ Ver'}</span>
          </button>

          {mostrarEstadisticas ? (
          <div className="md:grid md:grid-cols-2 md:gap-6 space-y-6 md:space-y-0 rounded-2xl p-3" style={{backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)" as any,overflow:"hidden",borderRadius:16}}>
          <div className="space-y-6">
          {stats.visitasPorDia && stats.visitasPorDia.length > 0 && (
            <div className="rounded-2xl p-4" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
              <p className="text-white font-semibold text-sm mb-4">Visitas últimos 7 días</p>
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...stats.visitasPorDia.map((d: any) => d.cantidad), 1)
                  return stats.visitasPorDia.map((d: any) => (
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
            <div className="rounded-2xl overflow-hidden" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-white font-semibold text-sm">Top vendedores - 30 dias</p>
              </div>
              {stats.topEmpleados.map((e: any, i: number) => (
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
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
                  <div key={rol} className="rounded-2xl overflow-hidden" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
                    <div className="px-4 py-3 border-b border-zinc-800">
                      <p className="text-white font-semibold text-sm">{titulo} en turno</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="px-3 py-2 text-left text-zinc-500 font-medium">Empleado</th>
                            <th className="px-3 py-2 text-left text-zinc-500 font-medium">Inicio turno</th>
                            <th className="px-3 py-2 text-left text-zinc-500 font-medium">Ultima visita</th>
                            <th className="px-3 py-2 text-left text-zinc-500 font-medium">Proximo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empleadosRol.map((m: any) => (
                            <tr key={m.empleado} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                              <td className="px-3 py-2">
                                <p className="text-white font-medium whitespace-nowrap">{m.empleado}</p>
                                {m.ruta && <p className="text-blue-400 mt-0.5">{m.ruta}</p>}
                                {m.totalRuta > 0 && <p className="text-zinc-500">{m.visitados}/{m.totalRuta}</p>}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <p className="text-white">{new Date(m.inicioTurno).toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit'})}</p>
                                {m.latInicio && m.lngInicio && (
                                  <a href={'https://www.google.com/maps?q=' + m.latInicio + ',' + m.lngInicio} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">📍 ver</a>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {m.ultimaVisita ? (
                                  <div>
                                    <p className="text-white whitespace-nowrap">{new Date(m.ultimaVisita.hora).toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit'})} - {m.ultimaVisita.cliente}</p>
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
            <div className="rounded-2xl overflow-hidden" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-white font-semibold text-sm">Visitas por vendedor - ultimos 7 dias</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2 text-left text-zinc-500 font-medium w-24">Dia</th>
                      {stats.vendedores7.map((v: string) => (
                        <th key={v} className="px-3 py-2 text-center text-zinc-400 font-medium whitespace-nowrap">{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.tabla7dias.map((row: any) => (
                      <tr key={row.dia} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{row.dia}</td>
                        {stats.vendedores7.map((v: string) => (
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
            <div className="rounded-2xl overflow-hidden" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-white font-semibold text-sm">Visitas por vendedor - ultimos 7 meses</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2 text-left text-zinc-500 font-medium w-24">Mes</th>
                      {stats.vendedores7m.map((v: string) => (
                        <th key={v} className="px-3 py-2 text-center text-zinc-400 font-medium whitespace-nowrap">{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.tabla7meses.map((row: any) => (
                      <tr key={row.mes} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{row.mes}</td>
                        {stats.vendedores7m.map((v: string) => (
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
      {isBodega && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover-lift">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">📦 Órdenes bodega hoy</h3>
            <a href="/dashboard/ordenes" className="text-emerald-400 text-xs">Ver órdenes →</a>
          </div>
          {bodegaStats ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center fade-up stagger-1"><p className="text-2xl font-bold text-amber-400 flex items-center justify-center gap-1.5"><CountUp end={bodegaStats.pendientes} />{bodegaStats.pendientes > 0 && <LiveDot color="amber" />}</p><p className="text-zinc-500 text-xs">🟡 Pendientes</p></div>
              <div className="text-center fade-up stagger-2"><p className="text-2xl font-bold text-emerald-400"><CountUp end={bodegaStats.alistados} /></p><p className="text-zinc-500 text-xs">🟢 Alistados</p></div>
              <div className="text-center fade-up stagger-3"><p className="text-2xl font-bold text-blue-400"><CountUp end={bodegaStats.entregados} /></p><p className="text-zinc-500 text-xs">✅ Entregados</p></div>
            </div>
          ) : <p className="text-zinc-500 text-xs text-center">Cargando...</p>}
        </div>
      )}
      {isEmpleado && (
        <div className="space-y-4">
          {turno?.pausado ? (
            // ── PAUSA — encogida/desplegada ──
            <div className={`rounded-2xl border overflow-hidden ${turnoExpandido ? "border-amber-500/30" : "border-white/10"}`} style={{background: turnoExpandido ? "rgba(245,158,11,0.10)" : "rgba(15,15,22,0.60)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)"}}>
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
                    <div className="rounded-lg p-2" style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)'}}><p className="text-zinc-500 text-xs">Inicio pausa</p><p className="text-sm font-bold text-white">{turno.pausaInicio ? new Date(turno.pausaInicio).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}) : "--"}</p></div>
                    <div className="rounded-lg p-2" style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)'}}><p className="text-zinc-500 text-xs">Reanuda a las</p><p className="text-emerald-400 text-sm font-bold">{new Date(new Date(turno.pausaInicio).getTime() + turno.pausaDuracionMin*60000).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</p></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={reanudarTurno} className="flex-1 bg-zinc-800 border border-emerald-500/30 text-emerald-400 text-sm font-semibold py-2.5 rounded-xl">▶️ Reanudar</button>
                    <a href="/dashboard/turno" className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1">📅 Historial</a>
                  </div>
                </div>
              )}
            </div>
          ) : turno ? (
            // ── TURNO ACTIVO — encogida/desplegada ──
            <div className={`rounded-2xl border overflow-hidden ${turnoExpandido ? "border-emerald-500/30" : "border-white/10"}`} style={{background: turnoExpandido ? "rgba(16,185,129,0.12)" : "rgba(15,15,22,0.60)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)"}}>
              {/* Pill encogida */}
              <button onClick={() => setTurnoExpandido(e => !e)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <span className="relative inline-flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 live-ping" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="font-mono font-bold text-emerald-400 text-lg flex-1 tabular-nums">{tiempoTurno}</span>
                <button onClick={e => { e.stopPropagation(); setMostrarPausa(m => !m); setTurnoExpandido(true) }}
                  className="w-8 h-8 flex items-center justify-center bg-zinc-800 rounded-lg text-base flex-shrink-0">⏸</button>
                <span className={`text-zinc-600 text-[10px] transition-transform duration-200 ${turnoExpandido ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {/* Desplegado */}
              {turnoExpandido && (
                <div className="border-t border-emerald-500/20 px-4 pb-4 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg p-2" style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)'}}><p className="text-zinc-500 text-xs">Hora inicio</p><p className="text-sm font-bold text-white">{new Date(turno.inicio).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</p></div>
                    <div className="rounded-lg p-2" style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)'}}><p className="text-zinc-500 text-xs">Contador</p><p className="text-emerald-400 font-mono font-bold">{tiempoTurno}</p></div>
                  </div>
                  <button onClick={cerrarTurno} disabled={bloqueadoTurno} className="w-full bg-red-600 text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50">Cerrar turno</button>
                  <div className="flex gap-2">
                    <button onClick={() => setMostrarPausa(m => !m)} className={"flex-1 text-sm font-semibold py-2.5 rounded-xl border " + (mostrarPausa ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>⏸️ Pausar</button>
                    <a href="/dashboard/turno" className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1">📅 Historial</a>
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
              )}
            </div>
          ) : (
            // ── SIN TURNO — encogida/desplegada ──
            <div className="rounded-2xl border border-white/10 overflow-hidden" style={{background:"rgba(15,15,22,0.60)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)"}}>
              {/* Pill encogida */}
              <button onClick={() => setTurnoExpandido(e => !e)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-600 flex-shrink-0" />
                <span className="text-zinc-500 text-sm flex-1">Sin turno activo</span>
                <span className={`text-zinc-600 text-[10px] transition-transform duration-200 ${turnoExpandido ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {/* Desplegado */}
              {turnoExpandido && (
                <div className="border-t border-zinc-800 px-4 pb-4 pt-3 space-y-2">
                  <button onClick={iniciarTurno} disabled={bloqueadoTurno} className="w-full bg-emerald-600 text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50">Iniciar turno</button>
                  <a href="/dashboard/turno" className="flex items-center justify-center gap-1 w-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2.5 rounded-xl">📅 Historial</a>
                </div>
              )}
            </div>
          )}
          {ruta && totalClientes > 0 && !rutaCompletada ? (
            <div className="rounded-2xl overflow-hidden" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
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
                <button onClick={() => router.push('/dashboard/mapa-ruta')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-zinc-400 hover:bg-zinc-800 transition-colors">
                  <span className="text-lg">🗺️</span>
                  <span className="text-sm font-semibold">Mapa</span>
                </button>
              </div>
            </div>
          ) : null}
          {user?.role === 'vendedor' && turno && (
              <div className="rounded-2xl p-4" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
                <p className="text-white font-bold mb-3">Visitas</p>
                <div className="flex gap-2">
                  {[
                    { tipo: 'visita', label: 'Visita', icon: '👁️', color: 'bg-zinc-700 hover:bg-zinc-600' },
                    { tipo: 'venta', label: 'Venta', icon: '💰', color: 'bg-emerald-600 hover:bg-emerald-500' },
                    { tipo: 'cobro', label: 'Recaudo', icon: '💵', color: 'bg-blue-600 hover:bg-blue-500' },
                    { tipo: 'entrega', label: 'Entrega', icon: '📦', color: 'bg-orange-600 hover:bg-orange-500' },
                  ].map(b => (
                    <button key={b.tipo} onClick={() => b.tipo === 'cobro' ? abrirModalRecaudoRapido() : abrirModalVisita(b.tipo)}
                      className={`flex-1 ${b.color} text-white font-semibold py-3 rounded-xl text-sm transition-colors flex flex-col items-center gap-1`}>
                      <span className="text-lg">{b.icon}</span>
                      <span>{b.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          {user?.role === 'entregas' && ruta && ruta.clientes?.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
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
              {statsVendedor && (
                <div className="rounded-2xl p-4 fade-up" style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)" as any}}>
                  <p className="text-white font-bold mb-3">Hoy</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl p-3" style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)" as any}}>
                      <p className="text-zinc-400 text-xs">Visitas</p>
                      <p className="text-white text-2xl font-bold"><CountUp end={statsVendedor.hoy.total || 0} /></p>
                    </div>
                    <div className="rounded-xl p-3" style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)" as any}}>
                      <p className="text-zinc-400 text-xs">Ventas</p>
                      <p className="text-white text-2xl font-bold"><CountUp end={statsVendedor.hoy.ventas || 0} /></p>
                    </div>
                    <div className="rounded-xl p-3" style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)" as any}}>
                      <p className="text-zinc-400 text-xs">$ Ventas</p>
                      <p className="text-emerald-400 font-bold">$<CountUp end={statsVendedor.hoy.montoVentas || 0} /></p>
                    </div>
                    <div className="rounded-xl p-3" style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)" as any}}>
                      <p className="text-zinc-400 text-xs">Recaudo</p>
                      <p className="text-blue-400 font-bold">$<CountUp end={statsVendedor.hoy.montoCobros || 0} /></p>
                    </div>
                  </div>
                </div>
              )}
                {statsVendedor && statsVendedor.cumplimiento?.length > 0 && (
                  <div className="rounded-2xl p-4" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
                    <p className="text-white font-bold mb-3">Impulsadoras hoy</p>
                    <div className="space-y-3">
                      {statsVendedor.cumplimiento.map((imp: any) => (
                        <div key={imp.id} className={"rounded-xl p-3 border " + (imp.alerta ? "bg-red-500/10 border-red-500/20" : "bg-zinc-800 border-zinc-700")}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={"w-2 h-2 rounded-full " + (imp.turnoActivo ? "bg-emerald-500 animate-pulse" : "bg-zinc-600")} />
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
                                <div className="w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                                  <div className={"h-1.5 rounded-full transition-all " + (imp.pct >= 80 ? "bg-emerald-500" : imp.pct >= 50 ? "bg-yellow-500" : "bg-red-500")}
                                    style={{ width: (imp.pct || 0) + '%' }} />
                                </div>
                                <p className="text-zinc-500 text-xs mt-1">{imp.visitados}/{imp.totalPuntos} puntos visitados</p>
                              </div>
                              {imp.puntoActual && (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                                  <p className="text-zinc-400 text-xs">📍 Está en:</p>
                                  <p className="text-emerald-400 text-sm font-medium">{imp.puntoActual.nombre}</p>
                                  {imp.puntoActual.nombreComercial && <p className="text-zinc-500 text-xs">{imp.puntoActual.nombreComercial}</p>}
                                </div>
                              )}
                              {!imp.puntoActual && imp.proximoPunto && (
                                <div className="bg-zinc-700/50 border border-zinc-600 rounded-lg px-3 py-2">
                                  <p className="text-zinc-400 text-xs">➡️ Va hacia:</p>
                                  <p className="text-white text-sm font-medium">{imp.proximoPunto.nombre}</p>
                                  {imp.proximoPunto.nombreComercial && <p className="text-zinc-500 text-xs">{imp.proximoPunto.nombreComercial}</p>}
                                </div>
                              )}
                              {imp.alertasGps?.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 space-y-1">
                                  <p className="text-red-400 text-xs font-semibold">⚠️ Alertas GPS hoy ({imp.alertasGps.length})</p>
                                  {imp.alertasGps.slice(0,2).map((a: any, i: number) => (
                                    <p key={i} className="text-red-300 text-xs">{a.detalle} — {new Date(a.hora).toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})}</p>
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Estadísticas — históricos bajo demanda */}
              <button
                onClick={cargarStatsVendedor}
                className={`w-full flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-2xl px-4 py-3 transition-colors ${loadingStats ? 'btn-shimmer' : ''}`}>
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
                  <div className="rounded-2xl p-4" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",boxShadow:"0 4px 16px rgba(0,0,0,0.20)"}}>
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
      <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 pt-16"
        onClick={e => { if (e.target === e.currentTarget) { setModalRecaudoRapido(false); setRrCliente(null); setRrSinDeuda(false) } }}>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
            <h3 className="text-white font-bold text-lg">💵 Recaudo rápido</h3>
            <button onClick={() => { setModalRecaudoRapido(false); setRrCliente(null); setRrSinDeuda(false) }} className="text-zinc-500 hover:text-white text-xl">×</button>
          </div>
          <div className="px-4 py-4 space-y-3">
            {!rrCliente ? (
              <>
                <input
                  value={rrBuscarCartera}
                  onChange={e => { setRrBuscarCartera(e.target.value); rrLoadCartera(e.target.value) }}
                  placeholder="Buscar cliente con deuda..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
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
                  />
                ))}
              </>
            ) : rrVerificando ? (
              <div className="py-8 text-center">
                <p className="text-zinc-400 text-sm animate-pulse">Verificando deuda de {rrCliente.nombre}...</p>
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
                  className="w-full bg-zinc-800 text-zinc-400 hover:text-white text-sm py-2 rounded-xl transition-colors">
                  ← Cambiar cliente
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )}

    {/* Modal Pago Cartera (desde Recaudo Rápido) */}
    {recaudandoCartera && (() => {
      const montoSeleccionado = detalleData?.DetalleCartera
        ?.filter((d: any) => facturasSeleccionadas.includes(d.id) && d.estado !== 'pagada')
        .reduce((acc: number, d: any) => acc + Math.max(0, Number(d.valorFactura ?? d.valor) - Number(d.abonos ?? 0)), 0) ?? 0
      return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-5">
              <h3 className="text-white font-bold text-lg">💳 Recaudar</h3>
              <button onClick={() => setRecaudandoCartera(null)} className="text-zinc-500 hover:text-white text-xl">×</button>
            </div>
            <div className="px-6 space-y-4 pb-6">
              <div className="bg-zinc-800 rounded-xl px-4 py-3">
                <p className="text-white font-medium text-sm">{recaudandoCartera.cliente?.nombre}</p>
                {recaudandoCartera.cliente?.nit && <p className="text-zinc-400 text-xs">NIT: {recaudandoCartera.cliente.nit}</p>}
              </div>
              {loadingDetalle ? (
                <div className="space-y-2">{Array.from({length:3}).map((_,i)=><div key={i} className="shimmer rounded-xl h-12"/>)}</div>
              ) : !detalleData ? (
                <p className="text-zinc-500 text-sm text-center py-4">Sin cartera registrada</p>
              ) : (
                <>
                  {detalleData.DetalleCartera?.filter((d: any) => d.estado !== 'pagada').length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Facturas pendientes</p>
                      {detalleData.DetalleCartera.filter((d: any) => d.estado !== 'pagada').map((d: any) => {
                        const saldo = Math.max(0, Number(d.valorFactura ?? d.valor) - Number(d.abonos ?? 0))
                        const seleccionada = facturasSeleccionadas.includes(d.id)
                        return (
                          <label key={d.id} className={`flex items-center gap-3 bg-zinc-800 border rounded-xl px-4 py-2.5 cursor-pointer transition-colors ${seleccionada ? 'border-emerald-500/50' : 'border-zinc-700 hover:border-zinc-600'}`}>
                            <input type="checkbox" checked={seleccionada}
                              onChange={e => setFacturasSeleccionadas(prev => e.target.checked ? [...prev, d.id] : prev.filter(x => x !== d.id))}
                              className="accent-emerald-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              {d.numeroFactura && <p className="text-white text-xs font-medium">Fact. {d.numeroFactura}</p>}
                              {d.concepto && <p className="text-zinc-400 text-xs truncate">{d.concepto}</p>}
                              {d.fechaVencimiento && <p className="text-zinc-500 text-xs">Vence: {new Date(d.fechaVencimiento).toLocaleDateString('es-CO')}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-white text-sm font-semibold">{fmt(saldo)}</p>
                              <span className="text-xs text-zinc-400">{d.estadoLabel || d.estado}</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {facturasSeleccionadas.length > 0 && (
                    <p className="text-zinc-500 text-xs text-right">
                      Deuda seleccionada: <span className="text-white font-semibold">{fmt(montoSeleccionado)}</span>
                    </p>
                  )}
                  <div className="space-y-3">
                    {lineasPago.map((linea, idx) => (
                      <div key={linea.id} className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Pago {idx + 1}</span>
                          {lineasPago.length > 1 && (
                            <button onClick={() => setLineasPago(prev => prev.filter(l => l.id !== linea.id))}
                              className="text-zinc-500 hover:text-red-400 text-sm transition-colors">✕</button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(['efectivo', 'transferencia'] as const).map(met => (
                            <button key={met} onClick={() => setLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, metodoPago: met, voucherKey: null, voucherDatosIA: null, cargandoVoucher: false } : l))}
                              className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${linea.metodoPago === met ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'}`}>
                              {met === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
                            </button>
                          ))}
                        </div>
                        {linea.metodoPago === 'efectivo' && (
                          <div className="flex gap-3">
                            <div className="flex-[7]">
                              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Monto *</label>
                              <InputMoneda value={linea.monto}
                                onChange={val => setLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, monto: val } : l))}
                                className="w-full bg-zinc-700 border border-zinc-600 rounded-xl pr-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                            </div>
                            <div className="flex-[3]">
                              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Descuento</label>
                              <InputMoneda value={linea.descuento} placeholder="0" prefix=""
                                onChange={val => setLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, descuento: val } : l))}
                                className="w-full bg-zinc-700 border border-zinc-600 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                            </div>
                          </div>
                        )}
                        {linea.metodoPago === 'transferencia' && (
                          <div className="space-y-3">
                            <input type="file" accept="image/*,application/pdf" className="hidden"
                              ref={el => { if (el) fileInputRefs.current.set(linea.id, el); else fileInputRefs.current.delete(linea.id) }}
                              onChange={e => { if (e.target.files?.[0]) subirVoucherArchivo(linea.id, e.target.files[0]) }} />
                            {!linea.voucherKey && !linea.cargandoVoucher && (
                              <button onClick={() => fileInputRefs.current.get(linea.id)?.click()}
                                className="w-full bg-zinc-700 border border-dashed border-zinc-500 rounded-xl py-2.5 text-zinc-400 text-sm hover:text-white hover:border-zinc-400 transition-colors">
                                📎 Adjuntar comprobante
                              </button>
                            )}
                            {linea.cargandoVoucher && (
                              <div className="bg-zinc-700 border border-zinc-600 rounded-xl px-4 py-3 text-zinc-400 text-sm text-center animate-pulse">
                                Analizando comprobante con IA...
                              </div>
                            )}
                            {linea.voucherDatosIA && !linea.cargandoVoucher && (
                              <div className="bg-zinc-700 border border-emerald-700/40 rounded-xl px-4 py-3 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-emerald-400 text-xs font-semibold">✅ Comprobante procesado</span>
                                  <button onClick={() => setLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, voucherKey: null, voucherDatosIA: null, monto: '', descuento: '' } : l))}
                                    className="text-zinc-500 hover:text-red-400 text-xs transition-colors">✕ Quitar</button>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                  {linea.voucherDatosIA.valor != null && <div><span className="text-zinc-500">Valor:</span> <span className="text-white font-semibold">{fmt(linea.voucherDatosIA.valor)}</span></div>}
                                  {linea.voucherDatosIA.fecha && <div><span className="text-zinc-500">Fecha:</span> <span className="text-white">{linea.voucherDatosIA.fecha}</span></div>}
                                  {linea.voucherDatosIA.banco && <div className="col-span-2"><span className="text-zinc-500">Banco:</span> <span className="text-white">{linea.voucherDatosIA.banco}</span></div>}
                                  {linea.voucherDatosIA.referencia && <div className="col-span-2"><span className="text-zinc-500">Ref:</span> <span className="text-white">{linea.voucherDatosIA.referencia}</span></div>}
                                </div>
                              </div>
                            )}
                            {linea.voucherDatosIA && (
                              <div className="flex gap-3">
                                <div className="flex-[7]">
                                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Monto (IA)</label>
                                  <InputMoneda value={linea.monto} readOnly
                                    className="w-full bg-zinc-700/50 border border-zinc-600 rounded-xl pr-4 py-2.5 text-zinc-300 text-sm outline-none cursor-not-allowed" onChange={() => {}} />
                                </div>
                                <div className="flex-[3]">
                                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Descuento</label>
                                  <InputMoneda value={linea.descuento} placeholder="0" prefix=""
                                    onChange={val => {
                                      const desc = val
                                      const montoFinal = linea.voucherDatosIA?.valor != null
                                        ? String(Math.max(0, Math.round(linea.voucherDatosIA.valor - Number(desc || 0)))) : linea.monto
                                      setLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, descuento: desc, monto: montoFinal } : l))
                                    }}
                                    className="w-full bg-zinc-700 border border-zinc-600 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setLineasPago(prev => [...prev, crearLinea()])}
                      className="w-full bg-zinc-800 border border-dashed border-zinc-600 hover:border-zinc-500 text-zinc-400 hover:text-white text-sm py-2.5 rounded-xl transition-colors">
                      ＋ Agregar otro método
                    </button>
                  </div>
                  {(() => {
                    const lineasContables = lineasPago.filter(l => l.metodoPago === 'efectivo' || l.voucherDatosIA)
                    const totalPagado = lineasContables.reduce((s, l) => s + Number(l.monto || 0), 0)
                    const saldoRestante = montoSeleccionado - totalPagado
                    return (
                      <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 space-y-1.5">
                        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">Resumen</p>
                        {lineasContables.map((l, i) => (
                          <div key={l.id} className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500">Pago {i + 1} · {l.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</span>
                            <span className="text-white font-medium">{l.monto ? fmt(Number(l.monto)) : '—'}</span>
                          </div>
                        ))}
                        <div className="border-t border-zinc-700 pt-1.5 mt-1.5 space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-400">Total pagado</span>
                            <span className="text-white font-bold">{fmt(totalPagado)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-400">Deuda actual</span>
                            <span className="text-zinc-300">{fmt(montoSeleccionado)}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm font-bold">
                            <span className="text-zinc-300">Saldo restante</span>
                            <span className={saldoRestante === 0 ? 'text-emerald-400' : saldoRestante > 0 ? 'text-yellow-400' : 'text-red-400'}>
                              {saldoRestante < 0 ? `${fmt(Math.abs(saldoRestante))} de más` : fmt(saldoRestante)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Notas (opcional)</label>
                    <input value={notasPago} onChange={e => setNotasPago(e.target.value)}
                      placeholder="Observaciones..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                  </div>
                  <div className="flex justify-center pt-1">
                    <GpsIndicator estado={gpsRecaudo.estado} intento={gpsRecaudo.intento} max={gpsRecaudo.MAX_INTENTOS} pos={gpsRecaudo.pos} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setRecaudandoCartera(null)}
                      className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
                    <button onClick={registrarPago}
                      disabled={guardandoPago || lineasPago.some(l => l.metodoPago === 'transferencia' && !l.voucherKey) || lineasPago.filter(l => l.metodoPago === 'efectivo' || l.voucherDatosIA).reduce((s, l) => s + Number(l.monto || 0), 0) === 0}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-2xl">
                      {guardandoPago ? 'Guardando...' : 'Confirmar pago'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )
    })()}

    {modalSync && syncInfo?.tieneIntegracion && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 pt-20" onClick={() => setModalSync(false)}>
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold text-lg">🔄 Sincronización</h3>
            <button onClick={() => setModalSync(false)} className="text-zinc-500 hover:text-white text-xl">×</button>
          </div>
          <div className="space-y-3 text-sm">
            <div className="bg-zinc-800/60 rounded-xl p-3">
              <div className="text-zinc-400 text-xs mb-1">Última sincronización</div>
              <div className="text-white font-semibold">
                {syncInfo.ultimaSync
                  ? new Date(syncInfo.ultimaSync).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
                  : 'Nunca'}
              </div>
            </div>
            {syncInfo.historial && syncInfo.historial.length > 0 && (
              <div className="bg-zinc-800/60 rounded-xl p-3 max-h-48 overflow-y-auto">
                <div className="text-zinc-400 text-xs mb-2">Historial reciente</div>
                <div className="space-y-1.5">
                  {syncInfo.historial.slice(0, 5).map((h: any) => (
                    <div key={h.id} className="text-xs flex justify-between">
                      <span className="text-zinc-300">{new Date(h.inicio).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <span className="text-zinc-500">
                        {h.clientesActualizados} cli · {h.deudasSincronizadas} deu
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => { setModalSync(false); dispararSync() }}
            disabled={sincronizando}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl disabled:opacity-50">
            {sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>
        </div>
      </div>
    )}
    </div>
  )
}
