'use client'
import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Pago = {
  id: string
  monto: number | string
  descuento: number | string | null
  tipo: string | null
  metodopago: string | null
  notas: string | null
  reciboUrl: string | null
  voucherKey: string | null
  voucherDatosIA: any
  createdAt: string
  envioEstado: string
  envioFecha: string | null
  envioRef: string | null
  envioVariacion: any
  Cartera: {
    Cliente: {
      id: string
      nombre: string
      nit: string | null
      telefono: string | null
    }
  }
  Empleado: {
    id: string
    nombre: string
    rol: string
  }
}

type Vendedor = { id: string; nombre: string }

const TABS = [
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'enviado', label: 'Enviados' },
  { key: 'todos', label: 'Todos' },
]

function fmtMonto(v: number | string) {
  return Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

function fmtHora(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function fmtFecha(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
}

function todayCol() {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function fmtFechaBtn(dateStr: string) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

function MetodoPagoChip({ metodo }: { metodo: string | null }) {
  if (!metodo) return null
  const map: Record<string, { label: string; cls: string }> = {
    efectivo: { label: 'Efectivo', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    transferencia: { label: 'Transferencia', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    descuento: { label: 'Descuento', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  }
  const cfg = map[metodo] ?? { label: metodo, cls: 'bg-zinc-700 text-zinc-300 border-zinc-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
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
      <button
        onClick={() => onDetalle(pagoId)}
        className="text-xs text-red-400 border border-red-500/30 px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0">
        Detalle
      </button>
    </div>
  )
}

function calcResumen(lista: Pago[]) {
  let efectivo = 0
  let transferencia = 0
  for (const p of lista) {
    const m = Number(p.monto) || 0
    if (p.metodopago === 'efectivo') efectivo += m
    else if (p.metodopago === 'transferencia') transferencia += m
  }
  return { efectivo, transferencia }
}

export default function RecaudosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [tab, setTab] = useState<'pendiente' | 'enviado' | 'todos'>('pendiente')
  const [fecha, setFecha] = useState<string>('')
  const [pagos, setPagos] = useState<Pago[]>([])
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [vendedorId, setVendedorId] = useState('')
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [enviando, setEnviando] = useState<Set<string>>(new Set())
  const [enviandoTodos, setEnviandoTodos] = useState(false)
  const [detalleVariacion, setDetalleVariacion] = useState<string | null>(null)
  const [abiertos, setAbiertos] = useState<string[]>([])
  const [voucherUrls, setVoucherUrls] = useState<Record<string, string>>({})
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [enviandoSeleccionados, setEnviandoSeleccionados] = useState(false)
  const fechaInputRef = useRef<HTMLInputElement>(null)

  const isAdmin = user?.role === 'empresa' || user?.role === 'supervisor'

  const cargarVoucherUrl = async (pagoId: string, voucherKey: string) => {
    if (voucherUrls[pagoId]) return
    const res = await fetch('/api/firma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firma: voucherKey }) }).then(r => r.json())
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
    if (status === 'authenticated' && !isAdmin) router.push('/dashboard')
  }, [status, isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/empleados?rol=vendedor&limit=100')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.empleados)) setVendedores(d.empleados) })
      .catch(() => {})
  }, [isAdmin])

  const fetchPagos = useCallback(async (p = 1) => {
    if (!isAdmin) return
    setLoading(true)
    setSeleccionados(new Set())
    const params = new URLSearchParams({ page: String(p) })
    if (vendedorId) params.set('vendedorId', vendedorId)
    if (tab !== 'todos') params.set('estado', tab)
    if (fecha) params.set('fecha', fecha)
    const res = await fetch(`/api/recaudos?${params}`)
    const data = await res.json()
    setPagos(data.pagos ?? [])
    setPages(data.pages ?? 1)
    setPage(p)
    setLoading(false)
  }, [tab, vendedorId, fecha, isAdmin])

  useEffect(() => { fetchPagos(1) }, [fetchPagos])

  async function enviarPago(pagoId: string) {
    setEnviando(prev => new Set(prev).add(pagoId))
    try {
      const res = await fetch(`/api/recaudos/${pagoId}`, {
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

  async function enviarTodos() {
    const pendientes = pagos.filter(p => p.envioEstado === 'pendiente')
    if (!pendientes.length) return
    setEnviandoTodos(true)
    for (const pago of pendientes) await enviarPago(pago.id)
    setEnviandoTodos(false)
  }

  async function enviarSeleccionados() {
    const ids = [...seleccionados]
    if (!ids.length) return
    setEnviandoSeleccionados(true)
    for (const id of ids) {
      const pago = pagos.find(p => p.id === id)
      if (pago && pago.envioEstado === 'pendiente') await enviarPago(id)
    }
    setSeleccionados(new Set())
    setEnviandoSeleccionados(false)
  }

  const pendientesEnPagina = pagos.filter(p => p.envioEstado === 'pendiente').length
  const haySeleccion = seleccionados.size > 0
  const pagosSeleccionados = pagos.filter(p => seleccionados.has(p.id))
  const resumen = haySeleccion ? calcResumen(pagosSeleccionados) : calcResumen(pagos)

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-zinc-400 text-sm animate-pulse">Cargando...</div>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="space-y-4 pb-28">

      {/* Header: título + selector vendedor */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">💳 Recaudos</h1>
          
        </div>
        <select
          value={vendedorId}
          onChange={e => { setVendedorId(e.target.value); setPage(1) }}
          className="bg-[#18181b] border border-[#27272a] rounded-[8px] px-[10px] py-[6px] text-[13px] text-gray-300 outline-none max-w-[130px]">
          <option value="">Vendedores</option>
          {vendedores.map(v => (
            <option key={v.id} value={v.id}>{v.nombre}</option>
          ))}
        </select>
      </div>

      {/* Resumen centrado */}
      <div className="flex items-center justify-center gap-3 text-sm font-semibold">
        {resumen.efectivo > 0 && (
          <span className="text-emerald-400">💵 {fmtMonto(resumen.efectivo)}</span>
        )}
        {resumen.efectivo > 0 && resumen.transferencia > 0 && (
          <span className="text-zinc-600">·</span>
        )}
        {resumen.transferencia > 0 && (
          <span className="text-blue-400">📲 {fmtMonto(resumen.transferencia)}</span>
        )}
        {resumen.efectivo === 0 && resumen.transferencia === 0 && (
          <span className="text-zinc-600 text-xs">Sin montos</span>
        )}
        {haySeleccion && (
          <span className="text-zinc-500 text-xs font-normal">({seleccionados.size} sel.)</span>
        )}
      </div>

      {/* Tabs + botón fecha */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key as any); setPage(1) }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <button
            onClick={() => fechaInputRef.current?.showPicker?.() ?? fechaInputRef.current?.click()}
            className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors whitespace-nowrap">
            {fecha ? `📅 ${fmtFechaBtn(fecha)}` : '📅'}
          </button>
          <input
            ref={fechaInputRef}
            type="date"
            value={fecha}
            onChange={e => { if (e.target.value) { setFecha(e.target.value); setPage(1) } }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </div>
      </div>

      {/* Lista de cards */}
      {loading ? (
        <div className="space-y-2 pb-28">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 animate-pulse h-14" />
          ))}
        </div>
      ) : pagos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-zinc-500 text-sm">No hay recaudos en esta vista</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pagos.map(pago => {
            const enEnvio = enviando.has(pago.id)
            const yaEnviado = pago.envioEstado === 'enviado' || pago.envioEstado === 'recibido'
            const tieneVariacion = pago.envioEstado === 'variacion'
            const tieneVoucher = !!pago.voucherDatosIA
            const voucherData = tieneVoucher ? (pago.voucherDatosIA as any) : null
            const abierto = abiertos.includes(pago.id)
            const seleccionado = seleccionados.has(pago.id)

            return (
              <div key={pago.id}>
                {/* Fila contraída */}
                <div
                  onClick={() => toggleAbierto(pago.id, pago.voucherKey)}
                  className={`bg-[#111] border ${tieneVariacion ? 'border-red-500/40' : seleccionado ? 'border-blue-500/60' : 'border-zinc-800'} ${abierto ? 'rounded-t-[10px]' : 'rounded-[10px]'} px-[11px] py-[9px] flex items-center gap-2 cursor-pointer select-none`}>

                  {/* Checkbox */}
                  <div
                    onClick={e => { e.stopPropagation(); toggleSeleccion(pago.id) }}
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      seleccionado ? 'bg-blue-600 border-blue-600' : 'border-zinc-600 bg-transparent'
                    }`}>
                      {seleccionado && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                    </div>
                  </div>

                  {/* Nombre + vendedor */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate leading-tight">
                      {pago.Cartera.Cliente.nombre}
                    </p>
                    <p className="text-zinc-500 text-xs truncate leading-tight mt-0.5">
                      {pago.Empleado.nombre}
                    </p>
                  </div>

                  {/* Iconos método */}
                  <div className="flex items-center gap-0.5 flex-shrink-0 text-base leading-none">
                    {pago.metodopago === 'efectivo' && <span>💵</span>}
                    {pago.metodopago === 'transferencia' && <span>📲</span>}
                    {pago.descuento && Number(pago.descuento) > 0 && (
                      <span className="text-orange-400 text-xs font-bold ml-0.5">%</span>
                    )}
                  </div>

                  {/* Botón / estado */}
                  <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {tieneVariacion && (
                      <button
                        onClick={() => { setDetalleVariacion(pago.id); if (!abierto) toggleAbierto(pago.id) }}
                        className="text-red-400 border border-red-500/50 px-3 py-1.5 rounded-xl text-sm font-bold hover:bg-red-500/10 transition-colors">
                        ⚑
                      </button>
                    )}
                    {!yaEnviado && !tieneVariacion && (
                      <button
                        onClick={() => enviarPago(pago.id)}
                        disabled={enEnvio}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold px-[10px] py-[5px] rounded-[7px] transition-colors">
                        {enEnvio ? '...' : 'Enviar'}
                      </button>
                    )}
                    {pago.envioEstado === 'enviado' && (
                      <span className="text-blue-400 text-xs font-semibold whitespace-nowrap">
                        ✔ {fmtHora(pago.envioFecha)}
                      </span>
                    )}
                    {pago.envioEstado === 'recibido' && (
                      <span className="text-emerald-400 text-xs font-semibold whitespace-nowrap">
                        ✔✔ {fmtHora(pago.envioFecha)}
                      </span>
                    )}
                    {pago.envioEstado === 'enviando' && (
                      <span className="text-zinc-400 text-xs animate-pulse">Enviando...</span>
                    )}
                  </div>
                </div>

                {/* Panel expandido */}
                {abierto && (
                  <div
                    className={`bg-[#0d0d0d] border border-t-0 ${tieneVariacion ? 'border-red-500/50' : seleccionado ? 'border-blue-500/60' : 'border-zinc-800'} rounded-b-[10px] px-4 py-3 space-y-3`}
                    onClick={e => e.stopPropagation()}>

                    {/* Fecha + método chip */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-lg">
                        {fmtFecha(pago.createdAt)} {fmtHora(pago.createdAt)}
                      </span>
                      <MetodoPagoChip metodo={pago.metodopago} />
                    </div>
                    {/* Voucher + monto + descuento en una línea */}
                    <div className="flex items-center gap-2 bg-[#18181b] border border-[#27272a] rounded-[8px] px-2 py-1.5">
                      {tieneVoucher && pago.voucherKey ? (
                        <div className="w-[34px] h-[34px] rounded-[5px] overflow-hidden flex-shrink-0 bg-[#27272a] border border-[#3f3f46] cursor-pointer"
                          onClick={() => voucherUrls[pago.id] && setLightboxUrl(voucherUrls[pago.id])}>
                          <img src={voucherUrls[pago.id] || ""} alt="v" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </div>
                      ) : (
                        <div className="w-[34px] h-[34px] rounded-[5px] flex-shrink-0 bg-[#111] border border-[#1f1f1f] flex items-center justify-center text-lg">
                          {pago.metodopago === 'efectivo' ? '💵' : '📲'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {voucherData?.banco && <p className="text-zinc-300 text-[11px] font-bold truncate">{voucherData.banco}</p>}
                        {voucherData?.referencia && <p className="text-zinc-500 text-[10px] font-mono truncate">{voucherData.referencia}</p>}
                        {!voucherData && <p className="text-zinc-400 text-[11px]">{pago.metodopago === 'efectivo' ? 'Efectivo' : 'Sin comprobante'}</p>}
                      </div>
                      <span className="text-[#34d399] text-[12px] font-bold flex-shrink-0">{fmtMonto(pago.monto)}</span>
                      {pago.descuento && Number(pago.descuento) > 0 && (
                        <><span className="text-[#3f3f46] text-[11px]">·</span><span className="text-[#f87171] text-[10px] flex-shrink-0">-{fmtMonto(pago.descuento)}</span></>
                      )}
                    </div>
                    {pago.notas && <p className="text-zinc-500 text-xs mt-1">{pago.notas}</p>}

                    {/* Panel variación */}
                    {tieneVariacion && (
                      <VariacionPanel
                        variacion={pago.envioVariacion}
                        pagoId={pago.id}
                        onDetalle={id => setDetalleVariacion(id)}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => fetchPagos(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm disabled:opacity-40 hover:text-white transition-colors">
            ← Anterior
          </button>
          <span className="text-zinc-500 text-sm">{page} / {pages}</span>
          <button
            onClick={() => fetchPagos(page + 1)}
            disabled={page >= pages}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm disabled:opacity-40 hover:text-white transition-colors">
            Siguiente →
          </button>
        </div>
      )}

      {/* Barra fija siempre visible */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-2 pl-24 pr-4 py-3 bg-[#0a0a0a] border-t border-[#1a1a1a] shadow-2xl">
        {haySeleccion ? (
          <>
            <button
              onClick={() => setSeleccionados(new Set())}
              className="flex items-center gap-1 bg-[#18181b] border border-[#27272a] text-zinc-300 text-xs font-bold px-3 py-2 rounded-[8px] flex-shrink-0 whitespace-nowrap">
              {seleccionados.size} sel. <span className="text-zinc-500">✕</span>
            </button>
            <button
              onClick={() => fetchPagos(1)}
              className="flex-1 bg-[#18181b] border border-[#27272a] text-[#9ca3af] text-xs font-bold py-2 rounded-[8px]">
              Validar
            </button>
            <button
              onClick={enviarSeleccionados}
              disabled={enviandoSeleccionados}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-[8px]">
              {enviandoSeleccionados ? 'Enviando...' : 'Enviar'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => fetchPagos(1)}
              className="flex-1 bg-[#18181b] border border-[#27272a] text-[#9ca3af] text-xs font-bold py-2 rounded-[8px]">
              Validar todos
            </button>
            <button
              onClick={enviarTodos}
              disabled={enviandoTodos}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-[8px]">
              {enviandoTodos ? 'Enviando...' : 'Enviar todos'}
            </button>
          </>
        )}
      </div>

      {/* Lightbox voucher */}
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Comprobante" className="max-w-full max-h-full rounded-xl object-contain" />
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
        </div>
      )}
      {/* Modal detalle variación */}
      {detalleVariacion && (() => {
        const pago = pagos.find(p => p.id === detalleVariacion)
        if (!pago) return null
        const v = pago.envioVariacion as any
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDetalleVariacion(null)}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold">⚠ Detalle de variación</h3>
                <button onClick={() => setDetalleVariacion(null)} className="text-zinc-500 hover:text-white">✕</button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Monto enviado</span>
                  <span className="text-white font-mono">{fmtMonto(pago.monto)}</span>
                </div>
                {v?.montoRecibido !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Monto recibido</span>
                    <span className="text-white font-mono">{fmtMonto(v.montoRecibido)}</span>
                  </div>
                )}
                {v?.diferencia !== undefined && (
                  <div className="flex justify-between border-t border-zinc-700 pt-2">
                    <span className="text-red-400 font-semibold">Diferencia</span>
                    <span className="text-red-400 font-bold font-mono">{fmtMonto(v.diferencia)}</span>
                  </div>
                )}
                {v?.detalle && (
                  <p className="text-zinc-400 text-xs">{v.detalle}</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
