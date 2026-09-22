'use client'
import { iconoTransprensa, formatFechaCorta } from '../_lib/utils'

interface Props {
  despachoLog: any[]
  ciudadLocal: string | null
  envioFiltro: string
  fechaFiltro: string
  busqueda: string
  ciudadFiltro: string
  iconEstadoFiltro: string
  ordenDesc: 'asc' | 'desc' | null
  expanded: Record<string, boolean>
  cajasEdit: Record<string, number>
  editTransporte: Record<string, { transportadora: string; guia: string }>
  guiaPopup: string | null
  obsPopupLog: string | null
  saving: Record<string, boolean>
  onToggleExpanded: (id: string) => void
  onSetCajasEdit: (id: string, v: number) => void
  onSetEditTransporte: (id: string, v: { transportadora: string; guia: string }) => void
  onSetGuiaPopup: (v: string | null) => void
  onSetObsPopupLog: (v: string | null) => void
  onSetGuiaEditando: (v: string | null) => void
  guiaEditando: string | null
  onSetEscanerOrdenId: (id: string) => void
  onSetEscanerLogId: (id: string) => void
  onAbrirGaleria: (keys: string[], fecha?: string | null, esFirma?: boolean) => void
  onPatchOrden: (id: string, body: Record<string, unknown>) => Promise<void>
  onCargarDespachoLog: (reset?: boolean) => Promise<void>
  onSetModalObsTexto: (v: string | null) => void
}

