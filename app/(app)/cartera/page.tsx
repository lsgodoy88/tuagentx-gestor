'use client'
import DataTable, { ColDef } from '@/components/DataTable'
import { mesBogota, anioBogota, esDelMesBogota } from '@/lib/fechas'
import { useEffect, useState, useRef, useCallback } from 'react'
import { saveCache, loadCache } from '@/lib/offlineCache'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { calcularEstado, estadoMasCritico } from '@/lib/cartera'
import { CountUp, LiveDot, LoadingBorder } from '@/components/FX'
import InputMoneda from '@/components/InputMoneda'
import SelectorMes from '@/components/SelectorMes'
import CarteraCard from '@/components/CarteraCard'
import ModalRecaudo from '@/components/ModalRecaudo'
import { ROLES_ADMIN } from '@/lib/auth-helpers'
import type { PagoListado, ComisionVendedor } from '@/lib/types/cartera'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const fmtShort = (n: number): string => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' mill'
  if (n >= 1_000)     return '$' + (n / 1_000).toLocaleString('es-CO',     { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' K'
  return '$' + Math.round(n).toLocaleString('es-CO')
}

type LineaPago = { id: string; metodoPago: 'efectivo' | 'transferencia'; monto: string; descuento: string; voucherKey: string | null; voucherDatosIA: any; cargandoVoucher: boolean }
function crearLinea(): LineaPago { return { id: crypto.randomUUID(), metodoPago: 'efectivo', monto: '', descuento: '', voucherKey: null, voucherDatosIA: null, cargandoVoucher: false } }

const ESTADO_CONFIG: Record<string, { label: string; color: string; border: string; text: string }> = {
  critica:  { label: '⛔ Crítica',     color: 'bg-red-950/40',     border: 'border-red-700/60',    text: 'text-red-400' },
  mora:     { label: '🔴 En mora',     color: 'bg-rose-950/40',    border: 'border-rose-700/60',   text: 'text-rose-400' },
  vencida:  { label: '🟠 Vencida',     color: 'bg-orange-950/40',  border: 'border-orange-700/60', text: 'text-orange-400' },
  proxima:  { label: '⚠️ Por vencer',  color: 'bg-amber-950/40',   border: 'border-amber-700/60',  text: 'text-amber-400' },
  pendiente:{ label: '🟡 Pendiente',   color: 'bg-yellow-950/40',  border: 'border-yellow-700/60', text: 'text-yellow-400' },
  vigente:  { label: '🔵 Vigente',     color: 'bg-blue-950/40',    border: 'border-blue-500/30',   text: 'text-blue-400' },
  abonada:  { label: '🔵 Abonada',     color: 'bg-blue-950/40',    border: 'border-blue-500/30',   text: 'text-blue-400' },
  pagada:   { label: '✅ Pagada',      color: 'bg-emerald-950/40', border: 'border-emerald-700/60',text: 'text-emerald-400' },
}

const ESTADO_COLOR: Record<string, string> = {
  critica: '#dc2626', mora: '#f43f5e', vencida: '#f97316',
  proxima: '#f59e0b', pendiente: '#eab308', vigente: '#3b82f6',
  abonada: '#3b82f6', pagada: '#22c55e',
}
const ESTADO_LABEL: Record<string, string> = {
  critica: 'Crítica', mora: 'En mora', vencida: 'Vencida',
  proxima: 'Por vencer', pendiente: 'Pendiente', vigente: 'Vigente',
  abonada: 'Abonada', pagada: 'Pagada',
}
function estadoPrincipal(porEstado: any): string {
  for (const e of ['critica','mora','vencida','pendiente','abonada','pagada'])
    if (porEstado?.[e] > 0) return e
  return 'pendiente'
}

export default function CarteraPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any
  const esAdmin = user?.role === 'empresa' || user?.role === 'supervisor'
  const esVendedor = user?.role === 'vendedor'
  const searchParamsCartera = useSearchParams()
  const [tab, setTab] = useState<'cartera' | 'clientes' | 'pagos' | 'comisiones'>(
    (searchParamsCartera.get('tab') as any) || 'clientes'
  )
  const [isDesktopPagos, setIsDesktopPagos] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : false)
  const [mesAnalisis, setMesAnalisis] = useState(mesBogota())
  const [anioAnalisis, setAnioAnalisis] = useState(anioBogota())
  const [mesSel, setMesSel] = useState(mesBogota())
  const [anioSel, setAnioSel] = useState(anioBogota())
  const [metaForm, setMetaForm] = useState({ empleadoId: '', carteraBase: '', metaPct: '' })
  const [guardandoMeta, setGuardandoMeta] = useState(false)
  const [vendedores, setVendedores] = useState<any[]>([])
  const [vendedorPagoId, setVendedorPagoId] = useState('')
  const [busquedaPagos, setBusquedaPagos] = useState('')
  const [mesPagos, setMesPagos] = useState(mesBogota())
  const [anioPagos, setAnioPagos] = useState(anioBogota())
  const [comisiones, setComisiones] = useState<ComisionVendedor[]>([])
  const [comisionCalculo, setComisionCalculo] = useState<any>(null)
  const [loadingComisiones, setLoadingComisiones] = useState(false)
  const [nombreComision, setNombreComision] = useState('')
  const [guardandoComision, setGuardandoComision] = useState(false)
  const [mesComision, setMesComision] = useState(mesBogota())
  const [anioComision, setAnioComision] = useState(anioBogota())

  const [carteras, setCarteras] = useState<any[]>([])
  const [pagos, setPagos] = useState<PagoListado[]>([])
  const [metas, setMetas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [cacheAgeCartera, setCacheAgeCartera] = useState<number|null>(null)
  const [loadingBusqueda, setLoadingBusqueda] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [hayMas, setHayMas] = useState(false)
  const [paginaActual, setPaginaActual] = useState(1)
  const [totalReal, setTotalReal] = useState<{saldoPendiente:number, saldoTotal:number, clientes:number} | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  type SyncLogItem = { id: string; inicio: string; fin: string|null; duracionMs: number; clientesActualizados: number; empleadosSincronizados: number; deudasSincronizadas: number; zombis: number; pagosConfrontados: number; disparadoPor: string; estado: string; errores: any }
  const [syncInfo, setSyncInfo] = useState<{ultimaSync: string|null, ultimaSyncCompleta?: string|null, tieneIntegracion?: boolean, historial?: SyncLogItem[]}|null>(null)
  const [modalSync, setModalSync] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Importar

  // Recaudar modal
  const [recaudandoCartera, setRecaudandoCartera] = useState<any>(null)
  const [detalleData, setDetalleData] = useState<any>(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [facturasSeleccionadas, setFacturasSeleccionadas] = useState<string[]>([])
  const [lineasPago, setLineasPago] = useState<LineaPago[]>([crearLinea()])
  const [notasPago, setNotasPago] = useState('')
  const [guardandoPago, setGuardandoPago] = useState(false)
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    cargarDatos()
    if ((session?.user as any)?.role !== 'vendedor') {
      fetch('/api/empleados?rol=vendedor').then(r => r.json()).then(d => setVendedores(d.empleados || [])).catch(() => {})
    }
  }, [status])

  async function cargarDatos(q = '') {
    setPaginaActual(1)
    const url = q ? `/api/cartera?limit=15&q=${encodeURIComponent(q)}` : '/api/cartera?limit=15'

    // Stale-while-revalidate: mostrar caché inmediatamente, red en paralelo
    if (!q) {
      const cached = loadCache<any>('cartera')
      if (cached) {
        const { r1, r2, r3 } = cached.data
        setCarteras(r1.carteras || [])
        setHayMas((r1.pages ?? 1) > 1)
        setPagos(r2.pagos || [])
        setMetas(r3.metas || [])
        const age = Math.floor((Date.now() - cached.savedAt) / 60_000)
        setCacheAgeCartera(age)
        setLoading(false)
        // Fetch en segundo plano para actualizar
        Promise.all([
          fetch(url).then(r => r.json()),
          fetch(`/api/recaudos?limit=500&mes=${mesPagos}&anio=${anioPagos}${vendedorPagoId ? '&vendedorId='+vendedorPagoId : ''}`).then(r => r.json()).catch(() => ({ pagos: [] })),
          fetch('/api/cartera/metas').then(r => r.json()).catch(() => ({ metas: [] })),
        ]).then(([nr1, nr2, nr3]) => {
          if (nr1.carteras) {
            saveCache('cartera', { r1: nr1, r2: nr2, r3: nr3 })
            setCarteras(nr1.carteras || [])
            setHayMas((nr1.pages ?? 1) > 1)
            if (nr1.totalSaldoPendiente !== undefined) setTotalReal({ saldoPendiente: nr1.totalSaldoPendiente, saldoTotal: nr1.totalSaldoTotal, clientes: nr1.total || 0 })
            setPagos(nr2.pagos || [])
            setMetas(nr3.metas || [])
            setOffline(false)
            setCacheAgeCartera(null)
          }
        }).catch(() => {
          // Sin red — los datos del caché ya están en pantalla, solo marcar offline
          setOffline(true)
        })
        return
      }
      // Sin caché — carga normal con spinner
      setLoading(true)
    } else {
      setLoadingBusqueda(true)
    }

    let r1: any, r2: any, r3: any
    try {
      ;[r1, r2, r3] = await Promise.all([
        fetch(url).then(r => r.json()),
        fetch('/api/recaudos?limit=500').then(r => r.json()).catch(() => ({ pagos: [] })),
        fetch('/api/cartera/metas').then(r => r.json()).catch(() => ({ metas: [] })),
      ])
      if (!q && r1.carteras) {
        saveCache('cartera', { r1, r2, r3 })
        setOffline(false)
        setCacheAgeCartera(null)
      }
    } catch {
      if (q) { setLoadingBusqueda(false); return }
      setOffline(true)
      setLoading(false)
      return
    }
    setCarteras(r1.carteras || [])
    setHayMas((r1.pages ?? 1) > 1)
    if (r1.totalSaldoPendiente !== undefined) setTotalReal({ saldoPendiente: r1.totalSaldoPendiente, saldoTotal: r1.totalSaldoTotal, clientes: r1.total || 0 })
    setPagos(r2.pagos || [])
    setMetas(r3.metas || [])
    setLoading(false); setLoadingBusqueda(false)
  }

  async function cargarMas() {
    if (cargandoMas || !hayMas) return
    setCargandoMas(true)
    const sig = paginaActual + 1
    const url = buscar
      ? `/api/cartera?limit=15&page=${sig}&q=${encodeURIComponent(buscar)}`
      : `/api/cartera?limit=15&page=${sig}`
    const data = await fetch(url).then(r => r.json())
    setCarteras(prev => [...prev, ...(data.carteras || [])])
    setPaginaActual(sig)
    setHayMas(sig < (data.pages ?? 1))
    setCargandoMas(false)
  }

  function onBuscarChange(valor: string) {
    setBuscar(valor)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => cargarDatos(valor), 400)
  }

  useEffect(() => {
    fetch('/api/integracion/estado').then(r => r.json()).then(d => {
      setSyncInfo({ ultimaSync: d.ultimaSync ?? null, ultimaSyncCompleta: d.ultimaSyncCompleta ?? null, tieneIntegracion: d.tieneIntegracion ?? false, historial: d.historial ?? [] })
    }).catch(() => {})
  }, [])

  async function sincronizar() {
    setSincronizando(true)
    try {
      await fetch('/api/integracion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'delta' })
      })
    } catch {}
    await cargarDatos(buscar)
    fetch('/api/integracion/estado').then(r => r.json()).then(d => setSyncInfo({ ultimaSync: d.ultimaSync ?? null, ultimaSyncCompleta: d.ultimaSyncCompleta ?? null, tieneIntegracion: d.tieneIntegracion ?? false, historial: d.historial ?? [] })).catch(() => {})
    setSincronizando(false)
  }

  // Agregados por estado
  const porEstado = carteras.reduce((acc, c) => {
    const detalles = c.DetalleCartera || []
    for (const d of detalles) {
      const vf = Number(d.valorFactura ?? d.valor)
      const ab = Number(d.abonos ?? 0)
      const saldo = Math.max(0, vf - ab)
      const { estado } = calcularEstado(saldo, vf, ab, d.fechaVencimiento ? new Date(d.fechaVencimiento) : null)
      acc[estado] = (acc[estado] ?? 0) + saldo
    }
    return acc
  }, {} as Record<string, number>)

  const totalPendiente = totalReal ? totalReal.saldoPendiente : carteras.reduce((s, c) => s + Number(c.saldoPendiente), 0)

  const filtradas = carteras

  // --- Importar ---


  // --- Recaudar ---
  async function abrirRecaudar(cartera: any) {
    setRecaudandoCartera(cartera)
    setDetalleData(null)
    setFacturasSeleccionadas([])
    setLineasPago([crearLinea()])
    setNotasPago('')
    setLoadingDetalle(true)
    const res = await fetch(`/api/cartera/${cartera.clienteId}`)
    const data = await res.json()
    setLoadingDetalle(false)
    const detalleCartera = data.cartera
    if (detalleCartera && (detalleCartera._modo === 'sync' || data._modo === 'sync')) {
      // Convertir deudas sync a formato DetalleCartera
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
        concepto: null,
        _sync: true,
      }))
      detalleCartera.DetalleCartera = detallesNorm
    }
    setDetalleData(detalleCartera)
    const pendientes = (detalleCartera?.DetalleCartera || [])
      .filter((d: any) => d.estado !== 'pagada')
      .sort((a: any, b: any) => { const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity; const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity; return fa - fb })
    const masAntigua = pendientes[0]?.id ? [pendientes[0].id] : []
    setFacturasSeleccionadas(masAntigua)
    setLineasPago([crearLinea()])
  }

  function abrirWhatsApp(cartera: any) {
    const telefono = (cartera.cliente?.celular || cartera.cliente?.telefono || cartera.telefono || cartera.celular || '').replace(/\D/g, '')
    if (!telefono) { alert('Cliente sin teléfono registrado'); return }

    const deudas = (cartera.DetalleCartera || cartera.deudas || [])
      .filter((d: any) => d.estado !== 'pagada' && Number(d.saldo ?? d.saldoPendiente ?? 0) > 0)
      .sort((a: any, b: any) => { const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity; const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity; return fa - fb })

    if (!deudas.length) { alert('Sin facturas pendientes'); return }

    const nombreCliente = cartera.cliente?.nombre || cartera.nombre || ''
    const nombreEmpresa = (user as any)?.empresa?.nombre || (user as any)?.empresaNombre || 'nuestra empresa'
    const total = deudas.reduce((sum: number, d: any) => sum + Number(d.saldo ?? d.saldoPendiente ?? 0), 0)

    let mensaje = `Hola Sr(a) *${nombreCliente}*, le recordamos que tiene *${deudas.length} factura${deudas.length > 1 ? 's' : ''} pendiente${deudas.length > 1 ? 's' : ''}*:\n`

    deudas.forEach((d: any) => {
      mensaje += `\n📋 Fact. ${d.numeroFactura || d.numeroOrden || ''} → $${Number(d.saldo ?? d.saldoPendiente ?? 0).toLocaleString('es-CO')}`
      if (d.fechaVencimiento) mensaje += ` _(vence ${new Date(d.fechaVencimiento).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Bogota' })})_`
    })

    mensaje += `\n\n💰 *Total pendiente: $${total.toLocaleString('es-CO')}*`
    mensaje += `\n\nAgradecemos su pronto pago.\n— ${nombreEmpresa}`

    window.open(`https://wa.me/57${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank')
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
      const tempId = crypto.randomUUID()
      const res = await fetch('/api/cartera/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoBase64, mimeType: file.type, pagoId: tempId }),
      })
      const data = await res.json()
      setLineasPago(prev => prev.map(l => l.id === lineaId ? {
        ...l,
        voucherKey: data.key,
        voucherDatosIA: data.datosIA,
        cargandoVoucher: false,
        monto: data.datosIA?.valor ? String(Math.round(data.datosIA.valor)) : l.monto,
        descuento: '0',
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
    let ultimoId: string | null = null
    let ultimoToken: string | null = null
    let ultimoAnchoPapel: string = '80mm'
    for (const linea of lineasPago) {
      const res = await fetch('/api/cartera/pago-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncDeudaIds: facturasSeleccionadas,
          clienteApiId: detalleData.clienteApiId,
          integracionId: detalleData.integracionId,
          monto: Number(linea.monto || 0),
          descuento: Number(linea.descuento || 0),
          metodoPago: linea.metodoPago,
          notas: notasPago || undefined,
          ...(linea.voucherKey ? { voucherKey: linea.voucherKey, voucherDatosIA: linea.voucherDatosIA } : {}),
        })
      })
      const data = await res.json()
      if (data.pago) { ultimoId = data.pago.id; ultimoToken = data.pago.reciboToken || null; if (data.anchoPapel) ultimoAnchoPapel = data.anchoPapel }
    }
    setGuardandoPago(false)
    if (ultimoId) {
      if (ultimoToken) window.open('/recaudo/recibo?token=' + ultimoToken + (ultimoAnchoPapel === '58mm' ? '&fmt=58mm' : ''), '_blank')
      setRecaudandoCartera(null)
      setLineasPago([crearLinea()])
      setNotasPago('')
      cargarDatos()
    }
  }

  const montoSeleccionado = detalleData?.DetalleCartera
    ?.filter((d: any) => facturasSeleccionadas.includes(d.id) && d.estado !== 'pagada')
    .reduce((acc: number, d: any) => {
      const vf = Number(d.valorFactura ?? d.valor)
      const ab = Number(d.abonos ?? 0)
      return acc + Math.max(0, vf - ab)
    }, 0) ?? 0

  if (status === 'loading' || loading) return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="shimmer rounded-2xl h-24" />
      ))}
    </div>
  )

  const isAdmin = ROLES_ADMIN.includes(user?.role)

  const tabs = [
    { id: 'clientes', label: '📋 Clientes' },
    { id: 'pagos', label: '💳 Pagos' },
    { id: 'cartera', label: '📈 Cartera' },
    ...(isAdmin ? [{ id: 'comisiones', label: '💼 Comisiones' }] : []),
  ] as const


  async function abrirRecibo(pagoId: string) {
    const res = await fetch('/api/cartera/recibo-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagoId })
    })
    const data = await res.json()
    if (data.reciboToken) {
      const fmt = data.anchoPapel === '58mm' ? '&fmt=58mm' : ''
      window.open(`/recaudo/recibo?token=${data.reciboToken}${fmt}`, '_blank')
    } else {
      alert('Error al generar enlace del recibo')
    }
  }

  return (
    <>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Offline banner */}
      {offline && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-400 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          Sin conexión · datos guardados{cacheAgeCartera !== null ? ` hace ${cacheAgeCartera < 1 ? 'menos de 1 min' : cacheAgeCartera + ' min'}` : ''}
        </div>
      )}

      {/* Tabs + botones en misma fila */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === t.id ? 'tab-active' : 'text-white hover:text-white'}`}>{t.label}</button>
        ))}

      </div>

      {tab === 'cartera' && (<div key='tab-cartera' className='fade-up'>
      {(() => {
        const anio = anioAnalisis
        const mes = mesAnalisis

        // Pagos del mes seleccionado
        const pagosMes = pagos.filter((p: any) => {
          const f = new Date(p.createdAt)
          return esDelMesBogota(f, mes, anio)
        })

        // Pagos mes anterior
        const mesAnterior = mes === 1 ? 12 : mes - 1
        const anioAnterior = mes === 1 ? anio - 1 : anio
        const pagosAnt = pagos.filter((p: any) => {
          const f = new Date(p.createdAt)
          return esDelMesBogota(f, mesAnterior, anioAnterior)
        })

        const totalRecaudadoMes = pagosMes.reduce((s: number, p: any) => s + Number(p.monto), 0)
        const totalDescMes = pagosMes.reduce((s: number, p: any) => s + Number(p.descuento || 0), 0)
        const totalMes = totalRecaudadoMes + totalDescMes
        const totalAnt = pagosAnt.reduce((s: number, p: any) => s + Number(p.monto) + Number(p.descuento || 0), 0)
        const variacion = totalAnt > 0 ? Math.round(((totalMes - totalAnt) / totalAnt) * 100) : 0

        const totalCartera = totalReal ? totalReal.saldoTotal
          : carteras.reduce((s: number, c: any) => {
            return s + (c.DetalleCartera || []).reduce((a: number, d: any) => a + Number(d.valorFactura ?? d.valor ?? 0), 0)
          }, 0)
        const totalPend = totalReal ? totalReal.saldoPendiente
          : carteras.reduce((s: number, c: any) => s + Number(c.saldoPendiente), 0)

        // Meta del mes (vendedor: su meta, admin/sup: suma)
        const miMeta = user?.role === 'vendedor'
          ? metas.find((m: any) => m.mes === mes && m.anio === anio)
          : null
        const miMetaPct = miMeta ? Number(miMeta.metaPct) : 0
        const metaPesos = miMetaPct > 0 ? Math.round(totalCartera * miMetaPct / 100) : 0
        const pctMeta = metaPesos > 0 ? Math.min(100, Math.round((totalMes / metaPesos) * 100)) : 0
        const colorMeta = pctMeta >= 80 ? '#34d399' : pctMeta >= 50 ? '#fbbf24' : '#f87171'

        // Por estado
        const porEst: Record<string, number> = {}
        carteras.forEach((c: any) => {
          ;(c.DetalleCartera || []).forEach((d: any) => {
            const vf = Number(d.valorFactura ?? d.valor ?? 0)
            const ab = Number(d.abonos ?? 0)
            const s = Math.max(0, vf - ab)
            porEst[d.estado] = (porEst[d.estado] ?? 0) + s
          })
        })

        // Tendencia últimos 4 meses (más reciente primero)
        const meses4 = Array.from({ length: 4 }, (_, i) => {
          const m = mes - i
          const a = m <= 0 ? anio - 1 : anio
          const mr = m <= 0 ? m + 12 : m
          const nombre = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][mr - 1]
          const total = pagos
            .filter((p: any) => { return esDelMesBogota(p.createdAt, mr, a) })
            .reduce((s: number, p: any) => s + Number(p.monto) + Number(p.descuento||0), 0)
          return { nombre, total, mes: mr, anio: a }
        })
        const maxTend = Math.max(...meses4.map(m => m.total), 1)

        // Por vendedor (supervisor/admin)
        const porVendedor: Record<string, any> = {}
        pagosMes.forEach((p: any) => {
          const id = p.empleado?.id || 'x'
          const nombre = p.empleado?.nombre || 'Sin nombre'
          if (!porVendedor[id]) porVendedor[id] = { id, nombre, monto: 0, descuento: 0, count: 0 }
          porVendedor[id].monto += Number(p.monto)
          porVendedor[id].descuento += Number(p.descuento || 0)
          porVendedor[id].count += 1
        })
        const vendedoresMes = Object.values(porVendedor)

        const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

        const vendedorSelNombre = metaForm.empleadoId
          ? (vendedores.find((v: any) => v.id === metaForm.empleadoId)?.nombre || '')
          : ''
        const metaCalculadaPesos = metaForm.carteraBase && metaForm.metaPct
          ? Math.round(Number(metaForm.carteraBase) * Number(metaForm.metaPct) / 100)
          : 0

        async function guardarMeta() {
          if (!metaForm.empleadoId || !metaForm.metaPct) return
          setGuardandoMeta(true)
          const pctFinal = Number(metaForm.metaPct)
          const pesosFinales = Math.round(Number(metaForm.carteraBase || 0) * pctFinal / 100)
          await fetch('/api/cartera/metas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              empleadoId: metaForm.empleadoId,
              mes, anio,
              metaPesos: pesosFinales,
              metaPct: pctFinal
            })
          })
          setGuardandoMeta(false)
          setMetaForm({ empleadoId: '', carteraBase: '', metaPct: '' })
          const r = await fetch('/api/cartera/metas').then(r => r.json())
          setMetas(r.metas || [])
        }

        return (
          <div className="space-y-4">
            {/* Selector mes + año */}
            <div className="flex gap-2 items-center">
              <select
                value={mesSel}
                onChange={e => setMesSel(Number(e.target.value))}
                style={{ background: 'rgba(8,8,28,0.88)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '10px 14px' }}
                className="text-white text-sm outline-none focus:border-emerald-500 flex-1"
              >
                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((nombre, i) => (
                  <option key={i} value={i + 1}>{nombre}</option>
                ))}
              </select>
              <select
                value={anioSel}
                onChange={e => setAnioSel(Number(e.target.value))}
                style={{ background: 'rgba(8,8,28,0.88)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '10px 14px' }}
                className="text-white text-sm outline-none focus:border-emerald-500"
              >
                {[2024, 2025, 2026].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button
                onClick={() => { setMesAnalisis(mesSel); setAnioAnalisis(anioSel) }}
                style={{ background: 'rgba(8,8,28,0.88)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '10px 14px' }}
                className="text-white text-lg hover:border-emerald-500 transition-colors"
                title="Aplicar filtro"
              >
                🔍
              </button>
            </div>

            {/* Meta del mes — vendedor: card destacada con cartera, %, meta y cumplimiento */}
            {user?.role === 'vendedor' && (
              <div className="rounded-2xl p-4 border fade-up hover-lift" style={{ background: 'linear-gradient(135deg, #064e3b, #065f46)', borderColor: '#065f46' }}>
                <p className="text-xs font-bold text-emerald-300 uppercase tracking-widest mb-3">🎯 Mi meta — {MESES[mes-1]} {anio}</p>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-emerald-300/70 text-xs mb-0.5">Cartera total</p>
                    <p className="text-white font-bold text-base leading-tight">$<CountUp end={Math.round(totalCartera)} /></p>
                  </div>
                  <div className="text-center">
                    <p className="text-emerald-300/70 text-xs mb-0.5">% asignado</p>
                    <p className="text-emerald-300 font-bold text-base leading-tight">{miMetaPct > 0 ? `${miMetaPct}%` : '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-300/70 text-xs mb-0.5">Meta</p>
                    <p className="text-white font-bold text-base leading-tight">{metaPesos > 0 ? <>$<CountUp end={Math.round(metaPesos)} /></> : '—'}</p>
                  </div>
                </div>
                {metaPesos > 0 ? (
                  <>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-emerald-300">Cumplimiento</span>
                      <span className="text-sm font-black" style={{ color: colorMeta }}>{pctMeta}%</span>
                    </div>
                    <div className="h-2 bg-black/30 rounded-full overflow-hidden mb-2">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pctMeta}%`, background: `linear-gradient(90deg, #059669, ${colorMeta})` }} />
                    </div>
                    <div className="flex gap-4 text-xs text-emerald-300">
                      <span>Recaudo: <span className="text-white font-bold">$<CountUp end={Math.round(totalRecaudadoMes)} /></span></span>
                      <span>Desc: <span className="text-white font-bold">{fmt(totalDescMes)}</span></span>
                      <span>Falta: <span className="text-white font-bold">{fmt(Math.max(0, metaPesos - totalMes))}</span></span>
                    </div>
                  </>
                ) : (
                  <p className="text-emerald-300/50 text-xs">Sin meta asignada para este mes</p>
                )}
              </div>
            )}


            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className={`rounded-2xl p-4 hover-lift fade-up stagger-1 ${loadingBusqueda ? 'loading-border' : ''}`} style={{background:"rgba(8,8,28,0.82)",border:"1px solid rgba(59,130,246,0.25)"}}>
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide font-bold">Cartera total</p>
                <p className="text-white font-bold text-lg">$<CountUp end={Math.round(totalCartera)} /></p>
                <p className="text-zinc-600 text-xs mt-1"><CountUp end={totalReal ? totalReal.clientes : carteras.length} /> clientes</p>
              </div>
              <div className={`rounded-2xl p-4 hover-lift fade-up stagger-2 ${loadingBusqueda ? 'loading-border-red' : ''}`} style={{background:"rgba(8,8,28,0.82)",border:"1px solid rgba(59,130,246,0.25)"}}>
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide font-bold">Pendiente</p>
                <p className="text-red-400 font-bold text-lg flex items-center gap-2">$<CountUp end={Math.round(totalPend)} />{totalPend > 0 && <LiveDot color="red" />}</p>
                <p className="text-zinc-600 text-xs mt-1">{totalCartera > 0 ? Math.round((totalPend/totalCartera)*100) : 0}% sin cobrar</p>
              </div>
              <div className={`rounded-2xl p-4 hover-lift fade-up stagger-3 ${loadingBusqueda ? 'loading-border-emerald' : ''}`} style={{background:"rgba(8,8,28,0.82)",border:"1px solid rgba(59,130,246,0.25)"}}>
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide font-bold">Recaudado</p>
                <p className="text-emerald-400 font-bold text-lg">$<CountUp end={Math.round(totalMes)} /></p>
                <p className="text-zinc-600 text-xs mt-1">{pagosMes.length} pagos · {variacion >= 0 ? '+' : ''}{variacion}% vs ant.</p>
              </div>
              <div className={`rounded-2xl p-4 hover-lift fade-up stagger-4 ${loadingBusqueda ? 'loading-border-amber' : ''}`} style={{background:"rgba(8,8,28,0.82)",border:"1px solid rgba(59,130,246,0.25)"}}>
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide font-bold">Descuentos</p>
                <p className="text-orange-400 font-bold text-lg">$<CountUp end={Math.round(totalDescMes)} /></p>
                <p className="text-zinc-600 text-xs mt-1">aplicados este mes</p>
              </div>
            </div>

            {/* Estadísticas — grid 3 col desktop */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Estado de cartera con barras */}
            <div style={{background:"rgba(8,8,28,0.82)",border:"1px solid rgba(59,130,246,0.25)",borderRadius:16,padding:16}}>
              <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-3">Estado de cartera</p>
              <div className="space-y-2.5">
                {([
                  ['critica','⛔ Crítica','#ef4444'],
                  ['mora','🔴 En mora','#fb7185'],
                  ['vencida','🟠 Vencida','#fb923c'],
                  ['pendiente','🟡 Pendiente','#fbbf24'],
                  ['abonada','🔵 Abonada','#60a5fa'],
                  ['pagada','✅ Pagada','#34d399'],
                ] as const).map(([est, label, color]) => {
                  const monto = porEst[est] ?? 0
                  const pct = totalCartera > 0 ? Math.round((monto / totalCartera) * 100) : 0
                  return (
                    <div key={est}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-zinc-300">{label}</span>
                        <span className="text-xs font-bold text-white">{fmt(monto)} <span className="text-zinc-600">({pct}%)</span></span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{background:"rgba(59,130,246,0.15)"}}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Vista por vendedor — solo admin/supervisor */}
            {esAdmin && vendedoresMes.length > 0 && (
              <div className="md:col-span-2" style={{background:"rgba(8,8,28,0.82)",border:"1px solid rgba(59,130,246,0.25)",borderRadius:16,padding:16}}>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-3">👥 Por vendedor</p>
                <div className="space-y-5">
                  {vendedoresMes.sort((a: any, b: any) => b.monto - a.monto).map((v: any) => {
                    const meta = metas.find((m: any) => m.empleadoId === v.id && m.mes === mes && m.anio === anio)
                    const carteraV = carteras
                      .filter((cv: any) => cv.empleadoId === v.id)
                      .reduce((s: number, cv: any) => s + (cv.DetalleCartera || []).reduce((a: number, d: any) => a + Number(d.valorFactura ?? d.valor ?? 0), 0), 0)
                    const metaPctV = meta ? Number(meta.metaPct) : 0
                    const metaV = metaPctV > 0 ? Math.round(carteraV * metaPctV / 100) : (meta ? Number(meta.metaPesos) : 0)
                    const totalV = v.monto + v.descuento
                    const pctV = metaV > 0 ? Math.min(100, Math.round((totalV / metaV) * 100)) : 0
                    const colorV = pctV >= 80 ? '#34d399' : pctV >= 50 ? '#fbbf24' : metaV > 0 ? '#f87171' : '#6b7280'
                    // Tendencia del vendedor: 4 meses, más reciente primero
                    const vMeses = Array.from({ length: 4 }, (_, i) => {
                      const mv = mes - i
                      const av = mv <= 0 ? anio - 1 : anio
                      const mr = mv <= 0 ? mv + 12 : mv
                      const nombre = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][mr - 1]
                      const total = pagos
                        .filter((p: any) => { return p.empleado?.id === v.id && esDelMesBogota(p.createdAt, mr, av) })
                        .reduce((s: number, p: any) => s + Number(p.monto) + Number(p.descuento||0), 0)
                      return { nombre, total }
                    })
                    const maxV2 = Math.max(...vMeses.map(vm => vm.total), 1)
                    return (
                      <div key={v.id}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-white text-sm font-semibold">{v.nombre}</span>
                          <span className="font-black text-lg" style={{ color: colorV }}>
                            {metaV > 0 ? `${pctV}%` : fmt(totalV)}
                          </span>
                        </div>
                        <div className="flex gap-3 text-xs text-zinc-500 mb-2">
                          {metaV > 0 && <span>Meta: <span className="text-zinc-300">{fmt(metaV)}</span></span>}
                          <span>Recaudó: <span className="text-zinc-300">{fmt(v.monto)}</span></span>
                          {v.descuento > 0 && <span>Desc: <span className="text-orange-400">{fmt(v.descuento)}</span></span>}
                          <span>{v.count} pagos</span>
                        </div>
                        {metaV > 0 && (
                          <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{background:"rgba(59,130,246,0.15)"}}>
                            <div className="h-full rounded-full" style={{ width: `${pctV}%`, background: colorV }} />
                          </div>
                        )}
                        <div className="space-y-1 mt-1">
                          {vMeses.map((vm, vi) => {
                            const pctBar = Math.round((vm.total / maxV2) * 100)
                            const esEste = vi === 0
                            return (
                              <div key={vi} className="flex items-center gap-2">
                                <span className={`text-xs w-7 flex-shrink-0 ${esEste ? 'text-emerald-400 font-bold' : 'text-zinc-600'}`}>{vm.nombre}</span>
                                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{background:"rgba(59,130,246,0.10)"}}>
                                  <div className="h-full rounded-full" style={{ width: `${pctBar}%`, background: esEste ? colorV : '#3f3f46' }} />
                                </div>
                                <span className={`text-xs flex-shrink-0 ${esEste ? 'text-zinc-300' : 'text-zinc-600'}`}>{fmt(vm.total)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            </div>{/* fin grid estadísticas */}

            {/* Asignar meta — solo admin/supervisor */}
            {esAdmin && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-3">🎯 Asignar meta — {MESES[mes-1]} {anio}</p>
                <div className="space-y-3">
                  <select
                    value={metaForm.empleadoId}
                    onChange={e => {
                      const id = e.target.value
                      const base = id ? carteras
                        .filter((c: any) => c.empleadoId === id)
                        .reduce((s: number, c: any) => s + (c.DetalleCartera || []).reduce((a: number, d: any) => {
                          if (d.estado === 'pagada') return a
                          return a + Math.max(0, Number(d.valorFactura ?? d.valor ?? 0) - Number(d.abonos ?? 0))
                        }, 0), 0) : 0
                      setMetaForm(f => ({ ...f, empleadoId: id, carteraBase: id ? String(base) : '', metaPct: '' }))
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-xl outline-none focus:border-emerald-500">
                    <option value="">Seleccionar vendedor...</option>
                    {vendedores.map((v: any) => (
                      <option key={v.id} value={v.id}>{v.nombre}</option>
                    ))}
                  </select>

                  {metaForm.empleadoId && (
                    <>
                      <div className="grid grid-cols-[4fr_1fr] gap-2">
                        <div>
                          <p className="text-zinc-500 text-xs mb-1">Cartera base {vendedorSelNombre ? `(${vendedorSelNombre})` : ''}</p>
                          <div className="flex gap-2 items-center">
                            <span className="text-zinc-400 font-bold flex-shrink-0">$</span>
                            <input
                              value={metaForm.carteraBase}
                              onChange={e => setMetaForm(f => ({ ...f, carteraBase: e.target.value }))}
                              type="number" min="0"
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-xl outline-none focus:border-emerald-500" />
                          </div>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs mb-1">%</p>
                          <input
                            value={metaForm.metaPct}
                            onChange={e => setMetaForm(f => ({ ...f, metaPct: e.target.value }))}
                            placeholder="80"
                            type="number" min="1" max="100"
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-xl outline-none focus:border-emerald-500" />
                        </div>
                      </div>
                      {metaForm.empleadoId && metaForm.metaPct && (
                        <p className="text-emerald-400 text-sm font-semibold">Meta: {fmt(metaCalculadaPesos)}</p>
                      )}
                    </>
                  )}

                  <button onClick={guardarMeta} disabled={guardandoMeta || !metaForm.empleadoId || !metaForm.metaPct}
                    className={`w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-sm transition-colors ${(guardandoMeta || !metaForm.empleadoId || !metaForm.metaPct) ? 'btn-shimmer' : ''}`}>
                    {guardandoMeta ? 'Guardando...' : '💾 Guardar meta'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      </div>)}
      {/* CLIENTES */}
      {tab === 'clientes' && (<div key='tab-clientes' className='fade-up'>
        <div className="space-y-3">
          <input value={buscar} onChange={e => onBuscarChange(e.target.value)}
            placeholder="Buscar por nombre o NIT..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />

          {/* MÓVIL — cards colapsables (sin cambios) */}
          <div className="md:hidden">
            {filtradas.map((c: any) => (
              <CarteraCard
                key={c.id}
                cartera={c}
                rol={user?.role}
                fmt={fmt}
                onRecaudar={() => abrirRecaudar(c)}
                onWhatsApp={() => abrirWhatsApp(c)}
                variant="lista"
              />
            ))}
            {filtradas.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-zinc-400">{buscar ? 'Sin resultados' : 'Sin cartera registrada'}</p>
              </div>
            )}
          </div>

          {/* DESKTOP — tabla plana una fila por deuda */}
          <div className="hidden md:block">
            {filtradas.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-zinc-400">{buscar ? 'Sin resultados' : 'Sin cartera registrada'}</p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{border:'1px solid rgba(59,130,246,0.25)'}}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[820px]">
                    <thead>
                      <tr style={{background:'rgba(8,8,28,0.95)',borderBottom:'1px solid rgba(59,130,246,0.2)'}}>
                        <th className="px-4 py-3 text-left text-zinc-400 font-semibold whitespace-nowrap">Cliente</th>
                        {(user?.role === 'empresa' || user?.role === 'supervisor') && (
                          <th className="px-4 py-3 text-left text-zinc-400 font-semibold whitespace-nowrap">Vendedor</th>
                        )}
                        <th className="px-4 py-3 text-left text-zinc-400 font-semibold whitespace-nowrap">Factura</th>
                        <th className="px-4 py-3 text-left text-zinc-400 font-semibold whitespace-nowrap">Vencimiento</th>
                        <th className="px-4 py-3 text-right text-zinc-400 font-semibold whitespace-nowrap">Saldo</th>
                        <th className="px-4 py-3 text-center text-zinc-400 font-semibold whitespace-nowrap">Estado</th>
                        <th className="px-4 py-3 text-center text-zinc-400 font-semibold whitespace-nowrap">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.map((cartera: any, ci: number) => {
                        const deudas = [...(cartera.DetalleCartera || [])].sort((a: any, b: any) => {
                          const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity
                          const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity
                          return fa - fb
                        })
                        const esSupervisor = user?.role === 'empresa' || user?.role === 'supervisor'
                        const esUltimoCliente = ci === filtradas.length - 1
                        return deudas.map((d: any, di: number) => {
                          const esPrimera = di === 0
                          const esUltimaDeuda = di === deudas.length - 1
                          const color = ESTADO_COLOR[d.estado] || '#6366f1'
                          const separador = esUltimaDeuda && !esUltimoCliente
                            ? '2px solid rgba(59,130,246,0.20)'
                            : '1px solid rgba(59,130,246,0.08)'
                          return (
                            <tr key={`${cartera.id}-${di}`}
                              style={{background: ci%2===0 ? 'rgba(8,8,28,0.70)' : 'rgba(15,15,35,0.50)', borderBottom: separador}}>
                              {/* Cliente — solo primera fila del grupo */}
                              <td className="px-4 py-3 max-w-[180px]">
                                {esPrimera ? (
                                  <div className="flex items-center gap-2">
                                    <span style={{width:8,height:8,borderRadius:'50%',background:ESTADO_COLOR[estadoPrincipal(cartera.porEstado)]||'#6366f1',flexShrink:0,boxShadow:`0 0 5px ${ESTADO_COLOR[estadoPrincipal(cartera.porEstado)]||'#6366f1'}`}} />
                                    <span className="text-white font-semibold truncate text-xs">{cartera.cliente?.nombre || '—'}</span>
                                  </div>
                                ) : null}
                              </td>
                              {/* Vendedor — solo primera fila */}
                              {esSupervisor && (
                                <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                                  {esPrimera ? (cartera.empleado?.nombre || '—') : null}
                                </td>
                              )}
                              {/* Factura */}
                              <td className="px-4 py-3 text-zinc-300 font-mono whitespace-nowrap text-xs">
                                {d.numeroFactura ? `#${d.numeroFactura}` : d.numeroOrden ? `#${d.numeroOrden}` : '—'}
                              </td>
                              {/* Vencimiento */}
                              <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">
                                {d.fechaVencimiento
                                  ? new Date(d.fechaVencimiento).toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'America/Bogota'})
                                  : '—'}
                              </td>
                              {/* Saldo */}
                              <td className="px-4 py-3 text-right font-semibold whitespace-nowrap" style={{color:'#fde68a'}}>
                                {fmt(Number(d.saldo))}
                              </td>
                              {/* Estado */}
                              <td className="px-4 py-3 text-center whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                                  style={{background:`${color}22`,color,border:`1px solid ${color}55`}}>
                                  <span style={{width:6,height:6,borderRadius:'50%',background:color,display:'inline-block'}} />
                                  {ESTADO_LABEL[d.estado] || d.estado}
                                </span>
                              </td>
                              {/* Acciones — solo primera fila */}
                              <td className="px-4 py-3 text-center whitespace-nowrap">
                                {esPrimera && Number(cartera.saldoPendiente) > 0 ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => abrirRecaudar(cartera)}
                                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                      style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',color:'#fff'}}>
                                      💳 Recaudar
                                    </button>
                                    <button onClick={() => abrirWhatsApp(cartera)}
                                      className="flex items-center justify-center p-1.5 rounded-lg transition-colors"
                                      style={{background:'#25D366',color:'#fff'}}>
                                      <svg viewBox="0 0 24 24" style={{width:14,height:14,fill:'currentColor'}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                    </button>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          )
                        })
                      })}
                    </tbody>
                    {/* Totales */}
                    <tfoot>
                      <tr style={{background:'rgba(8,8,28,0.95)',borderTop:'1px solid rgba(59,130,246,0.3)'}}>
                        <td colSpan={(user?.role === 'empresa' || user?.role === 'supervisor') ? 4 : 3}
                          className="px-4 py-3 text-zinc-400 font-bold text-xs">
                          {filtradas.length} clientes · {filtradas.reduce((s: number, c: any) => s + (c.DetalleCartera?.length || 0), 0)} facturas
                        </td>
                        <td className="px-4 py-3 text-right font-bold whitespace-nowrap text-xs" style={{color:'#fde68a'}}>
                          {fmt(filtradas.reduce((s: number, c: any) => s + Number(c.saldoPendiente), 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>

          {hayMas && (
            <button onClick={cargarMas} disabled={cargandoMas} data-loading={cargandoMas}
              className={`w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-semibold py-3 rounded-xl transition-colors ${(cargandoMas) ? 'btn-shimmer' : ''}`}>
              {cargandoMas ? 'Cargando...' : 'Cargar más'}
            </button>
          )}
        </div>
      </div>)}
      {/* PAGOS */}
      {tab === 'pagos' && (<div key='tab-pagos' className='fade-up space-y-3'>

        {/* Filtros: mes + vendedor (admin) */}
        <div className="flex flex-wrap items-center gap-2">
          <SelectorMes
            value={`${anioPagos}-${String(mesPagos).padStart(2,'0')}`}
            onChange={v => { const [a,m] = v.split('-'); setAnioPagos(Number(a)); setMesPagos(Number(m)) }}
          />
          {isAdmin && (
            <select
              value={vendedorPagoId}
              onChange={e => setVendedorPagoId(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500">
              <option value="">Todos los vendedores</option>
              {vendedores.map((v: any) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
          )}
          <div className="relative flex-1 min-w-[160px] max-w-[280px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">🔍</span>
            <input
              type="text"
              value={busquedaPagos}
              onChange={e => setBusquedaPagos(e.target.value)}
              placeholder="Cliente o factura..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-white text-sm outline-none focus:border-blue-500 placeholder:text-zinc-600"
            />
            {busquedaPagos && (
              <button onClick={() => setBusquedaPagos('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs">✕</button>
            )}
          </div>
        </div>

        {/* Tabla scroll horizontal — funciona en móvil y desktop */}
        {pagos.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <p className="text-3xl mb-2">💳</p>
            <p className="text-zinc-400">Sin pagos en este período</p>
          </div>
        ) : (() => {
          // Pre-calcular totales
          let totEfectivo = 0, totTransf = 0, totDesc = 0
          const pagosFiltrados = busquedaPagos.trim()
            ? pagos.filter((p: any) => {
                const q = busquedaPagos.toLowerCase()
                const cliente = (p.clienteNombre || p.cartera?.cliente?.nombre || '').toLowerCase()
                const factura = String(p.numeroFactura || '').toLowerCase()
                const recibo  = String(p.numeroRecibo || '').toLowerCase()
                return cliente.includes(q) || factura.includes(q) || recibo.includes(q)
              })
            : pagos

          const rows = pagosFiltrados.map((p: any) => {
            const lineas: any[] = Array.isArray(p.lineasPago) ? p.lineasPago : []
            const efectivo  = lineas.filter(l => l.metodoPago === 'efectivo').reduce((s, l) => s + Number(l.monto || 0), 0) || ((!p.lineasPago && (p.metodoPago || p.metodopago) === 'efectivo') ? Number(p.monto) : 0)
            const transf    = lineas.filter(l => l.metodoPago !== 'efectivo' && l.metodoPago).reduce((s, l) => s + Number(l.monto || 0), 0) || ((!p.lineasPago && (p.metodoPago || p.metodopago) !== 'efectivo') ? Number(p.monto) : 0)
            const desc      = Number(p.descuento || 0)
            const saldoAnt  = Number(p.saldoAnterior || 0)
            const nuevoSaldo = saldoAnt > 0 ? saldoAnt - Number(p.monto) - desc : null
            totEfectivo += efectivo; totTransf += transf; totDesc += desc
            return { ...p, _efectivo: efectivo, _transf: transf, _desc: desc, _nuevoSaldo: nuevoSaldo }
          })
          return (
            <div className="rounded-2xl overflow-hidden" style={{border:'1px solid rgba(59,130,246,0.25)'}}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[780px]">
                  <thead>
                    <tr style={{background:'rgba(8,8,28,0.95)',borderBottom:'1px solid rgba(59,130,246,0.2)'}}>
                      <th className="px-4 py-3 text-left text-zinc-400 font-semibold whitespace-nowrap">Fecha</th>
                      <th className="px-4 py-3 text-left text-zinc-400 font-semibold whitespace-nowrap">#Recibo</th>
                      <th className="px-4 py-3 text-left text-zinc-400 font-semibold whitespace-nowrap">Factura</th>
                      <th className="px-4 py-3 text-left text-zinc-400 font-semibold whitespace-nowrap">Cliente</th>
                      <th className="px-4 py-3 text-right text-zinc-400 font-semibold whitespace-nowrap">Efectivo</th>
                      <th className="px-4 py-3 text-right text-zinc-400 font-semibold whitespace-nowrap">Transf.</th>
                      <th className="px-4 py-3 text-right text-zinc-400 font-semibold whitespace-nowrap">Descuento</th>
                      <th className="px-4 py-3 text-right text-zinc-400 font-semibold whitespace-nowrap">Nuevo Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p: any, i: number) => (
                      <tr key={p.id}
                        style={{background: i%2===0 ? 'rgba(8,8,28,0.70)' : 'rgba(15,15,35,0.50)', borderBottom:'1px solid rgba(59,130,246,0.08)'}}>
                        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                          {new Date(p.createdAt).toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'America/Bogota'})}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button onClick={() => abrirRecibo(p.id)}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors font-mono">
                            🖨️ {p.numeroRecibo || '—'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 font-mono whitespace-nowrap">
                          {p.numeroFactura ? `#${p.numeroFactura}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-white max-w-[160px] truncate">
                          {p.clienteNombre || p.cartera?.cliente?.nombre || p.Cartera?.Cliente?.nombre || '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-semibold whitespace-nowrap">
                          {p._efectivo > 0 ? fmt(p._efectivo) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-400 font-semibold whitespace-nowrap">
                          {p._transf > 0 ? fmt(p._transf) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-400 whitespace-nowrap">
                          {p._desc > 0 ? fmt(p._desc) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300 whitespace-nowrap">
                          {p._nuevoSaldo !== null ? fmt(p._nuevoSaldo) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totales */}
                  <tfoot>
                    <tr style={{background:'rgba(8,8,28,0.95)',borderTop:'1px solid rgba(59,130,246,0.3)'}}>
                      <td colSpan={4} className="px-4 py-3 text-zinc-400 font-bold">{rows.length} {busquedaPagos ? `de ${pagos.length}` : ''} pagos</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold whitespace-nowrap">{fmt(totEfectivo)}</td>
                      <td className="px-4 py-3 text-right text-blue-400 font-bold whitespace-nowrap">{fmt(totTransf)}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-bold whitespace-nowrap">{totDesc > 0 ? fmt(totDesc) : '—'}</td>
                      <td className="px-4 py-3 text-right text-zinc-400 font-bold">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })()}
      </div>)}

      {tab === 'comisiones' && isAdmin && (<div key='tab-comisiones' className='fade-up space-y-4'>

        {/* Selector mes + botón cargar */}
        <div className="flex flex-wrap items-center gap-2">
          <SelectorMes
            value={`${anioComision}-${String(mesComision).padStart(2,'0')}`}
            onChange={v => { const [a,m] = v.split('-'); setAnioComision(Number(a)); setMesComision(Number(m)) }}
          />
          <button
            onClick={async () => {
              setLoadingComisiones(true)
              const r = await fetch(`/api/comisiones?mes=${mesComision}&anio=${anioComision}`).then(r => r.json()).catch(() => ({}))
              setComisiones(r.vendedores || [])
              setComisionCalculo(r.calculo || null)
              if (!nombreComision) {
                const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
                setNombreComision(`Comision${MESES[mesComision-1]}${anioComision}`)
              }
              setLoadingComisiones(false)
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            Cargar
          </button>
        </div>

        {comisiones.length > 0 && (
          <>
            {/* Tabla de vendedores con % */}
            <div className="rounded-2xl overflow-hidden" style={{border:'1px solid rgba(59,130,246,0.25)'}}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead>
                    <tr style={{background:'rgba(8,8,28,0.95)',borderBottom:'1px solid rgba(59,130,246,0.2)'}}>
                      <th className="px-4 py-3 text-left text-zinc-400 font-semibold">Vendedor</th>
                      <th className="px-4 py-3 text-right text-zinc-400 font-semibold">Recaudado</th>
                      <th className="px-4 py-3 text-right text-zinc-400 font-semibold">Pagos</th>
                      <th className="px-4 py-3 text-center text-zinc-400 font-semibold w-24">% Comisión</th>
                      <th className="px-4 py-3 text-left text-zinc-400 font-semibold">Fórmula</th>
                      <th className="px-4 py-3 text-right text-zinc-400 font-semibold">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comisiones.map((v: any, i: number) => (
                      <tr key={v.id} style={{background: i%2===0 ? 'rgba(8,8,28,0.70)' : 'rgba(15,15,35,0.50)', borderBottom:'1px solid rgba(59,130,246,0.08)'}}>
                        <td className="px-4 py-3 text-white font-medium">{v.nombre}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{fmt(v.recaudado)}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{v.pagosCount}</td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number" min="0" max="100" step="0.5"
                            value={v.porcentaje}
                            onChange={e => setComisiones(prev => prev.map(x => x.id === v.id ? { ...x, porcentaje: parseFloat(e.target.value)||0, comision: Math.round(x.recaudado * (parseFloat(e.target.value)||0) / 100) } : x))}
                            className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-white text-center text-xs outline-none focus:border-blue-500"
                          />
                          <span className="text-zinc-500 ml-1">%</span>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={v.formula || ''}
                            onChange={e => setComisiones(prev => prev.map(x => x.id === v.id ? { ...x, formula: e.target.value } : x))}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300 text-xs outline-none focus:border-blue-500 font-mono"
                            placeholder="recaudado * porcentaje / 100"
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-amber-400 font-bold">{fmt(v.comision)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'rgba(8,8,28,0.95)',borderTop:'1px solid rgba(59,130,246,0.3)'}}>
                      <td className="px-4 py-3 text-zinc-400 font-bold">Total</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold">{fmt(comisiones.reduce((s,v)=>s+v.recaudado,0))}</td>
                      <td className="px-4 py-3 text-right text-zinc-400">{comisiones.reduce((s,v)=>s+v.pagosCount,0)}</td>
                      <td colSpan={2}></td>
                      <td className="px-4 py-3 text-right text-amber-400 font-bold">{fmt(comisiones.reduce((s,v)=>s+v.comision,0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Guardar */}
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={nombreComision}
                onChange={e => setNombreComision(e.target.value)}
                placeholder="Ej: ComisionMayo2026"
                className="flex-1 min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500"
              />
              <button
                disabled={guardandoComision}
                onClick={async () => {
                  setGuardandoComision(true)
                  await fetch('/api/comisiones', { method: 'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ accion: 'guardar_config', vendedores: comisiones })
                  })
                  const r = await fetch('/api/comisiones', { method: 'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ accion: 'calcular', mes: mesComision, anio: anioComision, nombre: nombreComision, vendedores: comisiones, formula: 'recaudado * porcentaje / 100' })
                  }).then(r => r.json())
                  setComisionCalculo(r.calculo)
                  setGuardandoComision(false)
                }}
                className={`bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors ${guardandoComision ? 'btn-shimmer' : ''}`}>
                {guardandoComision ? 'Guardando...' : '💾 Guardar como ' + (nombreComision || 'Comision')}
              </button>
            </div>

            {/* Último cálculo guardado */}
            {comisionCalculo && (
              <div className="rounded-2xl px-4 py-3" style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.25)'}}>
                <p className="text-emerald-400 text-sm font-semibold">✅ Guardado: {comisionCalculo.nombre}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{new Date(comisionCalculo.createdAt).toLocaleDateString('es-CO',{timeZone:'America/Bogota'})}</p>
              </div>
            )}
          </>
        )}
      </div>)}


      {/* Modal Recaudar */}
      {recaudandoCartera && (
        <ModalRecaudo
          cartera={recaudandoCartera}
          detalleData={detalleData}
          loadingDetalle={loadingDetalle}
          lineasPago={lineasPago}
          facturasSeleccionadas={facturasSeleccionadas}
          procesando={guardandoPago}
          fmt={fmt}
          onClose={() => setRecaudandoCartera(null)}
          onSetLineasPago={setLineasPago}
          onSetFacturasSeleccionadas={setFacturasSeleccionadas}
          onSubirVoucher={subirVoucherArchivo}
          onConfirmar={registrarPago}
          crearLinea={crearLinea}
        />
      )}
    </div>

    {/* Modal Sync con historial */}
    {modalSync && syncInfo?.tieneIntegracion && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 pt-20" onClick={() => setModalSync(false)}>
        <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 w-full max-w-md space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-base">🔄 Sincronización</h3>
            <button onClick={() => setModalSync(false)} className="text-zinc-500 hover:text-white text-xl">×</button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Última sync rápida</span>
              <span className="text-zinc-300 text-xs">
                {syncInfo?.ultimaSync
                  ? new Date(syncInfo.ultimaSync).toLocaleString('es-CO', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Última sync completa</span>
              <span className="text-zinc-300 text-xs">
                {syncInfo?.ultimaSyncCompleta
                  ? new Date(syncInfo.ultimaSyncCompleta).toLocaleString('es-CO', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})
                  : '—'}
              </span>
            </div>
          </div>
          <button
            onClick={() => { setModalSync(false); sincronizar() }}
            disabled={sincronizando}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            <span className={sincronizando ? 'animate-spin' : ''}>🔄</span>
            {sincronizando ? 'Sincronizando...' : 'Actualizar ahora'}
          </button>
          {/* Historial de últimas syncs */}
          {(syncInfo?.historial?.length ?? 0) > 0 && (
            <div className="border-t border-zinc-800 pt-4">
              <div className="text-zinc-400 text-xs font-semibold mb-2">Últimas {syncInfo!.historial!.length} ejecuciones</div>
              <div className="space-y-2">
                {syncInfo!.historial!.map((h: SyncLogItem) => (
                  <div key={h.id} className="bg-zinc-900/60 rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={
                          h.estado === 'ok' ? 'text-emerald-500' :
                          h.estado === 'error' ? 'text-red-500' : 'text-amber-500'
                        }>●</span>
                        <span className="text-zinc-300">
                          {new Date(h.inicio).toLocaleString('es-CO', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota'})}
                        </span>
                        <span className="text-zinc-600">·</span>
                        <span className="text-zinc-500">{h.disparadoPor === 'cron' ? '⏰ auto' : '👤 manual'}</span>
                      </div>
                      <span className="text-zinc-500">{h.duracionMs ? `${(h.duracionMs/1000).toFixed(1)}s` : '—'}</span>
                    </div>
                    {h.estado === 'ok' && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-400">
                        {h.clientesActualizados > 0 && <span>👤 {h.clientesActualizados}</span>}
                        {h.deudasSincronizadas > 0 && <span>💰 {h.deudasSincronizadas}</span>}
                        {h.zombis > 0 && <span>🪦 {h.zombis}</span>}
                        {h.pagosConfrontados > 0 && <span>✓ {h.pagosConfrontados}</span>}
                        {h.clientesActualizados === 0 && h.deudasSincronizadas === 0 && h.zombis === 0 && h.pagosConfrontados === 0 && (
                          <span className="text-zinc-600 italic">sin cambios</span>
                        )}
                      </div>
                    )}
                    {h.estado === 'error' && h.errores && (
                      <div className="text-red-400 text-[11px]">
                        {(h.errores as any)?.message || 'Error desconocido'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  )
}
