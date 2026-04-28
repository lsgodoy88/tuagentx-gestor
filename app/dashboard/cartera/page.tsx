'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { calcularEstado, estadoMasCritico } from '@/lib/cartera'
import InputMoneda from '@/components/InputMoneda'
import CarteraCard from '@/components/CarteraCard'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

type LineaPago = { id: string; metodoPago: 'efectivo' | 'transferencia'; monto: string; descuento: string; voucherKey: string | null; voucherDatosIA: any; cargandoVoucher: boolean }
function crearLinea(): LineaPago { return { id: crypto.randomUUID(), metodoPago: 'efectivo', monto: '', descuento: '', voucherKey: null, voucherDatosIA: null, cargandoVoucher: false } }

const ESTADO_CONFIG: Record<string, { label: string; color: string; border: string; text: string }> = {
  critica:  { label: '⛔ Crítica',   color: 'bg-red-950/40',     border: 'border-red-800/50',    text: 'text-red-400' },
  mora:     { label: '🔴 En mora',   color: 'bg-rose-950/40',    border: 'border-rose-800/50',   text: 'text-rose-400' },
  vencida:  { label: '🟠 Vencida',   color: 'bg-orange-950/40',  border: 'border-orange-800/50', text: 'text-orange-400' },
  pendiente:{ label: '🟡 Pendiente', color: 'bg-yellow-950/40',  border: 'border-yellow-800/50', text: 'text-yellow-400' },
  abonada:  { label: '🔵 Abonada',   color: 'bg-blue-950/40',    border: 'border-blue-800/50',   text: 'text-blue-400' },
  pagada:   { label: '✅ Pagada',    color: 'bg-emerald-950/40', border: 'border-emerald-800/50',text: 'text-emerald-400' },
}

