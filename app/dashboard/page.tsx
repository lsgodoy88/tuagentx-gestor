'use client'
import { fetchApi, errorMsg } from '@/lib/fetchApi'
import FirmaCanvas from '@/components/FirmaCanvas'
import { useSession } from 'next-auth/react'
import ModalVisita from '@/components/ModalVisita'
import { useEffect, useState, useRef } from 'react'
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
  const [empresaDetalleSA, setEmpresaDetalleSA] = useState<string | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [modalVisita, setModalVisita] = useState<{open: boolean, tipo: string}>({open: false, tipo: 'visita'})
  const [clienteModal, setClienteModal] = useState<any>(null)
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
  const [rrCliente, setRrCliente] = useState<any>(null)
  const [rrVerificando, setRrVerificando] = useState(false)
  const [rrSinDeuda, setRrSinDeuda] = useState(false)
  // Modal pago cartera
  const [recaudandoCartera, setRecaudandoCartera] = useState<any>(null)
  const [detalleData, setDetalleData] = useState<any>(null)
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
        setClientesOrdenados(r?.clientes?.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null, rezago: rc.rezago, orden: rc.orden })) || [])
        setTurno(t)
        setPuedeCapturarGps(me?.puedeCapturarGps === true)
      })
      if (user.role === 'vendedor') {
        setLoadingStats(true)
        fetch('/api/vendedor/stats').then(r => r.json()).then(d => {
          setStatsVendedor(d)
          setLoadingStats(false)
        }).catch(() => setLoadingStats(false))
      }
    } else {
      fetch('/api/stats').then(r => r.json()).then(d => setStats(d)).catch(() => {})
    if (isEmpresa || isSupervisor) fetch('/api/monitor').then(r => r.json()).then(d => { if (Array.isArray(d)) setMonitor(d) }).catch(() => {})
    if (isEmpresa || isSupervisor || isBodega) fetch('/api/bodega/despachos').then(r => r.json()).then(d => { if (d.despachos) { const hoy = new Date().toDateString(); setBodegaStats({ pendientes: d.despachos.filter((o:any) => o.estado==='pendiente').length, alistados: d.despachos.filter((o:any) => o.estado==='alistado').length, entregados: d.despachos.filter((o:any) => ['en_entrega','entregado'].includes(o.estado) && new Date(o.entregadoEl||'').toDateString()===hoy).length }) } }).catch(()=>{})
    }
  }, [user])
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
    rrLoadClientes('', 1)
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
    setGuardandoPago(true)
    let ultimoToken: string | null = null
    for (const linea of lineasPago) {
      const res = await fetch('/api/cartera/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carteraId: detalleData.id,
          monto: Number(linea.monto || 0),
          descuento: Number(linea.descuento || 0),
          tipo: 'abono',
          metodoPago: linea.metodoPago,
          notas: notasPago || undefined,
          detalleIds: facturasSeleccionadas,
          ...(linea.voucherKey ? { voucherKey: linea.voucherKey, voucherDatosIA: linea.voucherDatosIA } : {}),
        })
      })
      const d = await res.json()
      if (d.pago?.reciboToken) ultimoToken = d.pago.reciboToken
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
          <h1 className="text-2xl font-bold text-white">Bienvenido, {user?.name}</h1>
          <p className="text-zinc-400 text-sm mt-1">Superadmin</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-emerald-400 font-semibold text-lg">💰 Facturación mensual</p>
            <p className="text-zinc-400 text-xs mt-0.5">{resumenFinanciero?.resumenEmpresas?.length || 0} empresa{resumenFinanciero?.resumenEmpresas?.length !== 1 ? 's' : ''} activa{resumenFinanciero?.resumenEmpresas?.length !== 1 ? 's' : ''}</p>
          </div>
          <p className="text-emerald-400 font-bold text-2xl">${totalMensual.toLocaleString('es-CO')}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
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
      <div>
        <h1 className="text-2xl font-bold text-white">Bienvenido, {user?.name}</h1>
        <p className="text-zinc-400 text-sm mt-1 capitalize">{user?.role}</p>
      </div>
      {(isEmpresa || isSupervisor) && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Empleados', value: stats.empleados, icon: '👥', sub: (stats.enTurno || 0) + ' en turno' },
              { label: 'Clientes', value: stats.clientes, icon: '🏪', sub: 'registrados' },
              { label: 'Visitas hoy', value: stats.visitasHoy || 0, icon: '📍', sub: 'del día' },
              { label: 'Ventas hoy', value: '$' + (stats.ventasHoy || 0).toLocaleString('es-CO'), icon: '💰', sub: 'en efectivo' },
            ].map(s => (
              <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="text-2xl mb-2">{s.icon}</div>
                <div className="text-xl font-bold text-white truncate">{s.value}</div>
                <div className="text-zinc-400 text-xs mt-0.5">{s.label}</div>
                <div className="text-zinc-600 text-xs">{s.sub}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
              <p className="text-blue-400 text-xs font-semibold mb-1">VENTAS 30 DÍAS</p>
              <p className="text-white text-2xl font-bold">{"$" + (stats.ventasMes || 0).toLocaleString('es-CO')}</p>
              <p className="text-zinc-500 text-xs mt-1">{stats.porTipo?.venta || 0} transacciones</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
              <p className="text-emerald-400 text-xs font-semibold mb-1">COBROS 30 DÍAS</p>
              <p className="text-white text-2xl font-bold">{"$" + (stats.cobrosMes || 0).toLocaleString('es-CO')}</p>
              <p className="text-zinc-500 text-xs mt-1">{stats.porTipo?.cobro || 0} transacciones</p>
            </div>
          </div>
          {stats.visitasPorDia && stats.visitasPorDia.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
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
          {/* Monitor empleados en turno */}
          {monitor.length > 0 && (
            <div className="space-y-4">
              {['vendedor', 'impulsadora', 'entregas'].map(rol => {
                const empleadosRol = monitor.filter((m: any) => m.rol === rol)
                if (empleadosRol.length === 0) return null
                const titulo = rol === 'vendedor' ? 'Vendedores' : rol === 'impulsadora' ? 'Impulsadoras' : 'Entregas'
                return (
                  <div key={rol} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
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
      )}
      {isBodega && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">📦 Órdenes bodega hoy</h3>
            <a href="/dashboard/ordenes" className="text-emerald-400 text-xs">Ver órdenes →</a>
          </div>
          {bodegaStats ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center"><p className="text-2xl font-bold text-amber-400">{bodegaStats.pendientes}</p><p className="text-zinc-500 text-xs">🟡 Pendientes</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-emerald-400">{bodegaStats.alistados}</p><p className="text-zinc-500 text-xs">🟢 Alistados</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-blue-400">{bodegaStats.entregados}</p><p className="text-zinc-500 text-xs">✅ Entregados</p></div>
            </div>
          ) : <p className="text-zinc-500 text-xs text-center">Cargando...</p>}
        </div>
      )}
      {isEmpleado && (
        <div className="space-y-4">
          {turno?.pausado ? (
            // TARJETA PAUSA
            <div className="rounded-2xl p-4 border bg-amber-500/8 border-amber-500/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                <span className="font-semibold text-amber-400">En pausa · {turno.pausaMotivo}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-black/30 rounded-lg p-2"><p className="text-zinc-500 text-xs">Inicio pausa</p><p className="text-sm font-bold text-white">{turno.pausaInicio ? new Date(turno.pausaInicio).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}) : "--"}</p></div>
                <div className="bg-black/30 rounded-lg p-2"><p className="text-zinc-500 text-xs">Reanuda a las</p><p className="text-emerald-400 text-sm font-bold">{new Date(new Date(turno.pausaInicio).getTime() + turno.pausaDuracionMin*60000).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</p></div>
              </div>
              <div className="bg-amber-500/6 border border-amber-500/15 rounded-xl p-2 flex items-center gap-2 mb-3">
                <span className="text-amber-400 text-xs flex-1">Se reanuda automáticamente en</span>
                <span className="text-amber-400 font-mono font-bold text-sm">{pausaCountdown}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={reanudarTurno} className="flex-1 bg-zinc-800 border border-emerald-500/30 text-emerald-400 text-sm font-semibold py-2 rounded-xl">▶️ Reanudar ahora</button>
                <a href="/dashboard/turno" className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2 rounded-xl flex items-center justify-center gap-1">📅 Historial</a>
              </div>
            </div>
          ) : turno ? (
            // TARJETA TURNO ACTIVO
            <div className="rounded-2xl p-4 border bg-emerald-500/10 border-emerald-500/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-emerald-400">Turno activo</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-black/30 rounded-lg p-2"><p className="text-zinc-500 text-xs">Hora inicio</p><p className="text-sm font-bold text-white">{new Date(turno.inicio).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</p></div>
                <div className="bg-black/30 rounded-lg p-2"><p className="text-zinc-500 text-xs">Contador</p><p className="text-emerald-400 font-mono font-bold">{tiempoTurno}</p></div>
              </div>
              <button onClick={cerrarTurno} disabled={bloqueadoTurno} className="w-full bg-red-600 text-white text-sm font-bold py-2 rounded-xl mb-2 disabled:opacity-50">Cerrar turno</button>
              <div className="flex gap-2">
                <button onClick={() => setMostrarPausa(m => !m)} className={"flex-1 text-sm font-semibold py-2 rounded-xl border " + (mostrarPausa ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>⏸️ Pausar</button>
                <a href="/dashboard/turno" className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2 rounded-xl flex items-center justify-center gap-1">📅 Historial</a>
              </div>
              {mostrarPausa && (
                <div className="mt-3 bg-black/30 rounded-xl p-3 border border-zinc-700">
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
          ) : (
            // SIN TURNO
            <div className="rounded-2xl p-4 border bg-zinc-900 border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-zinc-600" />
                <span className="font-semibold text-zinc-400">Sin turno activo</span>
              </div>
              <button onClick={iniciarTurno} disabled={bloqueadoTurno} className="w-full bg-emerald-600 text-white text-sm font-bold py-2 rounded-xl mb-2 disabled:opacity-50">Iniciar turno</button>
              <a href="/dashboard/turno" className="flex items-center justify-center gap-1 w-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold py-2 rounded-xl">📅 Historial</a>
            </div>
          )}
          {ruta && totalClientes > 0 && !rutaCompletada ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <p className="text-white font-bold text-lg truncate">{ruta.nombre}</p>
                  {rutaCompletada && <span className="text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-2 py-1 rounded-lg flex-shrink-0">✅ Completa</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-zinc-400 text-sm">🏪 {totalClientes}</span>
                  <span className="text-emerald-400 text-sm">✅ {ejecutadosRuta}</span>
                  <span className="text-zinc-500 text-sm">⏳ {totalClientes - ejecutadosRuta}</span>
                </div>
                <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{width: totalClientes > 0 ? (ejecutadosRuta/totalClientes*100) + '%' : '0%'}} />
                </div>
              </div>
              <div className="flex gap-2">
                {user?.role === 'entregas' && turno && (
                  <button onClick={() => abrirModalVisita('entrega')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                    <span>📦</span><span>+ Entrega</span>
                  </button>
                )}
                <button onClick={() => router.push('/dashboard/mapa-ruta')}
                  className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-2 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                  <span>🗺️</span><span>Mapa</span>
                </button>
              </div>
            </div>
          ) : null}
          {user?.role === 'vendedor' && turno && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <p className="text-white font-bold">📦 Ruta de hoy</p>
                <span className="text-zinc-400 text-xs">{ejecutadosRuta}/{totalClientes} entregas</span>
              </div>
              <div className="divide-y divide-zinc-800">
                {clientesOrdenados.sort((a: any, b: any) => a.orden - b.orden).map((c: any) => {
                  const entregado = visitasRuta.some((v: any) => {
                    if (v.clienteId !== c.id) return false
                    const fv = v.fechaBogota ? new Date(v.fechaBogota).toISOString().split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
                    return fv === fechaRuta
                  })
                  const esRezago = c.rezago === true
                  return (
                    <div key={c.id} className={"py-3 px-4 " + (entregado ? "opacity-50" : esRezago ? "bg-orange-500/5 border-l-2 border-orange-500" : "")}>
                      {/* Fila 1: número + nombre + botón */}
                      <div className="flex items-center gap-3">
                        <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 " + (entregado ? "bg-emerald-500/20 text-emerald-400" : esRezago ? "bg-orange-500/20 text-orange-400" : "bg-zinc-700 text-white")}>
                          {entregado ? "✓" : esRezago ? "!" : c.orden + 1}
                        </div>
                        <p className={"flex-1 min-w-0 text-sm font-bold truncate " + (entregado ? "text-zinc-500 line-through" : esRezago ? "text-orange-300" : "text-white")}>
                          {c.nombre}
                          {esRezago && !entregado && <span className="ml-1.5 text-orange-400 text-xs bg-orange-500/10 px-1.5 py-0.5 rounded font-semibold">Rezago</span>}
                        </p>
                        {!entregado && turno && (
                          <button onClick={(e) => { e.stopPropagation()
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
                            className={"text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 " + (esRezago ? "bg-orange-500 hover:bg-orange-400" : "bg-emerald-600 hover:bg-emerald-500")}>
                            Entregar
                          </button>
                        )}
                        {entregado && <span className="text-emerald-400 text-xs flex-shrink-0">✅ Listo</span>}
                      </div>
                      {/* Fila 2: dirección */}
                      {c.direccion && (
                        <p className="text-zinc-500 text-xs truncate mt-1 pl-11">
                          📍 {c.direccion}
                          {c.lat && c.lng && (
                            <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank"
                              className="ml-1.5 text-emerald-500 hover:text-emerald-400" onClick={e => e.stopPropagation()}>Maps</a>
                          )}
                        </p>
                      )}
                      {/* Fila 3: badge empresa + teléfono */}
                      {(c.supervisorEtiqueta || c.nombreComercial || c.telefono) && (
                        <div className="flex items-center gap-2 mt-1 pl-11 flex-wrap">
                          {(c.supervisorEtiqueta || c.nombreComercial) && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-semibold bg-zinc-700 text-zinc-300">
                              {c.supervisorEtiqueta || c.nombreComercial}
                            </span>
                          )}
                          {c.telefono && (
                            <a href={"tel:" + c.telefono} className="text-blue-400 text-xs hover:text-blue-300" onClick={e => e.stopPropagation()}>
                              📞 {c.telefono}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
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
              {loadingStats && <div className="text-zinc-400 text-center py-4 text-sm">Cargando estadísticas...</div>}
              {!loadingStats && statsVendedor && (
                <div className="space-y-4">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-white font-bold mb-3">Hoy</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-zinc-800 rounded-xl p-3">
                        <p className="text-zinc-400 text-xs">Visitas</p>
                        <p className="text-white text-2xl font-bold">{statsVendedor.hoy.total}</p>
                      </div>
                      <div className="bg-zinc-800 rounded-xl p-3">
                        <p className="text-zinc-400 text-xs">Ventas</p>
                        <p className="text-white text-2xl font-bold">{statsVendedor.hoy.ventas}</p>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                        <p className="text-zinc-400 text-xs">$ Ventas</p>
                        <p className="text-emerald-400 font-bold">${statsVendedor.hoy.montoVentas.toLocaleString('es-CO')}</p>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                        <p className="text-zinc-400 text-xs">Recaudo</p>
                        <p className="text-blue-400 font-bold">${statsVendedor.hoy.montoCobros.toLocaleString('es-CO')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
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
                  {statsVendedor.cumplimiento?.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
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
          Promise.all([
            fetch('/api/rutas/mi-ruta').then(r => r.json()),
            fetch('/api/visitas/todas').then(r => r.json()),
          ]).then(([r, v]) => {
            setRuta(r)
            setClientesOrdenados(r?.clientes?.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null, rezago: rc.rezago, orden: rc.orden })) || [])
            setVisitasRuta(Array.isArray(v) ? v : [])
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
        onRegistrado={() => {
          Promise.all([
            fetch('/api/rutas/mi-ruta').then(r => r.json()),
            fetch('/api/visitas/todas').then(r => r.json()),
          ]).then(([r, v]) => {
            setRuta(r)
            setClientesOrdenados(r?.clientes?.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null, rezago: rc.rezago, orden: rc.orden })) || [])
            setVisitasRuta(Array.isArray(v) ? v : [])
          })
        }}
        clienteInicial={clienteModal}
        tipoForzado="entrega"
        distanciaLejos={distanciaLejos}
        puedeCapturarGps={puedeCapturarGps}
        titulo="📦 Registrar entrega"
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
          <div className="px-6 py-4 space-y-3">
            {!rrCliente ? (
              <>
                <input
                  value={rrBuscar}
                  onChange={e => { setRrBuscar(e.target.value); setRrPage(1); rrLoadClientes(e.target.value, 1) }}
                  placeholder="Buscar cliente..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
                  autoFocus
                />
                <div className="space-y-2">
                  {rrLoadingCli && <p className="text-zinc-500 text-xs text-center py-2">Cargando...</p>}
                  {rrClientes.map((c: any) => (
                    <button key={c.id} onClick={() => rrSeleccionarCliente(c)}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl p-3 text-left transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium">{c.nombre}</p>
                          {c.nombreComercial && <p className="text-zinc-400 text-xs">{c.nombreComercial}</p>}
                          {c.direccion && <p className="text-zinc-500 text-xs truncate">{c.direccion}</p>}
                        </div>
                        {c.lat && c.lng && (
                          <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank"
                            onClick={e => e.stopPropagation()}
                            className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg text-xs flex-shrink-0 hover:bg-emerald-500/20">
                            📍
                          </a>
                        )}
                      </div>
                    </button>
                  ))}
                  {rrTotal > RR_LIMIT && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-zinc-600 text-xs">{((rrPage-1)*RR_LIMIT)+1}–{Math.min(rrPage*RR_LIMIT,rrTotal)} de {rrTotal}</p>
                      <div className="flex gap-2">
                        <button onClick={() => { const p = rrPage-1; setRrPage(p); rrLoadClientes(rrBuscar, p) }} disabled={rrPage===1}
                          className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">← Ant</button>
                        <button onClick={() => { const p = rrPage+1; setRrPage(p); rrLoadClientes(rrBuscar, p) }} disabled={rrPage*RR_LIMIT>=rrTotal}
                          className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig →</button>
                      </div>
                    </div>
                  )}
                </div>
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
                <div className="space-y-2">{Array.from({length:3}).map((_,i)=><div key={i} className="animate-pulse bg-zinc-800 rounded-xl h-12"/>)}</div>
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
                              <input type="number" value={linea.monto}
                                onChange={e => setLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, monto: e.target.value } : l))}
                                className="w-full bg-zinc-700 border border-zinc-600 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                            </div>
                            <div className="flex-[3]">
                              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Descuento</label>
                              <input type="number" value={linea.descuento} placeholder="0"
                                onChange={e => setLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, descuento: e.target.value } : l))}
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
                                  <input type="number" value={linea.monto} readOnly
                                    className="w-full bg-zinc-700/50 border border-zinc-600 rounded-xl px-4 py-2.5 text-zinc-300 text-sm outline-none cursor-not-allowed" />
                                </div>
                                <div className="flex-[3]">
                                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Descuento</label>
                                  <input type="number" value={linea.descuento} placeholder="0"
                                    onChange={e => {
                                      const desc = e.target.value
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
                  <div className="flex gap-2 pt-1">
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
    </div>
  )
}