export default function TabDespachados({
  despachoLog, ciudadLocal, envioFiltro, fechaFiltro, busqueda,
  ciudadFiltro, iconEstadoFiltro, ordenDesc, expanded, cajasEdit,
  editTransporte, guiaPopup, obsPopupLog, saving, guiaEditando,
  onToggleExpanded, onSetCajasEdit, onSetEditTransporte, onSetGuiaPopup,
  onSetObsPopupLog, onSetGuiaEditando, onSetEscanerOrdenId, onSetEscanerLogId,
  onAbrirGaleria, onPatchOrden, onCargarDespachoLog, onSetModalObsTexto,
}: Props) {
  if (despachoLog.length === 0) return null

  const hayFiltro = envioFiltro !== 'todos' || !!fechaFiltro || !!busqueda || !!ciudadFiltro || !!iconEstadoFiltro
  const logMap = new Map(despachoLog.map((l: any) => [String(l.numeroFactura), l]))
  const allNums = despachoLog.map((x: any) => parseInt(x.numeroFactura)).filter((n: number) => !isNaN(n))
  if (allNums.length === 0) return null

  const rangeMax = Math.max(...allNums)
  const rangeMin = Math.min(...allNums)
  const filas: number[] = []

  if (ordenDesc !== null) {
    const logsOrdenados = [...despachoLog].sort((a: any, b: any) => {
      const ta = a.despachadoEl ? new Date(a.despachadoEl).getTime() : 0
      const tb = b.despachadoEl ? new Date(b.despachadoEl).getTime() : 0
      return ordenDesc === 'asc' ? ta - tb : tb - ta
    })
    logsOrdenados.forEach((l: any) => { const n = parseInt(l.numeroFactura); if (!isNaN(n)) filas.push(n) })
  } else {
    for (let n = rangeMax; n >= rangeMin; n--) filas.push(n)
  }

  const gridItems = filas.map(n => {
    const log = logMap.get(String(n))
    if (!log) {
      if (hayFiltro || ordenDesc !== null) return null
      return (
        <div key={n} className="bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center px-4 py-3">
          <span className="text-white/40 font-mono text-xs">F_{n}</span>
        </div>
      )
    }

    // Filtros
    if (busqueda) {
      const q = busqueda.toLowerCase()
      const match = (log.clienteNombre || '').toLowerCase().includes(q) ||
        (log.numeroFactura || '').toString().includes(q) ||
        (log.ciudad || '').toLowerCase().includes(q) ||
        (log.guiaTransporte || '').toLowerCase().includes(q)
      if (!match) return null
    }
    if (envioFiltro !== 'todos') {
      const esLocal = ciudadLocal && log.ciudad &&
        log.ciudad.split('/').pop()?.trim().toLowerCase() === ciudadLocal?.trim().toLowerCase()
      if (envioFiltro === 'local' && !esLocal) return null
      if (envioFiltro === 'guia' && esLocal) return null
    }
    if (fechaFiltro) {
      if (!log.despachadoEl) return null
      const d = new Date(log.despachadoEl)
      const bogota = new Date(d.getTime() - 5 * 60 * 60 * 1000)
      const yy = bogota.getUTCFullYear()
      const mm = String(bogota.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(bogota.getUTCDate()).padStart(2, '0')
      if (`${yy}-${mm}-${dd}` !== fechaFiltro) return null
    }
    if (ciudadFiltro && (log.ciudad?.trim() || '') !== ciudadFiltro) return null
    if (iconEstadoFiltro) {
      const last = (log.trRawEstados as any[])?.at(-1)
      const icono = log.modo === 'transportadora'
        ? (log.trRawEstados?.length ? iconoTransprensa(last?.estado_nombre ?? '') : log.num_cajas === 0 ? '⚪' : '🚛')
        : log.entregadoEl ? '✅' : '🚛'
      if (iconEstadoFiltro === 'BARCODE') {
        if (log.modo !== 'transportadora' || !!log.guiaTransporte || !!(log as any).guiaBuscadaEl || !(log.num_cajas > 0)) return null
      } else if (iconEstadoFiltro === '❓') {
        if (!(log as any).guiaBuscadaEl || !!log.guiaTransporte) return null
      } else if (icono !== iconEstadoFiltro) return null
    }

    const fotos2: string[] = (log.fotosAlistamiento as string[] | null) || (log.fotoAlistamiento ? [log.fotoAlistamiento] : [])
    const ciudad2 = log.ciudad?.split('/').pop()?.trim() || null
    const isExpLog = expanded[log.id] || false
    const cajasLog = cajasEdit[log.id] ?? log.num_cajas ?? 0
    const guiaLog = editTransporte[log.id]?.guia ?? log.guiaTransporte ?? ''

    return (
      <div key={n} className={`bg-zinc-900 border-t border-r border-b border-zinc-800 border-l-4 ${log.entregadoEl ? 'border-l-emerald-600' : log.modo === 'repartidor' ? 'border-l-cyan-400' : 'border-l-orange-400'} rounded-2xl overflow-hidden`}>
        <div className="px-3 py-3 flex items-start gap-2 cursor-pointer"
          onClick={() => onToggleExpanded(log.id)}>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5 overflow-hidden">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="text-white font-mono text-xs flex-shrink-0">F_{log.numeroFactura}</span>
              <span className="text-zinc-700 flex-shrink-0">·</span>
              <span className="text-white font-semibold text-xs truncate flex-1">{log.clienteNombre}</span>
              {ciudad2 && <span className="text-zinc-400 text-xs flex-shrink-0">{ciudad2}</span>}
            </div>
            {log.direccion && <span className="text-zinc-500 text-xs truncate block">{log.direccion}</span>}
          </div>
          <span className="text-xs mt-0.5 flex-shrink-0">
            {isExpLog ? '▲' : log.modo === 'transportadora' ? (
              log.trRawEstados?.length ? iconoTransprensa((log.trRawEstados as any[]).at(-1)?.estado_nombre ?? '') :
              log.num_cajas === 0 ? '⚪' :
              log.guiaTransporte ? '🚛' : (log as any).guiaBuscadaEl ? '❓' :
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-zinc-400">
                <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                <rect x="22" y="4" width="1" height="16"/>
              </svg>
            ) : log.entregadoEl ? '✅' : log.modo === 'personal' ? '🤝' : log.modo === 'repartidor' ? '🚚' : (
              <span className="relative inline-flex">
                🚛{log.guiaTransporte && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-zinc-900" />}
              </span>
            )}
          </span>
        </div>

        {isExpLog && (
          <div className="px-3 pb-3 space-y-0.5 border-t border-zinc-800/40 pt-2">
            {[
              { icon: '📋', label: 'Orden',     fecha: log.fechaOrden,   quien: log.vendedorNombre ? log.vendedorNombre.split(' ')[0].charAt(0).toUpperCase() + log.vendedorNombre.split(' ')[0].slice(1).toLowerCase() : null },
              { icon: '🧾', label: 'Facturado', fecha: log.fechaFactura, quien: 'Admin' },
              { icon: '📦', label: 'Alistado',  fecha: log.alistadoEl,  quien: log.alistadoPor?.nombre || null,
                accion: fotos2.length > 0 ? () => onAbrirGaleria(fotos2, log.alistadoEl) : null },
              ...(log.modo === 'personal' ? [] : [{
                icon: log.modo === 'repartidor' ? '🚚' : '🚛',
                label: log.modo === 'repartidor' ? 'Despacho' : 'Transporte',
                fecha: log.despachadoEl,
                quien: log.num_cajas > 0 ? `${log.num_cajas} caja${log.num_cajas > 1 ? 's' : ''}` : null,
                quienColor: 'white', esDespacho: false, esStepDespacho: true, observacion: log.observacion,
              }]),
              ...(log.modo === 'transportadora' && log.trRawEstados?.length
                ? [{ icon: iconoTransprensa((log.trRawEstados as any[]).at(-1)?.estado_nombre ?? ''), label: 'Entregado',
                    fecha: (() => { const last = (log.trRawEstados as any[]).at(-1); if (!last?.estado_fecha) return null; const hora = last.estado_hora || '00:00:00'; return new Date(`${last.estado_fecha}T${hora}-05:00`) })(),
                    quien: (log.trRawEstados as any[]).at(-1)?.estado_nombre ?? null, esTransprensa: true, imagenCumplido: log.trImagenCumplido ?? null }]
                : [{ icon: log.modo === 'transportadora' ? (log.trRawEstados?.length ? iconoTransprensa((log.trRawEstados as any[]).at(-1)?.estado_nombre ?? '') : log.num_cajas === 0 ? '⚪' : '🚛') : '✅',
                    label: 'Entregado', fecha: log.modo === 'transportadora' ? null : log.entregadoEl,
                    quien: log.modo === 'transportadora' ? null : log.modo === 'repartidor' ? (log.repartidor?.nombre || log.despachadoPorNombre || null) : (log.despachadoPorNombre || null),
                    firmaEntrega: log.modo === 'transportadora' ? null : (log.firmaEntrega || null) }]
              ),
            ].map((e: any, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className="text-base flex-shrink-0">{e.icon}</span>
                <span className="text-zinc-400 text-xs w-[60px] flex-shrink-0">{e.label}</span>
                <span className="text-white text-xs flex-shrink-0">{e.fecha ? formatFechaCorta(e.fecha) : '—'}</span>
                {e.quien && (
                  e.quienColor === 'white'
                    ? <span className="text-white text-xs ml-auto text-center flex-shrink-0 w-14">{e.quien}</span>
                    : e.esDespacho
                    ? <span className="text-xs truncate flex-1">
                        {e.quien.split(' · ').map((part: string, pi: number) => (
                          <span key={pi} className={pi === 0 ? 'text-zinc-500' : 'text-white'}>{pi > 0 ? ' · ' : ''}{part}</span>
                        ))}
                      </span>
                    : <span className="text-zinc-500 text-xs truncate flex-1">{e.quien}</span>
                )}
                {e.accion && <button onClick={(ev) => { ev.stopPropagation(); e.accion() }} className="text-zinc-400 hover:text-white text-xs">🖼️</button>}
                {e.firmaEntrega && (
                  <button onClick={() => onAbrirGaleria([e.firmaEntrega], null, true)}
                    className="text-zinc-400 hover:text-white text-sm flex-shrink-0 ml-auto">📸</button>
                )}
                {e.imagenCumplido && (
                  <button onClick={() => window.open(e.imagenCumplido, '_blank')}
                    className="text-zinc-400 hover:text-white text-base flex-shrink-0 ml-auto">📝</button>
                )}
                {!e.firmaEntrega && e.observacion && (
                  <button onClick={() => onSetObsPopupLog(obsPopupLog === log.id ? null : log.id)}
                    className={`text-base flex-shrink-0 ${obsPopupLog === log.id ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>✍🏼</button>
                )}
                {e.esDespacho && !e.firmaEntrega && (log.modo === 'transportadora' || !!log.guiaTransporte) && (
                  <button onClick={() => onSetGuiaPopup(guiaPopup === log.id ? null : log.id)}
                    className="flex-shrink-0 relative text-zinc-500 hover:text-white">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                      <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                      <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                      <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                      <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                      <rect x="22" y="4" width="1" height="16"/>
                    </svg>
                    {(log.guiaTransporte || guiaLog) && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-zinc-900" />
                    )}
                  </button>
                )}
              </div>
            ))}

            {obsPopupLog === log.id && log.observacion && (
              <div className="flex gap-1.5 items-center mt-2 pt-2 border-t border-zinc-800/40">
                <span className="text-base flex-shrink-0">✍🏼</span>
                <p className="flex-1 text-white text-xs bg-blue-950/30 border border-blue-500/20 rounded-xl px-3 py-2">{log.observacion}</p>
              </div>
            )}

            {guiaPopup === log.id && (
              <div className="flex gap-1.5 items-center mt-2 pt-2 border-t border-zinc-800/40">
                {log.guiaTransporte && guiaEditando !== log.id ? (
                  <>
                    <span className="flex-1 text-white text-xs font-mono bg-zinc-800 border border-orange-500/30 rounded-xl px-3 py-2">{guiaLog || log.guiaTransporte}</span>
                    <button onClick={() => onSetGuiaEditando(log.id)}
                      className="w-9 h-9 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-zinc-300 rounded-xl flex items-center justify-center flex-shrink-0 text-xs">✏️</button>
                  </>
                ) : (
                  <>
                    <input autoFocus type="text" placeholder="Número de guía..."
                      value={guiaLog}
                      onChange={e => onSetEditTransporte(log.id, { ...editTransporte[log.id], guia: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') onSetGuiaEditando(null) }}
                      className="flex-1 bg-orange-950/30 border border-orange-500/30 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:border-orange-400" />
                    <button title="Escanear" onClick={() => { onSetEscanerOrdenId(log.ordenId || log.id); onSetEscanerLogId(log.id) }}
                      className="w-9 h-9 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                        <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                        <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                        <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                        <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                        <rect x="22" y="4" width="1" height="16"/>
                      </svg>
                    </button>
                    <button
                      onClick={async (ev) => {
                        ev.stopPropagation()
                        const oid = log.ordenId || log.id
                        const res = await fetch(`/api/bodega/despachos/${oid}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ guiaTransporte: guiaLog || null }),
                        })
                        await res.json()
                        onSetGuiaEditando(null)
                        onSetGuiaPopup(null)
                        onSetEditTransporte(log.id, { ...editTransporte[log.id], guia: '' })
                        onCargarDespachoLog(true)
                      }}
                      disabled={!guiaLog.trim()}
                      className="w-9 h-9 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                      💾
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  })

  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 space-y-1">{gridItems}</div>
}