export default function CarteraPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any
  const esAdmin = user?.role === 'empresa' || user?.role === 'supervisor'
  const [tab, setTab] = useState<'cartera' | 'clientes' | 'pagos'>('cartera')
  const [modalImportar, setModalImportar] = useState(false)
  const [mesAnalisis, setMesAnalisis] = useState(new Date().getMonth() + 1)
  const [anioAnalisis, setAnioAnalisis] = useState(new Date().getFullYear())
  const [mesSel, setMesSel] = useState(new Date().getMonth() + 1)
  const [anioSel, setAnioSel] = useState(new Date().getFullYear())
  const [metaForm, setMetaForm] = useState({ empleadoId: '', carteraBase: '', metaPct: '' })
  const [guardandoMeta, setGuardandoMeta] = useState(false)
  const [vendedores, setVendedores] = useState<any[]>([])

  const [carteras, setCarteras] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [metas, setMetas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingBusqueda, setLoadingBusqueda] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [hayMas, setHayMas] = useState(false)
  const [paginaActual, setPaginaActual] = useState(1)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Importar
  const [archivo, setArchivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [previewErr, setPreviewErr] = useState<string[]>([])
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
    if (!q) setLoading(true); else setLoadingBusqueda(true)
    setPaginaActual(1)
    const url = q ? `/api/cartera?limit=15&q=${encodeURIComponent(q)}` : '/api/cartera?limit=15'
    const [r1, r2, r3] = await Promise.all([
      fetch(url).then(r => r.json()),
      fetch('/api/cartera/pago?limit=500').then(r => r.json()).catch(() => ({ pagos: [] })),
      fetch('/api/cartera/metas').then(r => r.json()).catch(() => ({ metas: [] })),
    ])
    setCarteras(r1.carteras || [])
    setHayMas((r1.pages ?? 1) > 1)
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

  async function sincronizar() {
    setSincronizando(true)
    await fetch('/api/cartera/sync', { method: 'POST' })
    await cargarDatos(buscar)
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

  const totalPendiente = carteras.reduce((s, c) => s + Number(c.saldoPendiente), 0)

  const filtradas = carteras

  // --- Importar ---
  async function onFile(file: File) {
    setArchivo(file)
    setImportResult(null)
    setPreview([])
    setPreviewErr([])
    const nombre = file.name.toLowerCase()
    if (nombre.endsWith('.csv')) {
      const text = await file.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) { setPreviewErr(['Archivo vacío']); return }
      const headers = lines[0].split(',').map(h => h.trim())
      const rows = lines.slice(1, 6).map(l => {
        const cols = l.split(',').map(s => s.trim())
        const obj: any = {}
        headers.forEach((h, i) => { obj[h] = cols[i] || '' })
        return obj
      })
      setPreview(rows)
    } else {
      // xlsx preview usando ExcelJS en cliente
      try {
        const { default: ExcelJS } = await import('exceljs')
        const buf = await file.arrayBuffer()
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buf)
        const ws = wb.worksheets[0]
        const headers: string[] = []
        const rows: any[] = []
        ws.eachRow((row, rowNum) => {
          if (rowNum === 1) {
            row.eachCell((cell, col) => { headers[col] = String(cell.value ?? '').trim() })
          } else if (rowNum <= 6) {
            const obj: any = {}
            headers.forEach((h, col) => {
              if (h) {
                const v = row.getCell(col).value
                obj[h] = v instanceof Date ? v.toISOString().split('T')[0] : String(v ?? '')
              }
            })
            if (Object.values(obj).some(v => v !== '')) rows.push(obj)
          }
        })
        setPreview(rows)
      } catch { setPreviewErr(['Error leyendo xlsx']) }
    }
  }

  async function importarArchivo() {
    if (!archivo) return
    setImportando(true)
    const fd = new FormData()
    fd.append('file', archivo)
    const res = await fetch('/api/cartera/importar', { method: 'POST', body: fd })
    const data = await res.json()
    setImportResult(data)
    setImportando(false)
    if ((data.importados ?? 0) > 0) {
      setArchivo(null)
      setPreview([])
      cargarDatos()
    }
  }

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
    console.log('detalle response:', JSON.stringify(data).slice(0,200))
    setLoadingDetalle(false)
    // Normalizar modo sync y manual a misma estructura
    const detalleCartera = data.cartera
    if (detalleCartera && data._modo === 'sync') {
      // Convertir deudas sync a formato DetalleCartera
      const detallesNorm = (detalleCartera.deudas || []).map((d: any) => ({
        id: d.externalId,
        valorFactura: d.valor,
        abonos: d.valor - d.saldoReal,
        saldoPendiente: d.saldoReal,
        estado: d.saldoReal <= 0 ? 'pagada' : 'pendiente',
        estadoLabel: d.saldoReal <= 0 ? 'Pagada' : 'Pendiente',
        estadoColor: 'orange',
        numeroFactura: d.numeroFactura || d.numeroOrden,
        fechaVencimiento: d.fechaVencimiento,
        concepto: d.numeroOrden ? `Orden ${d.numeroOrden}` : null,
        _sync: true,
      }))
      detalleCartera.DetalleCartera = detallesNorm
    }
    setDetalleData(detalleCartera)
    const pendientes = (detalleCartera?.DetalleCartera || [])
      .filter((d: any) => d.estado !== 'pagada')
      .sort((a: any, b: any) => new Date(a.fechaVencimiento || a.fCreado || 0).getTime() - new Date(b.fechaVencimiento || b.fCreado || 0).getTime())
    const masAntigua = pendientes[0]?.id ? [pendientes[0].id] : []
    setFacturasSeleccionadas(masAntigua)
    setLineasPago([crearLinea()])
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
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-2xl h-24" />
      ))}
    </div>
  )

  const tabs = [
    { id: 'cartera', label: '📈 Cartera' },
    { id: 'clientes', label: '📋 Clientes' },
    { id: 'pagos', label: '💳 Pagos' },
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">💰 Cartera</h1>        </div>
        {esAdmin && (
          <div className="flex gap-2">
            <button onClick={sincronizar} disabled={sincronizando}
              className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              {sincronizando ? '⏳' : '🔄'} Sync
            </button>
            <button onClick={() => setModalImportar(true)}
              className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              📥 Importar
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors rounded-t-lg ${
              tab === t.id ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-zinc-400 hover:text-white'
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === 'cartera' && (() => {
        const anio = anioAnalisis
        const mes = mesAnalisis

        // Pagos del mes seleccionado
        const pagosMes = pagos.filter((p: any) => {
          const f = new Date(p.createdAt)
          return f.getMonth() + 1 === mes && f.getFullYear() === anio
        })

        // Pagos mes anterior
        const mesAnterior = mes === 1 ? 12 : mes - 1
        const anioAnterior = mes === 1 ? anio - 1 : anio
        const pagosAnt = pagos.filter((p: any) => {
          const f = new Date(p.createdAt)
          return f.getMonth() + 1 === mesAnterior && f.getFullYear() === anioAnterior
        })

        const totalRecaudadoMes = pagosMes.reduce((s: number, p: any) => s + Number(p.monto), 0)
        const totalDescMes = pagosMes.reduce((s: number, p: any) => s + Number(p.descuento || 0), 0)
        const totalMes = totalRecaudadoMes + totalDescMes
        const totalAnt = pagosAnt.reduce((s: number, p: any) => s + Number(p.monto) + Number(p.descuento || 0), 0)
        const variacion = totalAnt > 0 ? Math.round(((totalMes - totalAnt) / totalAnt) * 100) : 0

        const totalCartera = carteras.reduce((s: number, c: any) => {
          return s + (c.DetalleCartera || []).reduce((a: number, d: any) => a + Number(d.valorFactura ?? d.valor ?? 0), 0)
        }, 0)
        const totalPend = carteras.reduce((s: number, c: any) => s + Number(c.saldoPendiente), 0)

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
            .filter((p: any) => { const f = new Date(p.createdAt); return f.getMonth()+1===mr && f.getFullYear()===a })
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
                style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', padding: '10px 14px' }}
                className="text-white text-sm outline-none focus:border-emerald-500 flex-1"
              >
                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((nombre, i) => (
                  <option key={i} value={i + 1}>{nombre}</option>
                ))}
              </select>
              <select
                value={anioSel}
                onChange={e => setAnioSel(Number(e.target.value))}
                style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', padding: '10px 14px' }}
                className="text-white text-sm outline-none focus:border-emerald-500"
              >
                {[2024, 2025, 2026].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button
                onClick={() => { setMesAnalisis(mesSel); setAnioAnalisis(anioSel) }}
                style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', padding: '10px 14px' }}
                className="text-white text-lg hover:border-emerald-500 transition-colors"
                title="Aplicar filtro"
              >
                🔍
              </button>
            </div>

            {/* Meta del mes — vendedor: card destacada con cartera, %, meta y cumplimiento */}
            {user?.role === 'vendedor' && (
              <div className="rounded-2xl p-4 border" style={{ background: 'linear-gradient(135deg, #064e3b, #065f46)', borderColor: '#065f46' }}>
                <p className="text-xs font-bold text-emerald-300 uppercase tracking-widest mb-3">🎯 Mi meta — {MESES[mes-1]} {anio}</p>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-emerald-300/70 text-xs mb-0.5">Cartera total</p>
                    <p className="text-white font-bold text-base leading-tight">{fmt(totalCartera)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-emerald-300/70 text-xs mb-0.5">% asignado</p>
                    <p className="text-emerald-300 font-bold text-base leading-tight">{miMetaPct > 0 ? `${miMetaPct}%` : '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-300/70 text-xs mb-0.5">Meta</p>
                    <p className="text-white font-bold text-base leading-tight">{metaPesos > 0 ? fmt(metaPesos) : '—'}</p>
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
                      <span>Recaudo: <span className="text-white font-bold">{fmt(totalRecaudadoMes)}</span></span>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide">Cartera total</p>
                <p className="text-white font-bold text-lg">{fmt(totalCartera)}</p>
                <p className="text-zinc-600 text-xs mt-1">{carteras.length} clientes</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide">Pendiente</p>
                <p className="text-red-400 font-bold text-lg">{fmt(totalPend)}</p>
                <p className="text-zinc-600 text-xs mt-1">{totalCartera > 0 ? Math.round((totalPend/totalCartera)*100) : 0}% sin cobrar</p>
              </div>
              <div className="bg-emerald-950/40 border border-emerald-800/30 rounded-2xl p-4">
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide">Recaudado</p>
                <p className="text-emerald-400 font-bold text-lg">{fmt(totalMes)}</p>
                <p className="text-zinc-600 text-xs mt-1">{pagosMes.length} pagos · {variacion >= 0 ? '+' : ''}{variacion}% vs ant.</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide">Descuentos</p>
                <p className="text-orange-400 font-bold text-lg">{fmt(totalDescMes)}</p>
                <p className="text-zinc-600 text-xs mt-1">aplicados este mes</p>
              </div>
            </div>

            {/* Estado de cartera con barras */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
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
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Tendencia 4 meses */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-3">Tendencia recaudo</p>
              <div className="space-y-3">
                {meses4.map((m, i) => {
                  const pct = Math.round((m.total / maxTend) * 100)
                  const esActual = i === 0
                  const ant = i < meses4.length - 1 ? meses4[i + 1].total : 0
                  const vari = ant > 0 ? Math.round(((m.total - ant) / ant) * 100) : 0
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`text-xs w-7 flex-shrink-0 ${esActual ? 'text-emerald-400 font-bold' : 'text-zinc-500'}`}>{m.nombre}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: esActual ? 'linear-gradient(90deg,#059669,#34d399)' : '#27272a' }} />
                      </div>
                      <span className={`text-xs font-bold flex-shrink-0 ${esActual ? 'text-emerald-400' : 'text-zinc-400'}`}>{fmt(m.total)}</span>
                      {i < meses4.length - 1 && m.total > 0 && (
                        <span className={`text-xs flex-shrink-0 ${vari >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                          {vari >= 0 ? '↑' : '↓'}{Math.abs(vari)}%
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Vista por vendedor — solo admin/supervisor */}
            {esAdmin && vendedoresMes.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
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
                        .filter((p: any) => { const f = new Date(p.createdAt); return p.empleado?.id === v.id && f.getMonth()+1===mr && f.getFullYear()===av })
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
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
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
                                <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
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
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                    {guardandoMeta ? 'Guardando...' : '💾 Guardar meta'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* CLIENTES */}
      {tab === 'clientes' && (
        <div className="space-y-3">
          <input value={buscar} onChange={e => onBuscarChange(e.target.value)}
            placeholder="Buscar por nombre o NIT..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
          <div>
            {filtradas.map(c => (
              <CarteraCard
                key={c.id}
                cartera={c}
                rol={user?.role}
                fmt={fmt}
                onRecaudar={() => abrirRecaudar(c)}
              />
            ))}
            {filtradas.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-zinc-400">{buscar ? 'Sin resultados' : 'Sin cartera registrada'}</p>
              </div>
            )}
          </div>
          {hayMas && (
            <button onClick={cargarMas} disabled={cargandoMas}
              className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-semibold py-3 rounded-xl transition-colors">
              {cargandoMas ? 'Cargando...' : 'Cargar más'}
            </button>
          )}
        </div>
      )}
      {/* IMPORTAR */}
      {/* Modal Importar */}
      {modalImportar && esAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={e => { if (e.target === e.currentTarget) setModalImportar(false) }}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <h2 className="text-white font-semibold text-base">📥 Importar carteras</h2>
              <button onClick={() => setModalImportar(false)} className="text-zinc-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-end">
                <a href="/api/cartera/plantilla" download
                  className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                  ⬇️ Descargar plantilla .xlsx
                </a>
              </div>

              <div className="bg-zinc-800/50 border border-zinc-700 rounded-2xl p-4 text-sm text-zinc-400 space-y-1">
                <p className="font-semibold text-zinc-300">Columnas del archivo:</p>
                <p><code className="text-emerald-400">nit · nombre_cliente · celular · vendedor_email · numero_factura · concepto · valor_factura · abonos · fecha_vencimiento</code></p>
                <p className="text-xs">El vendedor_email debe coincidir con el email de un empleado activo.</p>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-emerald-500 bg-emerald-500/5' : 'border-zinc-700 hover:border-zinc-600'
                }`}>
                <p className="text-4xl mb-2">📂</p>
                <p className="text-zinc-300 font-medium">{archivo ? archivo.name : 'Arrastra un .xlsx o .csv aquí'}</p>
                <p className="text-zinc-500 text-sm mt-1">o haz clic para seleccionar</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
              </div>

              {previewErr.length > 0 && (
                <div className="bg-amber-950/40 border border-amber-700 rounded-2xl p-4">
                  {previewErr.map((e, i) => <p key={i} className="text-amber-400 text-sm">{e}</p>)}
                </div>
              )}

              {preview.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <p className="text-white font-semibold text-sm">Vista previa (primeras {preview.length} filas)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-700">
                          {Object.keys(preview[0] || {}).map(k => (
                            <th key={k} className="text-left text-zinc-400 pb-2 pr-3 whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {preview.map((r, i) => (
                          <tr key={i}>
                            {Object.values(r).map((v: any, j) => (
                              <td key={j} className="py-1.5 pr-3 text-zinc-300 whitespace-nowrap">{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={importarArchivo} disabled={importando}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold py-3 rounded-2xl text-sm">
                    {importando ? 'Importando...' : 'Importar archivo'}
                  </button>
                </div>
              )}

              {importResult && (
                <div className={`border rounded-2xl p-4 ${(importResult.importados ?? 0) > 0 ? 'bg-emerald-950/40 border-emerald-700' : 'bg-red-950/40 border-red-700'}`}>
                  <p className="font-semibold text-white">✅ {importResult.importados} facturas importadas</p>
                  {importResult.errores?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {importResult.errores.slice(0, 5).map((e: any, i: number) => (
                        <p key={i} className="text-red-400 text-xs">• {e.nit}: {e.error}</p>
                      ))}
                      {importResult.errores.length > 5 && (
                        <p className="text-red-400 text-xs">... y {importResult.errores.length - 5} más</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PAGOS */}
      {tab === 'pagos' && (
        <div className="space-y-3">
          {pagos.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <p className="text-3xl mb-2">💳</p>
              <p className="text-zinc-400">Sin pagos registrados</p>
            </div>
          ) : (
            pagos.map((p: any) => (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{p.cartera?.cliente?.nombre}</p>
                  <p className="text-zinc-500 text-xs">
                    {new Date(p.createdAt).toLocaleDateString('es-CO')} · {p.metodoPago} · {p.empleado?.nombre}
                  </p>
                  {p.notas && <p className="text-zinc-400 text-xs mt-0.5 truncate">{p.notas}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-emerald-400 font-bold">{fmt(Number(p.monto))}</p>
                  {Number(p.descuento) > 0 && <p className="text-zinc-500 text-xs">Desc: {fmt(Number(p.descuento))}</p>}
                  <span className="text-xs text-zinc-500">{p.tipo === 'total' ? 'Total' : 'Abono'}</span>
                </div>
                <button onClick={() => abrirRecibo(p.id)}
                  className="text-zinc-500 hover:text-emerald-400 text-lg flex-shrink-0 transition-colors" title="Ver recibo">
                  🖨️
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal Recaudar */}
      {recaudandoCartera && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5">
              <h3 className="text-white font-bold text-lg">💳 Recaudar</h3>
              <button onClick={() => setRecaudandoCartera(null)}
                className="text-zinc-500 hover:text-white text-xl">×</button>
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
                  {/* Facturas pendientes */}
                  {detalleData.DetalleCartera?.filter((d: any) => d.estado !== 'pagada').length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Facturas pendientes</p>
                      {detalleData.DetalleCartera.filter((d: any) => d.estado !== 'pagada').map((d: any) => {
                        const vf = Number(d.valorFactura ?? d.valor)
                        const ab = Number(d.abonos ?? 0)
                        const saldo = Math.max(0, vf - ab)
                        const seleccionada = facturasSeleccionadas.includes(d.id)
                        return (
                          <label key={d.id} className={`flex items-center gap-3 bg-zinc-800 border rounded-xl px-4 py-2.5 cursor-pointer transition-colors ${
                            seleccionada ? 'border-emerald-500/50' : 'border-zinc-700 hover:border-zinc-600'
                          }`}>
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
                              <span className={`text-xs ${d.estadoColor === 'red' || d.estadoColor === 'rose' ? 'text-red-400' : d.estadoColor === 'orange' ? 'text-orange-400' : 'text-zinc-400'}`}>
                                {d.estadoLabel || d.estado}
                              </span>
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

                  {/* Líneas de pago */}
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

                        {/* Botones método */}
                        <div className="grid grid-cols-2 gap-2">
                          {(['efectivo', 'transferencia'] as const).map(met => (
                            <button key={met} onClick={() => setLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, metodoPago: met, voucherKey: null, voucherDatosIA: null, cargandoVoucher: false } : l))}
                              className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${
                                linea.metodoPago === met ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
                              }`}>
                              {met === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
                            </button>
                          ))}
                        </div>

                        {/* Efectivo: monto + descuento */}
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

                        {/* Transferencia: voucher primero, luego monto bloqueado */}
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
                                  {linea.voucherDatosIA.valor != null && (
                                    <div><span className="text-zinc-500">Valor:</span> <span className="text-white font-semibold">{fmt(linea.voucherDatosIA.valor)}</span></div>
                                  )}
                                  {linea.voucherDatosIA.fecha && (
                                    <div><span className="text-zinc-500">Fecha:</span> <span className="text-white">{linea.voucherDatosIA.fecha}</span></div>
                                  )}
                                  {linea.voucherDatosIA.banco && (
                                    <div className="col-span-2"><span className="text-zinc-500">Banco:</span> <span className="text-white">{linea.voucherDatosIA.banco}</span></div>
                                  )}
                                  {linea.voucherDatosIA.referencia && (
                                    <div className="col-span-2"><span className="text-zinc-500">Ref:</span> <span className="text-white">{linea.voucherDatosIA.referencia}</span></div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Monto bloqueado + descuento — solo después del voucher */}
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
                                        ? String(Math.max(0, Math.round(linea.voucherDatosIA.valor - Number(desc || 0))))
                                        : linea.monto
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

                  {/* Resumen */}
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

                  {/* Notas */}
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
      )}
    </div>
  )
}
