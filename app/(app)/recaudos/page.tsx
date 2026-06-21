'use client'
import React from 'react'
import { saveCache, loadCache } from '@/lib/offlineCache'
import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import DataTable, { ColDef } from '@/components/DataTable'

type Pago = {
  id: string
  monto: number | string
  descuento: number | string | null
  tipo: string | null
  metodopago: string | null
  notas: string | null
  reciboUrl: string | null
  reciboToken: string | null
  voucherKey: string | null
  saldoAnterior: number | string | null
  vendedorNombre: string | null
  voucherDatosIA: any
  createdAt: string
  envioEstado: string
  envioFecha: string | null
  envioRef: string | null
  envioVariacion: any
  numeroRecibo: string | null
  numeroFactura: number | null
  reciboPago: any
  Cartera: {
    Cliente: { id: string; nombre: string; nit: string | null; telefono: string | null }
  }
  Empleado: { id: string; nombre: string; rol: string }
}

type Vendedor = { id: string; nombre: string }

const TABS = [
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'enviado',   label: 'Enviados'   },
  { key: 'todos',     label: 'Todos'      },
]

function fmtMonto(v: number | string) {
  return Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}
function fmtHora(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
}
function fmtFecha(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' , timeZone: 'America/Bogota'})
}
function fmtFechaBtn(dateStr: string) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}
function fmtMetodo(m: string | null) {
  if (!m) return '—'
  if (m === 'efectivo')      return 'Efect.'
  if (m === 'transferencia') return 'Banco'
  return 'Otro'
}

function VariacionPanel({ variacion, pagoId, onDetalle }: { variacion: any; pagoId: string; onDetalle: (id: string) => void }) {
  if (!variacion) return null
  const diff = variacion.diferencia ?? 0
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
      <div>
        <p className="text-red-400 text-xs font-semibold">⚠ Variación detectada</p>
        <p className="text-red-300 text-xs">Diferencia: {fmtMonto(diff)}</p>
      </div>
      <button onClick={() => onDetalle(pagoId)}
        className="text-xs text-red-400 border border-red-500/30 px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0">
        Detalle
      </button>
    </div>
  )
}

async function abrirRecibo(pagoId: string) {
  const res  = await fetch('/api/cartera/recibo-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pagoId }),
  })
  const data = await res.json()
  if (data.reciboToken) {
    const fmt = data.anchoPapel === '58mm' ? '&fmt=58mm' : ''
    window.open('/recaudo/recibo?token=' + data.reciboToken + fmt, '_blank')
  }
}

