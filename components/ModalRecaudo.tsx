'use client'
import React, { useEffect, useRef, useState } from 'react'
import { notifyModuleOpen, notifyModuleClose } from '@/lib/moduleEvents'
import InputMoneda from './InputMoneda'
import BorderBeam from './BorderBeam'

interface LineaPago {
  id: string
  metodoPago: 'efectivo' | 'transferencia'
  monto: string
  voucherKey: string | null
  voucherDatosIA: any
  cargandoVoucher: boolean
  errorVoucher?: 'duplicado' | null
}

interface ModalRecaudoProps {
  cartera: any
  detalleData: any
  loadingDetalle: boolean
  lineasPago: LineaPago[]
  descuentosPorFactura: Record<string,string>
  onSetDescuentosPorFactura: (fn: (prev: Record<string,string>) => Record<string,string>) => void
  facturasSeleccionadas: string[]
  procesando: boolean
  fmt: (n: number) => string
  onClose: () => void
  onSetLineasPago: (fn: (prev: LineaPago[]) => LineaPago[]) => void
  onSetFacturasSeleccionadas: (fn: (prev: string[]) => string[]) => void
  onSubirVoucher: (lineaId: string, file: File) => void
  onNotasChange?: (v: string) => void
  onConfirmar: () => void
  crearLinea: () => LineaPago
}

