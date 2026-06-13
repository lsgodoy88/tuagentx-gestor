'use client'
import React from 'react'
import { useRef } from 'react'
import InputMoneda from './InputMoneda'

interface LineaPago {
  id: string
  metodoPago: 'efectivo' | 'transferencia'
  monto: string
  voucherKey: string | null
  voucherDatosIA: any
  cargandoVoucher: boolean
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
  onConfirmar: () => void
  crearLinea: () => LineaPago
}

export default function ModalRecaudo({
  cartera, detalleData, loadingDetalle, lineasPago, facturasSeleccionadas, descuentosPorFactura, onSetDescuentosPorFactura,
  procesando, fmt, onClose, onSetLineasPago, onSetFacturasSeleccionadas,
  onSubirVoucher, onConfirmar, crearLinea,
}: ModalRecaudoProps) {
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const [notasOpen, setNotasOpen] = React.useState(false)

  const montoSeleccionado = (detalleData?.DetalleCartera || [])
    .filter((d: any) => facturasSeleccionadas.includes(d.id))
    .reduce((s: number, d: any) => s + Math.max(0, Number(d.valorFactura ?? d.valor) - Number(d.abonos ?? 0)), 0)

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 px-2" style={{background:"#0f1729"}}>
      <div className="rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" style={{background:"#0f172a",border:"1px solid rgba(59,130,246,0.50)"}}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-2.5 border-b" style={{borderColor:"rgba(59,130,246,0.30)"}}>
          <p className="text-white font-semibold text-sm leading-tight">{cartera.cliente?.nombre || cartera.nombre}</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl ml-3 flex-shrink-0">×</button>
        </div>

        <div className="px-4 space-y-3 pb-4 overflow-y-auto overscroll-contain flex-1 pt-4">

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
                  <p className="text-zinc-300 text-sm font-semibold uppercase tracking-wide">Facturas pendientes</p>
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
                  <div key={linea.id} className="bg-zinc-500/40 border border-blue-500/25 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-300 text-sm font-semibold uppercase tracking-wide">Pago {idx + 1}</span>
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
                              ? 'bg-zinc-400/20 border-zinc-300/50 text-white'
                              : 'bg-zinc-700/40 border-blue-500/30 text-zinc-300 hover:text-white'
                          }`}>
                          {met === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
                        </button>
                      ))}
                    </div>

                    {/* Efectivo */}
                    {linea.metodoPago === 'efectivo' && (
                      <div>
                        <label className="text-zinc-300 text-sm font-semibold block mb-1.5">Monto *</label>
                        <InputMoneda value={linea.monto}
                          onChange={val => onSetLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, monto: val } : l))}
                          className="w-full bg-blue-950/40 border border-blue-500/30 rounded-xl pr-4 py-2.5 text-white text-sm outline-none focus:border-blue-400" />
                      </div>
                    )}

                    {/* Transferencia */}
                    {linea.metodoPago === 'transferencia' && (
                      <div className="space-y-3">
                        <input type="file" accept="image/*,application/pdf" className="hidden"
                          ref={el => { if (el) fileInputRefs.current.set(linea.id, el); else fileInputRefs.current.delete(linea.id) }}
                          onChange={e => { if (e.target.files?.[0]) onSubirVoucher(linea.id, e.target.files[0]) }} />

                        {!linea.voucherKey && !linea.cargandoVoucher && (
                          <button onClick={() => fileInputRefs.current.get(linea.id)?.click()}
                            className="w-full bg-zinc-500/30 border border-dashed border-zinc-400/40 rounded-xl py-2.5 text-zinc-300 text-sm hover:text-white hover:border-zinc-300 transition-colors">
                            📎 Adjuntar comprobante
                          </button>
                        )}
                        {linea.cargandoVoucher && (
                          <div className="bg-zinc-500/40 border border-blue-500/25 rounded-xl px-4 py-3 text-zinc-300 text-sm text-center animate-pulse">
                            Analizando comprobante con IA...
                          </div>
                        )}
                        {linea.voucherDatosIA && !linea.cargandoVoucher && (
                          <div className="bg-zinc-500/40 border border-emerald-400/30 rounded-xl px-4 py-3 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-emerald-400 text-xs font-semibold">✅ Comprobante procesado</span>
                              <button onClick={() => onSetLineasPago(prev => prev.map(l =>
                                l.id === linea.id ? { ...l, voucherKey: null, voucherDatosIA: null, monto: '' } : l
                              ))} className="text-zinc-500 hover:text-red-400 text-xs">✕ Quitar</button>
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
                            <div className="flex-[6]">
                              <label className="text-zinc-300 text-sm font-semibold block mb-1.5">Monto (IA)</label>
                              <InputMoneda value={linea.monto} onChange={val => onSetLineasPago(prev => prev.map(l => l.id === linea.id ? { ...l, monto: val } : l))}
                                className="w-full bg-blue-950/30 border border-blue-500/20 rounded-xl pr-4 py-2.5 text-zinc-400 text-sm outline-none cursor-not-allowed" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
                          <span className="text-zinc-300 text-sm font-semibold uppercase tracking-wide">Descuento comercial</span>
                          <button
                            onClick={() => onSetDescuentosPorFactura(() => ({}))}
                            className="text-zinc-500 hover:text-red-400 text-sm">✕</button>
                        </div>
                        {factsSelec.map((d: any) => {
                          const key = d.syncDeudaId || d.id
                          return (
                            <div key={key} className="space-y-1.5">
                              <label className="text-zinc-300 text-sm font-semibold block">Fact. #{d.numeroFactura}</label>
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
                          factsSelec.forEach((d: any) => { inicial[d.syncDeudaId || d.id] = '' })
                          onSetDescuentosPorFactura(() => inicial)
                        }}
                        className="w-full bg-zinc-500/30 border border-dashed border-zinc-400/40 hover:border-zinc-300 text-zinc-300 hover:text-white text-sm py-2.5 rounded-xl transition-colors">
                        ＋ Agregar descuento
                      </button>
                    )}
                  </div>
                )
              })()}

                <button onClick={() => onSetLineasPago(prev => [...prev, crearLinea()])}
                  className="w-full bg-zinc-500/30 border border-dashed border-zinc-400/40 hover:border-zinc-300 text-zinc-300 hover:text-white text-sm py-2.5 rounded-xl transition-colors">
                  ＋ Agregar otro método
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
                    <p className="text-zinc-300 text-sm font-semibold uppercase tracking-wide mb-2">Resumen</p>
                    {contables.map((l, i) => (
                      <div key={l.id} className="flex justify-between items-center text-sm">
                        <span className="text-zinc-500">Pago {i + 1} · {l.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</span>
                        <span className="text-white font-medium">{l.monto ? fmt(Number(l.monto)) : '—'}</span>
                      </div>
                    ))}
                    <div className="border-t border-zinc-700 pt-1.5 mt-1.5 space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-zinc-400">Total pagado</span>
                        <span className="text-white font-bold">{fmt(totalPagado)}</span>
                      </div>
                      {totalDescuento > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-zinc-400">Descuento</span>
                          <span className="text-orange-400 font-bold">{fmt(totalDescuento)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-zinc-400">Deuda actual</span>
                        <span className="text-zinc-300">{fmt(montoSeleccionado)}</span>
                      </div>
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-white">Saldo restante</span>
                        <span className={saldoRestante <= 0 ? 'text-emerald-400' : 'text-amber-400'}>{fmt(Math.max(0, saldoRestante))}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Notas */}
              <div>
                <button onClick={() => setNotasOpen(o => !o)}
                  className="flex items-center gap-2 text-zinc-400 text-xs font-semibold w-full text-left">
                  <span>Notas (opcional)</span>
                  <span className="text-zinc-500">{notasOpen ? '▲' : '▼'}</span>
                </button>
                {notasOpen && (
                  <textarea rows={2} placeholder="Observaciones del recaudo..."
                    className="mt-1.5 w-full bg-blue-950/40 border border-blue-500/30 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-400 resize-none" />
                )}
              </div>

              {/* Botón confirmar */}
              {(() => {
                const transferenciasSinVoucher = lineasPago.filter(l => l.metodoPago === 'transferencia' && !l.voucherDatosIA && !l.cargandoVoucher)
                const hayTransferenciaSinVoucher = transferenciasSinVoucher.length > 0
                const totalMonto = lineasPago.reduce((s, l) => s + Number(l.monto || 0), 0)
                const sinMonto = totalMonto <= 0
                return (
                  <>
                    {hayTransferenciaSinVoucher && (
                      <p className="text-amber-400 text-xs text-center">📎 Adjunta el comprobante para continuar</p>
                    )}
                    <button onClick={onConfirmar} disabled={procesando || hayTransferenciaSinVoucher || sinMonto}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors">
                      {procesando ? 'Procesando...' : '✅ Confirmar recaudo'}
                    </button>
                  </>
                )
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
