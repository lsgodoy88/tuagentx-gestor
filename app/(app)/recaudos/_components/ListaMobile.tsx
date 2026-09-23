'use client'
import type { UseRecaudos } from '../_lib/useRecaudos'
import { fmtFecha, fmtMetodo, fmtMonto, abrirRecibo } from '../_lib/utils'
import { VariacionPanel } from './VariacionPanel'

export function ListaMobile({ r }: { r: UseRecaudos }) {
  const {
    loading, pagos, tab, enviando, abiertos, seleccionados, marcadoEliminar, setMarcadoEliminar,
    toggleAbierto, iniciarLongPress, cancelarLongPress, puedeAdminRecaudos, eliminarPago, eliminando,
    toggleSeleccion, puedeEditarRecaudos, enviarPago, setDetalleVariacion,
    ajusteMonto, setAjusteMonto, ajusteNota, setAjusteNota, ajusteMsg, setAjusteMsg, setModalAjuste,
  } = r

  if (loading) {
    return (
      <div className="space-y-2 pb-28">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 animate-pulse h-14" />
        ))}
      </div>
    )
  }
  if (pagos.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
        <p className="text-white text-sm">No hay recaudos en esta vista</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {pagos.map(pago => {
        const enEnvio       = enviando.has(pago.id)
        const yaEnviado     = pago.envioEstado === 'enviado' || pago.envioEstado === 'recibido' || pago.envioEstado === 'cierreUptres'
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
              {marcadoEliminar === pago.id && puedeAdminRecaudos && (
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
                  {pago.numeroRecibo || '—'} · {fmtFecha(tab === 'revisar' && pago.envioFecha ? pago.envioFecha : pago.createdAt)} · Fact. {pago.numeroFactura || '—'}
                </p>
                <p className="text-white font-semibold text-sm truncate leading-tight mt-0.5">
                  {pago.Cartera?.Cliente?.nombre || (pago as any).cliente?.nombre || (pago as any).clienteNombre || '—'}
                </p>
              </div>
              {/* Iconos método — ocultos en tab Revisar */}
              {tab !== "revisar" && (<div className="flex items-center gap-0.5 flex-shrink-0 text-base leading-none">
                {pago.metodopago === 'efectivo'      && <span>💵</span>}
                {pago.metodopago === 'transferencia' && <span>📲</span>}
                {pago.descuento && Number(pago.descuento) > 0 && (
                  <span className="text-orange-400 text-xs font-bold ml-0.5">%</span>
                )}
              </div>)}
              {/* Botón / estado */}
              <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                {tieneVariacion && (
                  <button onClick={() => { setDetalleVariacion(pago.id); if (!abierto) toggleAbierto(pago.id) }}
                    className="text-red-400 border border-red-500/50 px-3 py-1.5 rounded-xl text-sm font-bold hover:bg-red-500/10 transition-colors">
                    ⚑
                  </button>
                )}
                {!yaEnviado && !tieneVariacion && puedeEditarRecaudos && (
                  <button onClick={() => enviarPago(pago.id)} disabled={enEnvio}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold px-[10px] py-[5px] rounded-[7px] transition-colors">
                    {enEnvio ? '...' : 'Enviar'}
                  </button>
                )}
                {tab !== 'revisar' && pago.envioEstado === 'enviado'  && <span className="text-blue-400 text-xs font-semibold whitespace-nowrap">✔</span>}
                {tab !== 'revisar' && pago.envioEstado === 'recibido' && <span className="text-emerald-400 text-xs font-semibold whitespace-nowrap">✔✔</span>}
                {tab !== 'revisar' && pago.envioEstado === 'cierreUptres' && <span className="text-zinc-400 text-xs font-semibold whitespace-nowrap" title="Deuda cerrada en UpTres">✔✔</span>}
                {tab !== 'revisar' && pago.envioEstado === 'enviando' && <span className="text-white text-xs animate-pulse">Enviando...</span>}
                {tab === 'revisar' && (() => {
                  const ef = pago.envioFecha
                  if (!ef) return <span className="text-zinc-600 text-xs">—</span>
                  const dias = Math.floor((Date.now() - new Date(ef).getTime()) / 86400000)
                  const color = dias > 20 ? '#ef4444' : dias > 10 ? '#f59e0b' : '#6b7280'
                  return <span style={{fontSize:15,fontWeight:800,color,marginLeft:6}}>{dias}d</span>
                })()} 
                {tab === "revisar" && (pago as any).syncDeudaId && !(pago as any).ajusteManual && (
                  <button onClick={e => { e.stopPropagation(); const diff=Math.max(0,Number((pago as any).nSaldo||0)-Number((pago as any).saldoUptres||0)); setAjusteMonto(String(diff||"")); setAjusteNota(""); setAjusteMsg(""); setModalAjuste({syncDeudaId:(pago as any).syncDeudaId,montoSugerido:diff,cliente:pago.Cartera?.Cliente?.nombre||(pago as any).clienteNombre||"",factura:pago.numeroFactura||0}) }}
                    className="text-xs px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700">
                    📝
                  </button>
                )}
                {tab === "revisar" && (pago as any).ajusteManual && (
                  <span className="text-xs text-emerald-400 font-semibold">📝 Ajustado</span>
                )}
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
                      // Si hay una sola linea y ella no trae su propio descuento, usar el
                      // scalar del pago (descuento global aplicado al pago completo)
                      const d = Number(l.descuento || 0) || (ls.length === 1 ? Number(pago.descuento || 0) : 0)
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
                {tab === "revisar" && (() => {
                  const nSaldo = Number((pago as any).nSaldo ?? 0)
                  const saldoUptres = Number((pago as any).saldoUptres ?? 0)
                  const diff = nSaldo - saldoUptres
                  return (
                    <div className="rounded-lg border border-zinc-700 px-3 py-2">
                      <div className="flex items-center justify-between w-full text-xs gap-1">
                        <span className="text-zinc-400 shrink-0">Dif: <span className={diff > 0 ? "font-bold font-mono text-red-400" : diff < 0 ? "font-bold font-mono text-emerald-400" : "font-bold font-mono text-zinc-500"}>{diff > 0 ? "+" : ""}{fmtMonto(diff)}</span></span>
                        <span className="text-zinc-500 shrink-0">UpTres: <span className="text-white font-mono">{fmtMonto(saldoUptres)}</span></span>
                        <span className="text-zinc-500 shrink-0">Bd: <span className="text-white font-mono">{fmtMonto(nSaldo)}</span></span>
                      </div>
                    </div>
                  )
                })()}
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
  )
}