// ── Columnas DataTable ───────────────────────────────────────────
function getColumns(ctx: {
  _unused?: never
  onLightbox:    (url: string) => void
  voucherUrls:   Record<string, string>
  cargarVoucherUrl: (id: string, key: string) => void
}): ColDef<Pago>[] {
  return [
    {
      key: 'vendedor', label: 'Vend.', width: 60, minWidth: 40,
      render: p => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
          {(p.vendedorNombre || p.Empleado.nombre)
            .split(' ').map((n: string) => n[0] || '').join('').toUpperCase().slice(0, 3)}
        </span>
      ),
    },
    {
      key: 'fecha', label: 'Fecha', width: 70, minWidth: 55,
      render: p => (
        <span style={{ fontFamily: 'monospace' }}>{fmtFecha(p.createdAt)}</span>
      ),
    },
    {
      key: 'recibo', label: 'Recibo', width: 130, minWidth: 80,
      render: p => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <button
            onClick={e => { e.stopPropagation(); abrirRecibo(p.id) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}
            title="Ver recibo">🖨️</button>
          {p.voucherKey && ctx.voucherUrls[p.id] && (
            <div
              onClick={e => { e.stopPropagation(); ctx.onLightbox(ctx.voucherUrls[p.id]) }}
              style={{ width: 18, height: 18, borderRadius: 3, overflow: 'hidden', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }}>
              <img src={ctx.voucherUrls[p.id]} alt="v"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
          )}
          <span style={{ fontFamily: 'monospace' }}>{p.numeroRecibo || '—'}</span>
        </div>
      ),
    },
    {
      key: 'factura', label: 'Factura', width: 60, minWidth: 45,
      render: p => (
        <span style={{ fontFamily: 'monospace' }}>
          {p.numeroFactura || '—'}
        </span>
      ),
    },
    {
      key: 'cliente', label: 'Cliente', width: 260, minWidth: 100,
      render: p => (
        <span>{p.Cartera?.Cliente?.nombre || (p as any).cliente?.nombre || (p as any).clienteNombre || '—'}</span>
      ),
    },
    {
      key: 'saldo', label: 'Saldo', width: 100, minWidth: 70,
      render: p => (
        <span style={{ color: '#fde68a' }}>
          {p.saldoAnterior ? fmtMonto(p.saldoAnterior) : '—'}
        </span>
      ),
    },
    {
      key: 'metodo', label: 'Método', width: 70, minWidth: 55,
      render: p => {
        const ls: any[] = Array.isArray((p as any).lineasPago) && (p as any).lineasPago.length > 0
          ? (p as any).lineasPago : []
        return <span>{fmtMetodo(ls.length > 0 ? ls[0].metodoPago : p.metodopago)}</span>
      },
      renderSub: (sub) => <span>{fmtMetodo(sub.metodoPago)}</span>,
    },
    {
      key: 'valor', label: 'Valor', width: 100, minWidth: 70,
      render: p => {
        const ls: any[] = Array.isArray((p as any).lineasPago) && (p as any).lineasPago.length > 0
          ? (p as any).lineasPago : []
        return <span style={{ color: '#93c5fd' }}>{fmtMonto(ls.length > 0 ? ls[0].monto : p.monto)}</span>
      },
      renderSub: (sub) => <span style={{ color: '#93c5fd' }}>{fmtMonto(sub.monto)}</span>,
    },
    {
      key: 'descuento', label: 'Desc.', width: 90, minWidth: 60,
      render: p => {
        const ls: any[] = Array.isArray((p as any).lineasPago) && (p as any).lineasPago.length > 0
          ? (p as any).lineasPago : []
        const d = ls.length > 0 ? Number(ls[0].descuento || 0) : Number(p.descuento || 0)
        return <span style={{ color: d > 0 ? '#fdba74' : 'rgba(255,255,255,0.25)' }}>{d > 0 ? `-${fmtMonto(d)}` : '—'}</span>
      },
      renderSub: (sub) => {
        const d = Number(sub.descuento || 0)
        return <span style={{ color: d > 0 ? '#fdba74' : 'rgba(255,255,255,0.25)' }}>{d > 0 ? `-${fmtMonto(d)}` : '—'}</span>
      },
    },
    {
      key: 'total', label: 'Nuevo Saldo', width: 110, minWidth: 70,
      render: p => {
        const saldoAnt = Number(p.saldoAnterior || 0)
        const desc = Number(p.descuento || 0)
        const nuevoSaldo = (p as any).reciboPago?.saldoNuevo != null
          ? Number((p as any).reciboPago.saldoNuevo)
          : saldoAnt > 0 ? saldoAnt - Number(p.monto) - desc : null
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ color: '#86efac', fontWeight: 700 }}>{nuevoSaldo != null ? fmtMonto(nuevoSaldo) : '—'}</span>
            {p.envioEstado === 'enviado'  && <span style={{ color: '#60a5fa', fontSize: 9 }}>✔ {fmtHora(p.envioFecha)}</span>}
            {p.envioEstado === 'recibido' && <span style={{ color: '#4ade80', fontSize: 9 }}>✔✔</span>}
          </div>
        )
      },
      renderSub: (sub) => {
        const d = Number(sub.descuento || 0)
        const v = Number(sub.monto     || 0)
        return <span style={{ color: '#86efac', fontWeight: 700 }}>{fmtMonto(v - d)}</span>
      },
    },
  ]
}