export default function ModalRecaudo({
  cartera, detalleData, loadingDetalle, lineasPago, facturasSeleccionadas, descuentosPorFactura, onSetDescuentosPorFactura,
  procesando, fmt, onClose, onSetLineasPago, onSetFacturasSeleccionadas,
  onSubirVoucher, onConfirmar, crearLinea, onNotasChange,
}: ModalRecaudoProps) {
  const clienteId = cartera?.clienteId || cartera?.cliente?.id || null

  // GPS — igual que ModalVisita
  useEffect(() => {
    notifyModuleOpen()
    return () => { notifyModuleClose() }
  }, [])

  const [capturarGps, setCapturarGps] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<'idle'|'buscando'|'ok'|'error'>('idle')
  const [gpsCoords, setGpsCoords] = useState<{lat:number,lng:number}|null>(null)

  useEffect(() => {
    if (!clienteId) return
    // Verificar si el cliente ya tiene GPS real
    fetch(`/api/cartera/${clienteId}`).then(r => r.json()).then(d => {
      const cl = d?.cartera?.cliente
      if (cl) setCapturarGps(!cl.ubicacionReal)
    }).catch(() => {})
    // Iniciar GPS en background
    if (navigator.geolocation) {
      setGpsStatus('buscando')
      navigator.geolocation.getCurrentPosition(
        pos => { setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsStatus('ok') },
        () => setGpsStatus('error'),
        { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
      )
    }
  }, [clienteId])

  async function guardarGpsSiCorresponde() {
    if (!capturarGps || !clienteId || !gpsCoords) return
    await fetch('/api/clientes/gps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clienteId, lat: gpsCoords.lat, lng: gpsCoords.lng })
    }).catch(() => {})
  }
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const [notasOpen, setNotasOpen] = React.useState(false)
  const [notasLocal, setNotasLocal] = React.useState('')
  const [confirmadoSobrepago, setConfirmadoSobrepago] = React.useState(false)
  const [editandoMonto, setEditandoMonto] = React.useState<Set<string>>(new Set())
  const [montoEditado, setMontoEditado] = React.useState<Record<string, string>>({})

  const montoSeleccionado = (detalleData?.DetalleCartera || [])
    .filter((d: any) => facturasSeleccionadas.includes(d.id))
    .reduce((s: number, d: any) => s + Math.max(0, Number(d.valorFactura ?? d.valor) - Number(d.abonos ?? 0)), 0)

  const totalPagadoActual = lineasPago
    .filter(l => l.metodoPago === 'efectivo' || l.voucherDatosIA)
    .reduce((s, l) => s + Number(l.monto || 0), 0)
  const totalDescuentoActual = Object.values(descuentosPorFactura).reduce((s, v) => s + Number(v || 0), 0)
  const saldoRestanteActual = montoSeleccionado - totalPagadoActual - totalDescuentoActual
  const haySobrepago = saldoRestanteActual < 0 || (saldoRestanteActual > 0 && saldoRestanteActual < 1000)

  React.useEffect(() => { setConfirmadoSobrepago(false) }, [lineasPago, descuentosPorFactura, facturasSeleccionadas])
  React.useEffect(() => {
    if (lineasPago.length > 1) setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 80)
  }, [lineasPago.length])

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 px-2" style={{background:"#0f1729"}}>
      <div style={{ width:'100%', maxWidth:512 }}>
        <div className="rounded-2xl w-full max-h-[90vh] flex flex-col overflow-hidden" style={{background:"#0f172a", border:'1px solid rgba(59,130,246,0.50)'}}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-2.5 border-b" style={{borderColor:"rgba(59,130,246,0.30)"}}>
          <p className="text-white font-semibold text-sm leading-tight">{cartera.cliente?.nombre || cartera.nombre}</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl ml-3 flex-shrink-0">×</button>
        </div>

        <div ref={scrollRef} className="px-4 space-y-3 pb-safe overflow-y-auto overscroll-contain flex-1 pt-4" style={{paddingBottom:"max(4rem, calc(env(safe-area-inset-bottom, 0px) + 3rem))"}}>

          {/* Skeleton */}
          {loadingDetalle ? (
            <div className="space-y-3 animate-pulse">
              <div className="shimmer-light h-4 w-36 rounded" />
              {[0,1].map(i => (
                <div key={i} className="bg-zinc-500/40 border border-blue-500/25 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="shimmer-light w-5 h-5 rounded flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="shimmer-light h-3.5 w-24 rounded" />
                    <div className="shimmer-light h-3 w-28 rounded" />
                  </div>
                  <div className="text-right space-y-1.5">
                    <div className="shimmer-light h-4 w-20 rounded" />
                    <div className="shimmer-light h-3 w-16 rounded ml-auto" />
                  </div>
                </div>
              ))}
              <div className="bg-zinc-500/40 border border-blue-500/25 rounded-xl p-4 space-y-3">
                <div className="shimmer-light h-3.5 w-16 rounded" />
                <div className="flex gap-2">
                  <div className="shimmer-light flex-1 h-10 rounded-xl" />
                  <div className="shimmer-light flex-1 h-10 rounded-xl" />
                </div>
              </div>
            </div>
          ) : !detalleData ? (
            <p className="text-zinc-500 text-sm text-center py-4">Sin cartera registrada</p>
          ) : (
            <>
              {/* Facturas pendientes */}
              {detalleData.DetalleCartera?.filter((d: any) => d.estado !== 'pagada').length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-white text-sm font-semibold uppercase tracking-wide">Facturas pendientes</p>
                  {detalleData.DetalleCartera.filter((d: any) => d.estado !== 'pagada').map((d: any) => {
                    const saldo = Math.max(0, Number(d.valorFactura ?? d.valor) - Number(d.abonos ?? 0))
                    const seleccionada = facturasSeleccionadas.includes(d.id)
                    return (
                      <label key={d.id} className={`flex items-center gap-3 bg-zinc-500/40 border rounded-xl px-4 py-2.5 cursor-pointer transition-all ${
                        seleccionada ? 'border-emerald-500/50' : 'border-blue-500/25 hover:border-blue-500/40'
                      }`}>
                        <input type="checkbox" checked={seleccionada}
                          onChange={e => onSetFacturasSeleccionadas(prev =>
                            e.target.checked ? [...prev, d.id] : prev.filter(x => x !== d.id)
                          )}
                          className="accent-emerald-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          {d.numeroFactura && <p className="text-white text-sm font-medium">Fact. {d.numeroFactura}</p>}
                          {d.electronicInvoiceNumber && <p className="text-white text-sm font-medium">Elect: {d.electronicInvoiceNumber}</p>}
                          {d.fechaVencimiento && <p className="text-zinc-500 text-xs">Vence: {new Date(d.fechaVencimiento).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-white text-base font-bold">{fmt(saldo)}</p>
                          <span className={`text-xs ${
                            d.estadoColor === 'red' ? 'text-red-400' :
                            d.estadoColor === 'orange' ? 'text-orange-400' :
                            d.estadoColor === 'amber' ? 'text-amber-400' :
                            d.estadoColor === 'yellow' ? 'text-yellow-400' :
                            d.estadoColor === 'emerald' ? 'text-emerald-400' :
                            'text-zinc-400'
                          }`}>{d.estadoLabel || d.estado}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}

              {/* Líneas de pago */}
              <div className="space-y-3">
                {lineasPago.map((linea, idx) => (
                  <div key={linea.id}
                    className={`bb-host${linea.cargandoVoucher ? ' bb-active' : ''}`}
                    style={{ position:'relative', borderRadius:14, padding: linea.cargandoVoucher ? 2 : 0, overflow:'hidden' }}>
                    <BorderBeam active={linea.cargandoVoucher} borderRadius={14} duration={3} />
                    <div className="bg-zinc-500/40 border border-blue-500/25 rounded-xl p-4 space-y-3"
                      style={{ position:'relative', zIndex:1, border: linea.cargandoVoucher ? 'none' : undefined }}>
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-semibold uppercase tracking-wide">Pago {idx + 1}</span>
                      {lineasPago.length > 1 && (
                        <button onClick={() => onSetLineasPago(prev => prev.filter(l => l.id !== linea.id))}
                          className="text-zinc-500 hover:text-red-400 text-sm">✕</button>
                      )}
                    </div>

                    {/* Método */}
                    <div className="flex gap-2">
                      {(['efectivo', 'transferencia'] as const).map(met => (
                        <button key={met}
                          onClick={() => onSetLineasPago(prev => prev.map(l =>
                            l.id === linea.id ? { ...l, metodoPago: met, voucherKey: null, voucherDatosIA: null, cargandoVoucher: false } : l
                          ))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                            linea.metodoPago === met
                              ? met === 'efectivo'
                                ? 'bg-emerald-600/40 border-emerald-400/60 text-white'
                                : 'bg-orange-600/40 border-orange-400/60 text-white'
                              : met === 'efectivo' ? 'bg-zinc-700/40 border-emerald-600/60 text-white' : 'bg-zinc-700/40 border-orange-600/60 text-white'
                          }`}>
                          {met === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
                        </button>
                      ))}
                    </div>

                    {/* Efectivo */}
                    {linea.metodoPago === 'efectivo' && (
                      <div className="flex items-center gap-2">
                        <label className="text-white text-sm font-semibold whitespace-nowrap">Monto *</label>
                        <InputMoneda value={linea.monto}
                          onChange={val => onSetLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, monto: val } : l))}
                          className="flex-1 bg-blue-950/40 border border-emerald-500/60 rounded-xl pr-4 py-2.5 text-white text-sm outline-none focus:border-emerald-400" />
                      </div>
                    )}

                    {/* Transferencia */}
                    {linea.metodoPago === 'transferencia' && (
                      <div className="space-y-3">
                        {!linea.voucherKey && !linea.cargandoVoucher && (
                          <label className={`w-full border border-dashed rounded-xl py-2.5 text-sm transition-all flex items-center justify-center cursor-pointer ${
                              linea.errorVoucher === 'duplicado'
                                ? 'bg-red-950/30 border-red-500 text-red-400'
                                : 'bg-zinc-500/30 border-orange-500/60 text-white hover:text-white hover:border-orange-400'
                            }`}>
                            {linea.errorVoucher === 'duplicado' ? '⚠️ Comprobante duplicado' : '📎 Adjuntar comprobante'}
                            <input type="file" accept="image/*,application/pdf" multiple className="hidden"
                              onChange={async e => {
                              const files = Array.from(e.target.files || [])
                              if (!files.length) return
                              onSetLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, cargandoVoucher: true } : l))

                              // SHA-256 del base64 para deduplicar archivos idénticos (Capa 1)
                              const hashBase64 = async (b64: string): Promise<string> => {
                                const bytes = Uint8Array.from(atob(b64.split(',')[1] ?? b64), c => c.charCodeAt(0))
                                const buf = await crypto.subtle.digest('SHA-256', bytes)
                                return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
                              }

                              const comprimirArchivo = (file: File): Promise<string> => new Promise((res, rej) => {
                                const r = new FileReader()
                                r.onerror = rej
                                r.onload = ev => {
                                  const raw = ev.target?.result as string
                                  if (file.type === 'application/pdf') return res(raw)
                                  const img = new Image()
                                  img.onerror = () => res(raw)
                                  img.onload = () => {
                                    const MAX = 1400
                                    const scale = Math.min(1, MAX / Math.max(img.width, img.height))
                                    const canvas = document.createElement('canvas')
                                    canvas.width = Math.round(img.width * scale)
                                    canvas.height = Math.round(img.height * scale)
                                    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
                                    res(canvas.toDataURL('image/jpeg', 0.82))
                                  }
                                  img.src = raw
                                }
                                r.readAsDataURL(file)
                              })

                              try {
                                // Hashes ya existentes en lineasPago actuales (Capa 1 cross-sesión modal)
                                const hashesExistentes = new Set(
                                  lineasPago.map((l: any) => l.hashArchivo).filter(Boolean)
                                )
                                // Referencias ya existentes (Capa 2)
                                const refsExistentes = new Set(
                                  lineasPago.map((l: any) => l.voucherDatosIA?.referencia).filter(Boolean)
                                )

                                let lineasNuevas: any[] = []
                                for (const file of files) {
                                  const archivoBase64 = await comprimirArchivo(file)
                                  const hash = await hashBase64(archivoBase64)

                                  // Capa 1: skip si archivo idéntico ya cargado
                                  if (hashesExistentes.has(hash)) {
                                    console.info('[voucher] archivo duplicado (hash), skip:', file.name)
                                    onSetLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, cargandoVoucher: false, errorVoucher: 'duplicado' } : l))
                                    setTimeout(() => onSetLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, errorVoucher: null } : l)), 3000)
                                    continue
                                  }
                                  hashesExistentes.add(hash)

                                  const tempId = crypto.randomUUID()
                                  const resp = await fetch('/api/cartera/voucher', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archivoBase64, mimeType: file.type, pagoId: tempId }) })
                                  const data = await resp.json()
                                  const pagos: any[] = Array.isArray(data.pagos) && data.pagos.length > 0 ? data.pagos : [data.datosIA]

                                  const lineasArchivo = pagos.map((p: any) => {
                                    // Capa 2: advertencia si referencia ya existe
                                    const refDuplicada = p?.referencia && refsExistentes.has(p.referencia)
                                    if (p?.referencia) refsExistentes.add(p.referencia)
                                    return {
                                      ...crearLinea(),
                                      id: crypto.randomUUID(),
                                      metodoPago: 'transferencia' as const,
                                      voucherKey: data.key,
                                      voucherDatosIA: p,
                                      cargandoVoucher: false,
                                      monto: p?.valor ? String(Math.round(p.valor)) : '',
                                      hashArchivo: hash,
                                      alertaDuplicado: refDuplicada ? `⚠️ Ref. ${p.referencia} ya fue cargada en este recaudo` : undefined,
                                    }
                                  })
                                  lineasNuevas = [...lineasNuevas, ...lineasArchivo]
                                }

                                if (!lineasNuevas.length) {
                                  // Todos los archivos eran duplicados
                                  onSetLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, cargandoVoucher: false } : l))
                                  return
                                }

                                onSetLineasPago(prev => {
                                  const idx = prev.findIndex(l => l.id === linea.id)
                                  if (idx === -1) return prev
                                  const [primera, ...resto] = lineasNuevas
                                  const lineasInsert = [{ ...primera, id: linea.id }, ...resto]
                                  return [...prev.slice(0, idx), ...lineasInsert, ...prev.slice(idx + 1)]
                                })
                              } catch(err) {
                                console.error('[modal] error voucher:', err)
                                onSetLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, cargandoVoucher: false } : l))
                              }
                            }} />
                          </label>
                        )}
                        {linea.cargandoVoucher && (
                          <div className="rounded-xl px-4 py-3 text-blue-400 text-sm text-center font-medium">
                            ⏳ Analizando comprobante con IA...
                          </div>
                        )}
                        {linea.voucherKey && !linea.voucherDatosIA && !linea.cargandoVoucher && (
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 text-xs text-center">
                            ⚠️ No se pudo leer el comprobante — ingresa el monto manualmente
                          </div>
                        )}
                        {linea.voucherDatosIA && !linea.cargandoVoucher && (
                          <div className="bg-zinc-500/40 border border-emerald-400/30 rounded-xl px-4 py-3 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-emerald-400 text-xs font-semibold">✅ Comprobante procesado</span>
                              <button onClick={() => {
                                onSetLineasPago(prev => prev.map(l =>
                                  l.id === linea.id ? { ...l, voucherKey: null, voucherDatosIA: null, monto: '' } : l
                                ))
                              }} className="text-zinc-500 hover:text-red-400 text-xs">✕ Quitar</button>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              {linea.voucherDatosIA.valor != null && <div><span className="text-zinc-500">Valor:</span> <span className="text-white font-semibold">{fmt(linea.voucherDatosIA.valor)}</span></div>}
                              {linea.voucherDatosIA.fecha && <div><span className="text-zinc-500">Fecha:</span> <span className="text-white">{linea.voucherDatosIA.fecha}</span></div>}
                              {linea.voucherDatosIA.banco && <div className="col-span-2"><span className="text-zinc-500">Banco:</span> <span className="text-white">{linea.voucherDatosIA.banco}</span></div>}
                              {linea.voucherDatosIA.referencia && <div className="col-span-2"><span className="text-zinc-500">Ref:</span> <span className="text-white">{linea.voucherDatosIA.referencia}</span></div>}
                            </div>
                            {(linea as any).alertaDuplicado && (
                              <p className="text-amber-400 text-xs font-semibold mt-1">{(linea as any).alertaDuplicado}</p>
                            )}
                          </div>
                        )}
                        {linea.voucherDatosIA && (
                          <div className="flex items-center gap-2 w-full overflow-hidden">
                            <label className="text-white text-sm font-semibold whitespace-nowrap shrink-0">Monto (IA)</label>
                            {(() => {
                              const estaEditando = editandoMonto.has(linea.id)
                              const original = Number(linea.voucherDatosIA?.valor ?? linea.monto)
                              const valorActual = Number(montoEditado[linea.id] ?? linea.monto)
                              const esMayor = estaEditando && valorActual >= original
                              return (
                                <>
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    <InputMoneda
                                      value={estaEditando ? (montoEditado[linea.id] ?? linea.monto) : linea.monto}
                                      readOnly={!estaEditando}
                                      onChange={val => setMontoEditado(prev => ({ ...prev, [linea.id]: val }))}
                                      className={`w-full bg-blue-950/30 border rounded-xl pr-4 py-2.5 text-white text-sm outline-none ${
                                        esMayor ? 'border-red-500' : estaEditando ? 'border-amber-400 cursor-text' : 'border-orange-500/60 cursor-not-allowed'
                                      }`}
                                    />
                                  </div>
                                  <button
                                    disabled={esMayor}
                                    onClick={() => {
                                      if (estaEditando) {
                                        if (valorActual > 0 && valorActual < original) {
                                          onSetLineasPago(prev => prev.map(l =>
                                            l.id === linea.id ? { ...l, monto: String(valorActual), valorModificado: true } : l
                                          ))
                                          setNotasOpen(true)
                                        }
                                        setEditandoMonto(prev => { const s = new Set(prev); s.delete(linea.id); return s })
                                      } else {
                                        setMontoEditado(prev => ({ ...prev, [linea.id]: linea.monto }))
                                        setEditandoMonto(prev => new Set(prev).add(linea.id))
                                      }
                                    }}
                                    className={`flex-shrink-0 text-base leading-none transition-colors ${esMayor ? 'opacity-30 cursor-not-allowed' : 'text-zinc-400 hover:text-amber-400'}`}
                                    title={estaEditando ? 'Guardar valor' : 'Editar valor (solo menor al extraído)'}>
                                    {estaEditando ? '💾' : '✏️'}
                                  </button>
                                </>
                              )
                            })()}

                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                ))}

              {/* Descuentos por factura — antes de agregar otro método */}
              {(() => {
                const factsSelec = (detalleData?.DetalleCartera || []).filter((d: any) =>
                  facturasSeleccionadas.includes(d.id) && d.estado !== 'pagada'
                )
                if (factsSelec.length === 0) return null
                const hayDescuento = factsSelec.some((d: any) => (d.syncDeudaId || d.id) in descuentosPorFactura)
                return (
                  <div className="space-y-2">
                    {hayDescuento ? (
                      <div className="bg-zinc-500/40 border border-blue-500/25 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-white text-sm font-semibold uppercase tracking-wide">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
                            Descuento Fact. {factsSelec.map((d: any) => d.numeroFactura).join(', ')}
                          </span>
                          <button
                            onClick={() => onSetDescuentosPorFactura(() => ({}))}
                            className="text-zinc-500 hover:text-red-400 text-sm">✕</button>
                        </div>
                        {factsSelec.map((d: any) => {
                          const key = d.syncDeudaId || d.id
                          return (
                            <div key={key} className="space-y-1.5">
                              <InputMoneda
                                value={descuentosPorFactura[key] || ''}
                                placeholder="0"
                                prefix=""
                                onChange={val => onSetDescuentosPorFactura(prev => ({ ...prev, [key]: val }))}
                                className="w-full bg-blue-950/40 border border-blue-500/30 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-400"
                              />
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const inicial: Record<string,string> = {}
                          if (factsSelec.length === 1) {
                            const d = factsSelec[0]
                            const saldoFact = Math.max(0, Number(d.valorFactura ?? d.valor) - Number(d.abonos ?? 0))
                            const sugerido = Math.max(0, saldoFact - totalPagadoActual)
                            inicial[d.syncDeudaId || d.id] = sugerido > 0 ? String(Math.round(sugerido)) : ''
                          } else {
                            factsSelec.forEach((d: any) => { inicial[d.syncDeudaId || d.id] = '' })
                          }
                          onSetDescuentosPorFactura(() => inicial)
                        }}
                        className="w-full bg-zinc-500/30 border border-dashed border-zinc-400/40 hover:border-white text-white text-sm py-2.5 rounded-xl transition-colors">
                        <span className="flex items-center justify-center gap-2 text-sm">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
                          Descuento Fact. {factsSelec.map((d: any) => d.numeroFactura).join(', ')}
                        </span>
                      </button>
                    )}
                  </div>
                )
              })()}

                <button onClick={() => onSetLineasPago(prev => [...prev, crearLinea()])}
                  className="w-full bg-zinc-500/30 border border-dashed border-zinc-400/40 hover:border-white text-white text-sm py-2.5 rounded-xl transition-colors font-semibold tracking-wide">
                  ＋ AGREGAR PAGO {lineasPago.length + 1}
                </button>
              </div>

              {/* Resumen */}
              {(() => {
                const contables = lineasPago.filter(l => l.metodoPago === 'efectivo' || l.voucherDatosIA)
                const totalPagado = contables.reduce((s, l) => s + Number(l.monto || 0), 0)
                const totalDescuento = Object.values(descuentosPorFactura).reduce((s, v) => s + Number(v || 0), 0)
                const saldoRestante = montoSeleccionado - totalPagado - totalDescuento
                return (
                  <div className="bg-zinc-500/40 border border-blue-500/25 rounded-xl px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white text-sm font-semibold uppercase tracking-wide">Resumen</p>
                      {(() => {
                        // Simular FIFO igual que la API — solo mostrar facturas que el monto cubre
                        const totalAplicado = contables.reduce((s, l) => s + Number(l.monto || 0), 0) +
                          Object.values(descuentosPorFactura).reduce((s: number, v) => s + Number(v || 0), 0)
                        const factsOrdenadas = (detalleData?.DetalleCartera || [])
                          .filter((d: any) => facturasSeleccionadas.includes(d.id) && d.estado !== 'pagada')
                          .sort((a: any, b: any) => {
                            const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity
                            const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity
                            return fa - fb
                          })
                        let restante = totalAplicado
                        const factsAplicadas: string[] = []
                        for (const d of factsOrdenadas) {
                          if (restante <= 0) break
                          const saldo = Number(d.nSaldo ?? d.saldo ?? 0)
                          if (saldo <= 0) continue
                          if (d.numeroFactura) factsAplicadas.push(String(d.numeroFactura))
                          restante -= Math.min(saldo, restante)
                        }
                        return factsAplicadas.length > 0
                          ? <span className="text-zinc-400 text-xs font-mono">{factsAplicadas.join(' · ')}</span>
                          : null
                      })()}
                    </div>
                    {contables.map((l, i) => (
                      <div key={l.id} className="flex justify-between items-center text-sm">
                        <span className="text-white">Pago {i + 1} · {l.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</span>
                        <span className="text-white font-medium">{l.monto ? fmt(Number(l.monto)) : '—'}</span>
                      </div>
                    ))}
                    <div className="border-t border-zinc-700 pt-1.5 mt-1.5 space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-white">Total pagado</span>
                        <span className="text-white font-bold">{fmt(totalPagado)}</span>
                      </div>
                      {totalDescuento > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-white">Descuento</span>
                          <span className="text-orange-400 font-bold">{fmt(totalDescuento)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-white">Deuda actual</span>
                        <span className="text-white">{fmt(montoSeleccionado)}</span>
                      </div>
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-white">Saldo restante</span>
                        <span className={saldoRestante < 1000 ? 'text-orange-400' : 'text-amber-400'}>
                          {saldoRestante < 0 ? `-${fmt(Math.abs(saldoRestante))}` : fmt(saldoRestante)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Notas */}
              <div>
                <button onClick={() => setNotasOpen(o => !o)}
                  className="flex items-center gap-2 text-white text-xs font-semibold w-full text-left">
                  <span>Notas (opcional)</span>
                  <span className="text-zinc-500">{notasOpen ? '▲' : '▼'}</span>
                </button>
                <textarea rows={2} placeholder="Observaciones del recaudo..."
                  value={notasLocal} onChange={e => { setNotasLocal(e.target.value); onNotasChange?.(e.target.value) }}
                  style={{ display: notasOpen ? 'block' : 'none' }}
                  className="mt-1.5 w-full bg-blue-950/40 border border-blue-500/30 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-400 resize-none" />
              </div>

              {/* Botón confirmar */}
              {(() => {
                const transferenciasSinVoucher = lineasPago.filter(l => l.metodoPago === 'transferencia' && !l.voucherDatosIA && !l.cargandoVoucher)
                const hayTransferenciaSinVoucher = transferenciasSinVoucher.length > 0
                const totalMonto = lineasPago.reduce((s, l) => s + Number(l.monto || 0), 0)
                const sinMonto = totalMonto <= 0
                const pedirConfirmacionSobrepago = haySobrepago && !confirmadoSobrepago
                const hayValorModificado = lineasPago.some((l: any) => l.valorModificado)
                const notasInsuficientes = hayValorModificado && notasLocal.trim().split(/\s+/).filter(Boolean).length < 3
                return (
                  <>
                    {/* GPS — solo si vendedor, igual que ModalVisita */}
                    <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}}>
                      <input type="checkbox" id="capturarGpsRecaudo" checked={capturarGps}
                        onChange={e => setCapturarGps(e.target.checked)}
                        className="w-4 h-4 accent-emerald-500" />
                      <label htmlFor="capturarGpsRecaudo" className="text-white text-sm cursor-pointer">
                        Guardar ubicación de este cliente
                      </label>
                    </div>
                    {gpsStatus === 'buscando' && capturarGps && (
                      <p className="text-zinc-500 text-xs">📡 Obteniendo GPS...</p>
                    )}
                    {gpsStatus === 'ok' && capturarGps && (
                      <p className="text-emerald-400 text-xs">📍 Ubicación lista</p>
                    )}
                    {hayTransferenciaSinVoucher && (
                      <p className="text-amber-400 text-xs text-center">📎 Adjunta el comprobante para continuar</p>
                    )}
                    {notasInsuficientes && (
                      <p className="text-amber-400 text-xs text-center">Escribe en Notas una Observación, mín 3 palabras.</p>
                    )}
                    {pedirConfirmacionSobrepago ? (
                      <button onClick={() => setConfirmadoSobrepago(true)} disabled={procesando || hayTransferenciaSinVoucher || sinMonto || notasInsuficientes}
                        className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors">
                        ⚠️ Confirmar saldo
                      </button>
                    ) : (
                      <button onClick={() => { guardarGpsSiCorresponde(); onConfirmar() }} disabled={procesando || hayTransferenciaSinVoucher || sinMonto || notasInsuficientes}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors">
                        {procesando ? 'Procesando...' : '✅ Confirmar recaudo'}
                      </button>
                    )}
                  </>
                )
              })()}
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