const PAGE_SIZE = 50

// ── Página ────────────────────────────────────────────────────────
export default function RecaudosPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const user    = session?.user as any

  const [tab,                 setTab]                 = useState<'pendiente' | 'enviado' | 'todos'>('pendiente')
  const [fecha,               setFecha]               = useState<string>('')
  const [pagos,               setPagos]               = useState<Pago[]>([])
  const [nextCursor,          setNextCursor]          = useState<string | null>(null)
  const [hasMore,             setHasMore]             = useState(false)
  const [loading,             setLoading]             = useState(false)
  const [loadingMore,         setLoadingMore]         = useState(false)
  const [page,                setPage]                = useState(0)
  const [vendedorId,          setVendedorId]          = useState('')
  const [marcadoEliminar,     setMarcadoEliminar]     = useState<string | null>(null)
  const [eliminando,          setEliminando]          = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [vendedores,          setVendedores]          = useState<Vendedor[]>([])
  const [enviando,            setEnviando]            = useState<Set<string>>(new Set())
  const [detalleVariacion,    setDetalleVariacion]    = useState<string | null>(null)
  const [abiertos,            setAbiertos]            = useState<string[]>([])
  const [voucherUrls,         setVoucherUrls]         = useState<Record<string, string>>({})
  const [lightboxUrl,         setLightboxUrl]         = useState<string | null>(null)
  const [seleccionados,       setSeleccionados]       = useState<Set<string>>(new Set())
  const [enviandoSeleccionados, setEnviandoSeleccionados] = useState(false)
  const [isDesktop,           setIsDesktop]           = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : false)
  const fechaInputRef = useRef<HTMLInputElement>(null)
  const [fechaOpen, setFechaOpen] = useState(false)

  const isAdmin = user?.role === 'empresa' || user?.role === 'supervisor'

  const cargarVoucherUrl = async (pagoId: string, voucherKey: string) => {
    if (voucherUrls[pagoId]) return
    const res = await fetch('/api/firma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firma: voucherKey }),
    }).then(r => r.json())
    if (res.url) setVoucherUrls(prev => ({ ...prev, [pagoId]: res.url }))
  }

  const toggleAbierto = (id: string, voucherKey?: string | null) => {
    setAbiertos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    if (voucherKey) cargarVoucherUrl(id, voucherKey)
  }

  const toggleSeleccion = (id: string) =>
    setSeleccionados(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })

  useEffect(() => {
    if (status === 'authenticated' && !isAdmin) router.push('/inicio')
  }, [status, isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/empleados?rol=vendedor&limit=100')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.empleados)) setVendedores(d.empleados) })
      .catch(() => {})
  }, [isAdmin])

  const fetchPagos = useCallback(async (cursor: string | null = null) => {
    if (!isAdmin) return
    const params = new URLSearchParams()
    if (vendedorId) params.set('vendedorId', vendedorId)
    if (tab !== 'todos') params.set('estado', tab)
    if (fecha) params.set('fecha', fecha)
    if (cursor) params.set('cursor', cursor)

    // Stale-while-revalidate: mostrar caché al instante (solo carga inicial sin filtros)
    const cacheKey = `recaudos:${tab}:${vendedorId}:${fecha}`
    if (!cursor) {
      const cached = loadCache<any>(cacheKey)
      if (cached?.data?.pagos) {
        setPagos(cached.data.pagos)
        setNextCursor(cached.data.nextCursor ?? null)
        setHasMore(cached.data.hasMore ?? false)
        setSeleccionados(new Set()); setPage(0)
        // Refrescar en background sin spinner
        fetch(`/api/recaudos?${params}`).then(r => r.json()).then(data => {
          const nuevos = data.pagos ?? []
          saveCache(cacheKey, { pagos: nuevos, nextCursor: data.nextCursor, hasMore: data.hasMore })
          setPagos(nuevos)
          setNextCursor(data.nextCursor ?? null)
          setHasMore(data.hasMore ?? false)
        }).catch(() => {})
        return
      }
      setLoading(true); setSeleccionados(new Set()); setPage(0)
    } else setLoadingMore(true)

    const res  = await fetch(`/api/recaudos?${params}`)
    const data = await res.json()
    const nuevos = data.pagos ?? []
    if (!cursor) saveCache(cacheKey, { pagos: nuevos, nextCursor: data.nextCursor, hasMore: data.hasMore })
    setPagos(!cursor ? nuevos : prev => [...prev, ...nuevos])
    setNextCursor(data.nextCursor ?? null)
    setHasMore(data.hasMore ?? false)
    if (!cursor) setLoading(false); else setLoadingMore(false)
  }, [tab, vendedorId, fecha, isAdmin])

  useEffect(() => { fetchPagos(null) }, [fetchPagos])

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function iniciarLongPress(pagoId: string) {
    longPressTimer.current = setTimeout(() => setMarcadoEliminar(pagoId), 600)
  }
  function cancelarLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  async function eliminarPago(pagoId: string) {
    setEliminando(true)
    try {
      const res = await fetch(`/api/recaudos/${pagoId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setPagos(prev => prev.filter(p => p.id !== pagoId))
        setMarcadoEliminar(null)
        if (data.advertencia) alert(data.advertencia)
      }
    } finally {
      setEliminando(false)
    }
  }

  async function enviarPago(pagoId: string) {
    setEnviando(prev => new Set(prev).add(pagoId))
    try {
      const res  = await fetch(`/api/recaudos/${pagoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'enviar' }),
      })
      const data = await res.json()
      if (data.ok) {
        setPagos(prev => prev.map(p =>
          p.id === pagoId
            ? { ...p, envioEstado: data.envioEstado, envioFecha: new Date().toISOString(), envioRef: data.envioRef }
            : p
        ))
      }
    } finally {
      setEnviando(prev => { const s = new Set(prev); s.delete(pagoId); return s })
    }
  }

  async function enviarSeleccionados() {
    setEnviandoSeleccionados(true)
    for (const id of [...seleccionados]) {
      const pago = pagos.find(p => p.id === id)
      if (pago && pago.envioEstado === 'pendiente') await enviarPago(id)
    }
    setSeleccionados(new Set())
    setEnviandoSeleccionados(false)
  }

  const haySeleccion      = seleccionados.size > 0

  const pagedPagos  = pagos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages  = Math.max(1, Math.ceil(pagos.length / PAGE_SIZE))

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-white text-sm animate-pulse">Cargando...</div>
      </div>
    )
  }
  if (!isAdmin) return null

  const cols = getColumns({  onLightbox: setLightboxUrl, voucherUrls, cargarVoucherUrl })

  return (
    <div className="space-y-4 pb-28 max-w-7xl mx-auto">

      {/* Tabs principales */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex-1 py-2 text-base font-semibold transition-colors text-center ${tab === t.key ? 'tab-active' : 'text-white hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros — una línea, ancho completo */}
      <div style={{display:'flex',gap:8,width:'100%',alignItems:'stretch'}}>
        {/* Enviar — solo tab pendiente, habilitado solo con selección */}
        {tab === 'pendiente' && (
          <button
            onClick={() => enviarSeleccionados()}
            disabled={!haySeleccion || enviandoSeleccionados}
            style={{flexShrink:0,background:haySeleccion?'rgba(37,99,235,0.35)':'#1e2a3d',border:haySeleccion?'1px solid rgba(96,165,250,0.5)':'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'8px 16px',fontSize:12,fontWeight:700,color:haySeleccion?'white':'rgba(255,255,255,0.4)',cursor:haySeleccion?'pointer':'not-allowed',whiteSpace:'nowrap'}}>
            {enviandoSeleccionados ? '⏳ Enviando...' : `📤 Enviar${haySeleccion ? ` (${seleccionados.size})` : ''}`}
          </button>
        )}
        {/* Vendedor — flex restante */}
        {isAdmin && (
          <div style={{flex:1,background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',minWidth:0,overflow:'hidden'}}>
            <select
              value={vendedorId}
              onChange={e => setVendedorId(e.target.value)}
              style={{width:'100%',height:'100%',background:'transparent',border:'none',padding:'8px 12px',fontSize:12,fontWeight:600,color:'white',outline:'none',cursor:'pointer'}}>
              <option value="">Vendedor</option>
              {vendedores.map(v => (
                <option key={v.id} value={v.id} style={{background:'#060a24'}}>{v.nombre.split(' ')[0]}</option>
              ))}
            </select>
          </div>
        )}
        {/* Calendario — botón limpio + popover */}
        <div style={{position:'relative',flexShrink:0}}>
          <button
            onClick={() => {
              if (fecha) { setFecha(''); return }
              try { fechaInputRef.current?.showPicker?.() } catch {}
              fechaInputRef.current?.click()
            }}
            style={{background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:6,height:40,boxSizing:'border-box',outline:'none',position:'relative'}}>
            <span style={{fontSize:18,lineHeight:1}}>📅</span>
            {fecha && <span style={{fontSize:10,fontWeight:700,color:'white'}}>{fmtFechaBtn(fecha)} ✕</span>}
          </button>
          <input
            ref={fechaInputRef}
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            style={{position:'absolute',opacity:0,pointerEvents:'none',width:0,height:0}}
          />
        </div>
      </div>

      {/* ── DESKTOP: DataTable ─────────────────────────────────── */}
      {isDesktop ? (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          <DataTable
            columns={cols}
            rows={pagedPagos}
            rowKey={p => p.id}
            selected={seleccionados}
            onToggle={toggleSeleccion}
            onSelectAll={ids => setSeleccionados(ids.length ? new Set(ids) : new Set())}
            loading={loading}
            storageKey="recaudos"
            subRows={p => {
              const ls: any[] = Array.isArray((p as any).lineasPago) && (p as any).lineasPago.length > 1
                ? (p as any).lineasPago.slice(1) : []
              return ls
            }}
          />
        </div>
      ) : (
        /* ── MOBILE: cards colapsables ───────────────────────── */
        <>
          {loading ? (
            <div className="space-y-2 pb-28">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 animate-pulse h-14" />
              ))}
            </div>
          ) : pagos.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <p className="text-white text-sm">No hay recaudos en esta vista</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pagos.map(pago => {
                const enEnvio       = enviando.has(pago.id)
                const yaEnviado     = pago.envioEstado === 'enviado' || pago.envioEstado === 'recibido'
                const tieneVariacion = pago.envioEstado === 'variacion'
                const abierto       = abiertos.includes(pago.id)
                const seleccionado  = seleccionados.has(pago.id)
                return (
                  <div key={pago.id}>
                    {/* Fila contraída */}
                    <div
                      onClick={() => { if (marcadoEliminar === pago.id) { setMarcadoEliminar(null); return }; toggleAbierto(pago.id, pago.voucherKey) }}
                      onTouchStart={() => iniciarLongPress(pago.id)}
                      onTouchEnd={cancelarLongPress}
                      onTouchMove={cancelarLongPress}
                      onMouseDown={() => iniciarLongPress(pago.id)}
                      onMouseUp={cancelarLongPress}
                      onMouseLeave={cancelarLongPress}
                      style={{ background: '#060a24', position: 'relative' }}
                      className={`border ${marcadoEliminar === pago.id ? 'border-red-500' : tieneVariacion ? 'border-red-500/40' : seleccionado ? 'border-blue-500/60' : 'border-zinc-800'} ${abierto ? 'rounded-t-[10px]' : 'rounded-[10px]'} px-[11px] py-[9px] flex items-center gap-2 cursor-pointer select-none`}>
                      {marcadoEliminar === pago.id && (
                        <div onClick={e => e.stopPropagation()}
                          className="absolute -top-3 right-2 flex items-center gap-1.5 z-10">
                          <button onClick={() => eliminarPago(pago.id)} disabled={eliminando}
                            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1">
                            🗑️ {eliminando ? 'Eliminando...' : 'Eliminar'}
                          </button>
                          <button onClick={() => setMarcadoEliminar(null)}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold px-2 py-1.5 rounded-lg shadow-lg">
                            ✕
                          </button>
                        </div>
                      )}
                      {/* Checkbox */}
                      <div onClick={e => { e.stopPropagation(); toggleSeleccion(pago.id) }}
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${seleccionado ? 'bg-blue-600 border-blue-600' : 'border-zinc-600 bg-transparent'}`}>
                          {seleccionado && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                        </div>
                      </div>
                      {/* Recibo · Fecha · Factura  +  Nombre cliente */}
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-300 text-[15px] truncate leading-tight font-mono flex items-center gap-1.5">
                          <span
                            onClick={e => { e.stopPropagation(); abrirRecibo(pago.id) }}
                            style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}
                            title="Ver recibo">🖨️</span>
                          {pago.numeroRecibo || '—'} · {fmtFecha(pago.createdAt)} · Fact. {pago.numeroFactura || '—'}
                        </p>
                        <p className="text-white font-semibold text-sm truncate leading-tight mt-0.5">
                          {pago.Cartera?.Cliente?.nombre || (pago as any).cliente?.nombre || (pago as any).clienteNombre || '—'}
                        </p>
                      </div>
                      {/* Iconos método */}
                      <div className="flex items-center gap-0.5 flex-shrink-0 text-base leading-none">
                        {pago.metodopago === 'efectivo'      && <span>💵</span>}
                        {pago.metodopago === 'transferencia' && <span>📲</span>}
                        {pago.descuento && Number(pago.descuento) > 0 && (
                          <span className="text-orange-400 text-xs font-bold ml-0.5">%</span>
                        )}
                      </div>
                      {/* Botón / estado */}
                      <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {tieneVariacion && (
                          <button onClick={() => { setDetalleVariacion(pago.id); if (!abierto) toggleAbierto(pago.id) }}
                            className="text-red-400 border border-red-500/50 px-3 py-1.5 rounded-xl text-sm font-bold hover:bg-red-500/10 transition-colors">
                            ⚑
                          </button>
                        )}
                        {!yaEnviado && !tieneVariacion && (
                          <button onClick={() => enviarPago(pago.id)} disabled={enEnvio}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold px-[10px] py-[5px] rounded-[7px] transition-colors">
                            {enEnvio ? '...' : 'Enviar'}
                          </button>
                        )}
                        {pago.envioEstado === 'enviado'  && <span className="text-blue-400 text-xs font-semibold whitespace-nowrap">✔ {fmtHora(pago.envioFecha)}</span>}
                        {pago.envioEstado === 'recibido' && <span className="text-emerald-400 text-xs font-semibold whitespace-nowrap">✔✔ {fmtHora(pago.envioFecha)}</span>}
                        {pago.envioEstado === 'enviando' && <span className="text-white text-xs animate-pulse">Enviando...</span>}
                      </div>
                    </div>
                    {/* Panel expandido */}
                    {abierto && (
                      <div
                        className={`bg-[#0d0d0d] border border-t-0 ${tieneVariacion ? 'border-red-500/50' : seleccionado ? 'border-blue-500/60' : 'border-zinc-800'} rounded-b-[10px] px-4 py-3 space-y-3`}
                        onClick={e => e.stopPropagation()}>
                        {/* Lineas de pago — 1 por linea, Efect/Banco/Otro + valor + descuento */}
                        <div className="space-y-1">
                          {(() => {
                            const ls: any[] = Array.isArray((pago as any).lineasPago) && (pago as any).lineasPago.length > 0
                              ? (pago as any).lineasPago
                              : [{ metodoPago: pago.metodopago, monto: pago.monto, descuento: pago.descuento }]
                            return ls.map((l: any, i: number) => {
                              const d = Number(l.descuento || 0)
                              return (
                                <div key={i} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-2 py-1 text-xs">
                                  <span className="text-zinc-300 font-semibold">{fmtMetodo(l.metodoPago)}</span>
                                  <span className="text-blue-300 font-mono">{fmtMonto(l.monto)}</span>
                                  <span className={d > 0 ? 'text-orange-400 font-mono' : 'text-zinc-600 font-mono'}>
                                    {d > 0 ? `-${fmtMonto(d)}` : '—'}
                                  </span>
                                </div>
                              )
                            })
                          })()}
                        </div>
                        {pago.notas && <p className="text-white text-xs mt-1">{pago.notas}</p>}
                        {tieneVariacion && (
                          <VariacionPanel variacion={pago.envioVariacion} pagoId={pago.id}
                            onDetalle={id => setDetalleVariacion(id)} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Paginación */}
      {pagos.length > 0 && (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,paddingTop:8}}>
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 0}
            style={{background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'6px 14px',fontSize:12,fontWeight:700,color:page===0?'rgba(255,255,255,0.25)':'white',cursor:page===0?'not-allowed':'pointer'}}>
            ← Anterior
          </button>
          <span style={{fontSize:12,color:'rgba(255,255,255,0.6)',minWidth:90,textAlign:'center'}}>
            Pág {page + 1} / {totalPages}{hasMore ? '+' : ''}
          </span>
          <button
            onClick={async () => {
              const nextPage = page + 1
              if (nextPage >= totalPages && hasMore) await fetchPagos(nextCursor)
              setPage(nextPage)
            }}
            disabled={(page >= totalPages - 1 && !hasMore) || loadingMore}
            style={{background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'6px 14px',fontSize:12,fontWeight:700,color:(page>=totalPages-1&&!hasMore)?'rgba(255,255,255,0.25)':'white',cursor:(page>=totalPages-1&&!hasMore)?'not-allowed':'pointer'}}>
            {loadingMore ? '...' : 'Siguiente →'}
          </button>
        </div>
      )}





      {/* Lightbox voucher */}
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Comprobante" className="max-w-full max-h-full rounded-xl object-contain" />
          <button onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
        </div>
      )}

      {/* Modal detalle variación */}
      {detalleVariacion && (() => {
        const pago = pagos.find(p => p.id === detalleVariacion)
        if (!pago) return null
        const v = pago.envioVariacion as any
        return (
          <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
            onClick={() => setDetalleVariacion(null)}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full space-y-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold">⚠ Detalle de variación</h3>
                <button onClick={() => setDetalleVariacion(null)} className="text-white">✕</button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white">Monto enviado</span>
                  <span className="text-white font-mono">{fmtMonto(pago.monto)}</span>
                </div>
                {v?.montoRecibido !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-white">Monto recibido</span>
                    <span className="text-white font-mono">{fmtMonto(v.montoRecibido)}</span>
                  </div>
                )}
                {v?.diferencia !== undefined && (
                  <div className="flex justify-between border-t border-zinc-700 pt-2">
                    <span className="text-red-400 font-semibold">Diferencia</span>
                    <span className="text-red-400 font-bold font-mono">{fmtMonto(v.diferencia)}</span>
                  </div>
                )}
                {v?.detalle && <p className="text-white text-xs">{v.detalle}</p>}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
