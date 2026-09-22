'use client'
import FotoEntrega from '@/components/FotoEntrega'
import { BORDER } from '../_lib/tipos'
import { formatFechaCorta, iconoTransprensa } from '../_lib/utils'

interface Props {
  d: any
  ciudadLocal: string | null
  modoSeleccion: boolean
  seleccionados: string[]
  modoEnvio: Record<string, string>
  saving: Record<string, boolean>
  expanded: Record<string, boolean>
  cajasEdit: Record<string, number>
  obsEdit: Record<string, string>
  obsPopup: string | null
  firmaData: Record<string, string>
  editTransporte: Record<string, { transportadora: string; guia: string }>
  guiaPopup: string | null
  repartidores: any[]
  editRepartidor: Record<string, string>
  longPressTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  // callbacks
  onToggleSelect: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  onTouchStart: (id: string) => void
  onTouchEnd: () => void
  onToggleExpanded: (id: string) => void
  onSetModoEnvio: (id: string, v: string) => void
  onSetObsEdit: (id: string, v: string) => void
  onSetObsPopup: (v: string | null) => void
  onSetFirmaData: (id: string, v: string | null) => void
  onSetEditTransporte: (id: string, v: { transportadora: string; guia: string }) => void
  onSetCajasEdit: (id: string, v: number) => void
  onSetGuiaPopup: (v: string | null) => void
  onSetEscanerOrdenId: (id: string) => void
  onSetEditRepartidor: (id: string, v: string) => void
  onAbrirCamara: (id: string) => void
  onRetomar: (id: string, fotos: string[]) => void
  onAbrirGaleria: (keys: string[], fecha?: string | null, esFirma?: boolean) => void
  onPatchOrden: (id: string, body: Record<string, unknown>) => Promise<void>
  onMarcarAlistado: (id: string) => Promise<void>
  onAsignarRepartidor: (id: string) => Promise<void>
  onGuardarTransporte: (id: string) => Promise<void>
  onSetModalObsTexto: (v: string | null) => void
}

export default function OrdenCard({ d, ciudadLocal, modoSeleccion, seleccionados, modoEnvio,
  saving, expanded, cajasEdit, obsEdit, obsPopup, firmaData, editTransporte, guiaPopup,
  repartidores, editRepartidor, longPressTimer,
  onToggleSelect, onContextMenu, onTouchStart, onTouchEnd, onToggleExpanded,
  onSetModoEnvio, onSetObsEdit, onSetObsPopup, onSetFirmaData, onSetEditTransporte,
  onSetCajasEdit, onSetGuiaPopup, onSetEscanerOrdenId, onSetEditRepartidor,
  onAbrirCamara, onRetomar, onAbrirGaleria, onPatchOrden, onMarcarAlistado,
  onAsignarRepartidor, onGuardarTransporte, onSetModalObsTexto,
}: Props) {
  const ciudadRaw = d.ciudad || null
  const ciudadNombre = ciudadRaw
    ? ciudadRaw.split('/').pop()?.trim().replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? ciudadRaw
    : null
  const border = BORDER[d.estado] ?? BORDER.pendiente
  const isSaving = saving[d.id]
  const isExpanded = expanded[d.id]
  const esLocalidad = ciudadLocal && d.ciudad &&
    d.ciudad.split('/').pop()?.trim().toLowerCase() === ciudadLocal.trim().toLowerCase()
  const horaOrden = d.fechaFactura
    ? formatFechaCorta(d.fechaFactura)
    : d.fechaOrden ? formatFechaCorta(d.fechaOrden) : formatFechaCorta(d.createdAt)
  const fotos: string[] = (d.fotosAlistamiento as string[] | null) || (d.fotoAlistamiento ? [d.fotoAlistamiento] : [])
  const tieneFotos = fotos.length > 0

  const esLocalEnvio = (ord: any) => {
    const cm = ord.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''
    return ciudadLocal ? cm === ciudadLocal.trim().toLowerCase() : false
  }
  const modoActual = (ord: any) => modoEnvio[ord.id] ?? (esLocalEnvio(ord) ? 'local' : 'transportadora')

  const btnFoto = (
    <button
      onClick={tieneFotos ? () => onAbrirGaleria(fotos, d.alistadoEl) : undefined}
      disabled={!tieneFotos}
      className="w-8 flex items-center gap-0.5 text-zinc-400 hover:text-white text-xs disabled:opacity-30 disabled:cursor-default flex-shrink-0">
      📷{fotos.length > 1 ? <span className="text-[10px] font-semibold">{fotos.length}</span> : null}
    </button>
  )

  const esCandidatoSeleccion = d.estado === 'alistado' &&
    (ciudadLocal ? (d.ciudad?.split('/').pop()?.trim().toLowerCase() ?? '') === ciudadLocal.trim().toLowerCase() : true)

  return (
    <div
      className={`bg-zinc-900 border-t border-r border-b border-zinc-800 border-l-4 ${border} rounded-2xl overflow-hidden
        ${modoSeleccion && esCandidatoSeleccion ? 'cursor-pointer' : ''}
        ${modoSeleccion && d.estado === 'alistado' && !esCandidatoSeleccion ? 'opacity-40 cursor-not-allowed' : ''}
        ${modoSeleccion && seleccionados.includes(d.id) ? 'ring-2 ring-blue-500' : ''}`}
      onContextMenu={esCandidatoSeleccion ? (e) => onContextMenu(e, d.id) : undefined}
      onTouchStart={esCandidatoSeleccion ? () => onTouchStart(d.id) : undefined}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchEnd}
      onClick={modoSeleccion && esCandidatoSeleccion ? () => onToggleSelect(d.id) : undefined}>

      {/* Header */}
      <div
        className={`px-3 py-3 flex items-center gap-2 ${d.estado === 'alistado' ? 'cursor-pointer select-none' : ''}`}
        onClick={d.estado === 'alistado' ? () => onToggleExpanded(d.id) : undefined}>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 overflow-hidden">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="text-white font-mono text-xs flex-shrink-0">F_{d.numeroFactura || d.numeroOrden}</span>
            <span className="text-zinc-700 flex-shrink-0">·</span>
            <span className="text-white font-semibold text-xs truncate flex-1">{d.clienteNombre}</span>
            {ciudadNombre && <span className="text-zinc-400 text-xs flex-shrink-0 ml-1">{ciudadNombre}</span>}
          </div>
          {d.direccion && <span className="text-zinc-500 text-xs truncate block">{d.direccion}</span>}
        </div>
      </div>

      {/* Pendiente */}
      {d.estado === 'pendiente' && (
        <div className="px-3 pb-3 pt-1 flex items-center gap-2 border-t border-zinc-800/60">
          <span className="text-white text-xs flex-shrink-0">{horaOrden}</span>
          {tieneFotos && d.estado === 'pendiente' ? (
            <button
              onClick={() => onRetomar(d.id, fotos)}
              disabled={isSaving}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
              🔄 Retomar <span className="bg-amber-800 rounded px-1">{fotos.length}</span>
            </button>
          ) : tieneFotos ? btnFoto : (
            <button
              onClick={() => onAbrirCamara(d.id)}
              disabled={isSaving}
              className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
              📷 Foto
            </button>
          )}
        </div>
      )}

      {/* Alistado */}
      {d.estado === 'alistado' && (
        <div className="px-3 pb-1.5 pt-1 border-t border-zinc-800/60">
          {(() => {
            const esLocalB = esLocalEnvio(d)
            const modoB = modoActual(d)
            const opcionesB = esLocalB
              ? [{ v: 'local', label: '🚚 Local' }, { v: 'transportadora', label: '📦 Guía' }, { v: 'personal', label: '🤝 Personal' }]
              : [{ v: 'transportadora', label: '📦 Guía' }, { v: 'personal', label: '🤝 Personal' }]
            return (
              <div className="flex items-center gap-2 mt-1">
                {btnFoto}
                {d.alistadoEl && <span className="text-zinc-400 text-xs flex-1">{formatFechaCorta(d.alistadoEl)}</span>}
                <div className="relative ml-auto">
                  <select
                    value={modoB}
                    onChange={e => {
                      onSetModoEnvio(d.id, e.target.value)
                      if (!isExpanded) onToggleExpanded(d.id)
                    }}
                    className="appearance-none bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl pl-3 pr-7 py-1.5 outline-none cursor-pointer"
                    style={{ WebkitAppearance: 'none' }}>
                    {opcionesB.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">▼</span>
                </div>
              </div>
            )
          })()}

          {isExpanded && (
            <div className="mt-2 space-y-3">
              {/* Local */}
              {modoActual(d) === 'local' && (() => {
                const esL = esLocalEnvio(d)
                if (esL && repartidores.length === 1 && !editRepartidor[d.id]) {
                  setTimeout(() => onSetEditRepartidor(d.id, repartidores[0].id), 0)
                }
                if (!esL) {
                  const cajas = cajasEdit[d.id] ?? d.num_cajas ?? 0
                  return (
                    <div className="flex items-center gap-2">
                      <button onClick={() => onSetCajasEdit(d.id, Math.max(0, (cajasEdit[d.id] ?? d.num_cajas ?? 0) - 1))}
                        className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700">−</button>
                      <span className="text-white text-xs font-semibold min-w-[52px] text-center">{cajas} {cajas === 1 ? 'caja' : 'cajas'}</span>
                      <button onClick={async () => { const n = (cajasEdit[d.id] ?? d.num_cajas ?? 0) + 1; onSetCajasEdit(d.id, n); await onPatchOrden(d.id, { num_cajas: n }) }}
                        className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700">+</button>
                    </div>
                  )
                }
                return (
                  <div className="space-y-1.5">
                    <div className="flex gap-2 items-center">
                      <select
                        value={editRepartidor[d.id] ?? ''}
                        onChange={e => onSetEditRepartidor(d.id, e.target.value)}
                        className="flex-1 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-500"
                        style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
                        <option value="">— Repartidor —</option>
                        {repartidores.map((r: any) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                      <button
                        onClick={() => onAsignarRepartidor(d.id)}
                        disabled={isSaving || (!editRepartidor[d.id] && !obsEdit[d.id])}
                        className="h-9 px-3 rounded-xl border border-blue-700 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-xs font-semibold flex-shrink-0 flex items-center justify-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed">
                        {isSaving ? '...' : '🚀 Enviar'}
                      </button>
                    </div>
                    <textarea rows={2} placeholder="Observación (opcional)..."
                      value={obsEdit[d.id] ?? ''}
                      onChange={e => onSetObsEdit(d.id, e.target.value)}
                      className="w-full bg-blue-950/40 border border-blue-500/30 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-400 resize-none" />
                  </div>
                )
              })()}

              {/* Guía transportadora */}
              {modoActual(d) === 'transportadora' && (() => {
                const cajas = cajasEdit[d.id] ?? 0
                const guia = editTransporte[d.id]?.guia ?? ''
                const puedeEnv = cajas > 0
                return (
                  <div className="space-y-1.5 pb-2">
                    <div className="flex gap-1.5 items-center">
                      <button onClick={() => onSetCajasEdit(d.id, Math.max(0, (cajasEdit[d.id] ?? 0) - 1))}
                        disabled={cajas === 0}
                        className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700 disabled:opacity-30 flex-shrink-0">−</button>
                      <span className="text-white text-sm flex-shrink-0 min-w-[20px] text-center">
                        <span className="text-base">{cajas === 0 ? '📦' : `${cajas}c`}</span>
                      </span>
                      <button onClick={async () => { const n = (cajasEdit[d.id] ?? 0) + 1; onSetCajasEdit(d.id, n); await onPatchOrden(d.id, { num_cajas: n }) }}
                        className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700 flex-shrink-0">+</button>
                      <span className="flex-1" />
                      <button onClick={() => onSetObsPopup(obsPopup === d.id ? null : d.id)}
                        className={`h-9 px-3 rounded-xl border text-xs font-semibold transition-colors flex-shrink-0 flex items-center justify-center ${obsEdit[d.id] || guia ? 'border-blue-500 text-blue-300 bg-blue-950/30' : 'border-zinc-700 text-zinc-400 bg-zinc-800 hover:bg-zinc-700'}`}>
                        🔻 Opciones
                      </button>
                      <span className="flex-1" />
                      <button onClick={() => onGuardarTransporte(d.id)}
                        disabled={isSaving || (!puedeEnv && !obsEdit[d.id])}
                        className="h-9 px-2.5 rounded-xl border border-amber-600 bg-amber-900/40 hover:bg-amber-800/60 text-amber-300 text-xs font-semibold flex-shrink-0 flex items-center justify-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap">
                        📦 Enviar
                      </button>
                    </div>
                    {obsPopup === d.id && (
                      <div className="flex gap-1.5 items-center mt-1">
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">✍🏼</span>
                          <input autoFocus type="text" maxLength={120} placeholder="Observación..."
                            value={obsEdit[d.id] ?? ''}
                            onChange={e => onSetObsEdit(d.id, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') onSetObsPopup(null) }}
                            className="w-full bg-blue-950/40 border border-blue-500/30 rounded-xl pl-8 pr-3 py-2 text-white text-xs outline-none focus:border-blue-400" />
                        </div>
                        {guia ? (
                          <span
                            className="text-white text-xs font-mono px-2 py-2 bg-zinc-800 border border-amber-500/40 rounded-xl cursor-pointer flex-shrink-0"
                            onClick={() => onSetEditTransporte(d.id, { ...editTransporte[d.id], guia: '' })}>
                            {guia} ✕
                          </span>
                        ) : (
                          <button title="Escanear guía" onClick={() => onSetEscanerOrdenId(d.id)}
                            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                              <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                              <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                              <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                              <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                              <rect x="22" y="4" width="1" height="16"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Personal */}
              {modoActual(d) === 'personal' && (
                <div className="space-y-1.5 pb-2">
                  <div className="flex gap-1.5 items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">✍🏼</span>
                      <input type="text" maxLength={120} placeholder="Observación..."
                        value={obsEdit[d.id] ?? ''}
                        onChange={e => onSetObsEdit(d.id, e.target.value)}
                        className="w-full bg-blue-950/40 border border-blue-500/30 rounded-xl pl-8 pr-3 py-2 text-white text-xs outline-none focus:border-blue-400" />
                    </div>
                    {firmaData[d.id] ? (
                      <button onClick={() => onSetObsPopup(`firma-${d.id}`)}
                        className="h-9 w-9 rounded-xl border border-emerald-600/50 overflow-hidden flex-shrink-0 relative">
                        <img src={firmaData[d.id]} className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <button onClick={() => onSetObsPopup(`firma-${d.id}`)}
                        className="h-9 px-3 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex-shrink-0 flex items-center justify-center gap-1">
                        📸 Foto
                      </button>
                    )}
                    <button
                      disabled={isSaving || (!firmaData[d.id] && !obsEdit[d.id]?.trim())}
                      onClick={async () => {
                        await onPatchOrden(d.id, {
                          estado: 'entregado',
                          entregadoEl: new Date().toISOString(),
                          firmaBase64: firmaData[d.id] || null,
                          observacion: obsEdit[d.id] || null,
                        })
                      }}
                      className="h-9 px-3 rounded-xl border border-emerald-700 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 text-xs font-semibold flex-shrink-0 flex items-center justify-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed">
                      🤝 Enviar
                    </button>
                  </div>
                  {obsPopup === `firma-${d.id}` && (
                    <FotoEntrega
                      autoOpen
                      foto={firmaData[d.id] || null}
                      onFoto={(dataUrl) => {
                        if (dataUrl) { onSetFirmaData(d.id, dataUrl) }
                        else { onSetFirmaData(d.id, null as any) }
                        onSetObsPopup(null)
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* En entrega / En tránsito */}
      {(d.estado === 'en_entrega' || d.estado === 'en_transito') && (() => {
        const isExpD = expanded[d.id] || false
        const cajas = cajasEdit[d.id] ?? d.num_cajas ?? 0
        const guia = editTransporte[d.id]?.guia ?? d.guiaTransporte ?? ''
        const despachadoEl = d.despachadoEl ?? d.alistadoEl
        return (
          <div className="border-t border-zinc-800/60">
            <div className="px-4 py-1.5 flex items-center gap-2 cursor-pointer select-none"
              onClick={() => onToggleExpanded(d.id)}>
              <span className="text-zinc-500 text-xs">🚚</span>
              <span className="text-zinc-400 text-xs flex-1">
                {d.guiaTransporte ? '#' + d.guiaTransporte : formatFechaCorta(despachadoEl)}
                {d.num_cajas > 0 && <span className="ml-2 text-zinc-500">{d.num_cajas} caja{d.num_cajas > 1 ? 's' : ''}</span>}
              </span>
              <span className="text-zinc-500 text-xs">{isExpD ? '▲' : '▼'}</span>
            </div>
            {isExpD && (
              <div className="px-3 pb-3 space-y-0.5 border-t border-zinc-800/40 pt-2">
                {[
                  { icon: '📋', label: 'Orden',     fecha: d.fechaOrden,   quien: null },
                  { icon: '🧾', label: 'Facturado', fecha: d.fechaFactura, quien: null },
                  { icon: '📦', label: 'Alistado',  fecha: d.alistadoEl,  quien: d.alistadoPor?.nombre || null },
                  ...(!d.guiaTransporte && !d.repartidorId && d.estado === 'entregado' ? [] : [{
                    icon: d.guiaTransporte ? '🚛' : '🚚',
                    label: d.guiaTransporte ? 'Transporte' : 'Despacho',
                    fecha: despachadoEl,
                    quien: d.num_cajas > 0 ? `${d.num_cajas} caja${d.num_cajas > 1 ? 's' : ''}` : null,
                    quienColor: 'white', esStepDespacho: true,
                    firmaEntrega: d.firmaEntrega, observacion: d.observacion,
                    alistadoPorNombre: d.alistadoPor?.nombre,
                  }]),
                  {
                    icon: d.guiaTransporte
                      ? (d.num_cajas ? (d.trRawEstados?.length ? iconoTransprensa((d.trRawEstados as any[]).at(-1)?.estado_nombre ?? '') : '🚛') : '⚪')
                      : '✅',
                    label: 'Entregado', fecha: d.entregadoEl, quien: null,
                  },
                ].map((e: any, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className="text-base flex-shrink-0">{e.icon}</span>
                    <span className="text-zinc-400 text-xs w-[60px] flex-shrink-0">{e.label}</span>
                    <span className="text-white text-xs flex-shrink-0">{e.fecha ? formatFechaCorta(e.fecha) : '—'}</span>
                    {e.quien && (
                      e.quienColor === 'white'
                        ? <span className="text-white text-xs ml-auto text-center flex-shrink-0 w-14">{e.quien}</span>
                        : <span className="text-zinc-500 text-xs truncate flex-1">{e.quien}</span>
                    )}
                    {e.firmaEntrega && (
                      <button onClick={() => onAbrirGaleria([e.firmaEntrega], null, true)}
                        className="text-zinc-400 hover:text-white text-base flex-shrink-0">📸</button>
                    )}
                    {!e.firmaEntrega && e.observacion && (
                      <button onClick={() => onSetModalObsTexto(e.observacion)}
                        className="text-zinc-400 hover:text-white text-base flex-shrink-0">📝</button>
                    )}
                  </div>
                ))}
                {/* Guía + cajas editables */}
                <div className="flex gap-1.5 items-center mt-2 pt-2 border-t border-zinc-800/40">
                  <button onClick={() => onSetCajasEdit(d.id, Math.max(0, (cajasEdit[d.id] ?? d.num_cajas ?? 0) - 1))}
                    className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700 flex-shrink-0">−</button>
                  <span className="text-white text-sm flex-shrink-0 min-w-[24px] text-center">
                    {cajas === 0 ? '📦' : `${cajas}c`}
                  </span>
                  <button onClick={async () => { const n = (cajasEdit[d.id] ?? d.num_cajas ?? 0) + 1; onSetCajasEdit(d.id, n); await onPatchOrden(d.id, { num_cajas: n }) }}
                    className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-base font-bold flex items-center justify-center hover:bg-zinc-700 flex-shrink-0">+</button>
                  <button onClick={() => onSetGuiaPopup(guiaPopup === d.id ? null : d.id)}
                    className={`flex-1 min-w-0 py-2 rounded-xl flex items-center justify-center gap-2 border text-xs ${guia ? 'bg-zinc-800 border-orange-500/40 text-orange-300' : 'bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-white'}`}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0">
                      <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
                      <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
                      <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
                      <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
                      <rect x="22" y="4" width="1" height="16"/>
                    </svg>
                    <span className="font-mono truncate">{guia || 'Guía'}</span>
                  </button>
                </div>
                {guiaPopup === d.id && (
                  <div className="flex gap-1.5 items-center mt-2">
                    <input autoFocus type="text" placeholder="Número de guía..."
                      value={guia}
                      onChange={e => onSetEditTransporte(d.id, { ...editTransporte[d.id], guia: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') onSetGuiaPopup(null) }}
                      className="flex-1 bg-orange-950/30 border border-orange-500/30 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:border-orange-400" />
                    <button title="Escanear" onClick={() => onSetEscanerOrdenId(d.id)}
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
                      onClick={async () => {
                        await onPatchOrden(d.id, { guiaTransporte: guia || null, num_cajas: cajas })
                        onSetEditTransporte(d.id, { ...editTransporte[d.id], guia: '' })
                        onSetGuiaPopup(null)
                      }}
                      disabled={isSaving || guia === (d.guiaTransporte ?? '')}
                      className="w-9 h-9 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                      💾
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Entregado */}
      {d.estado === 'entregado' && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800/60 mt-1">
          <div className="flex items-center gap-3">
            <span className="text-emerald-500 text-xs font-semibold">✅ Entregado {formatFechaCorta(d.entregadoEl)}</span>
            {tieneFotos && (
              <button onClick={() => onAbrirGaleria(fotos, d.entregadoEl)}
                className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs">
                🖼️ {fotos.length > 1 ? fotos.length : ''}
              </button>
            )}
            {d.firmaEntrega && (
              <button onClick={() => onAbrirGaleria([d.firmaEntrega], d.entregadoEl, true)}
                className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs">
                📸
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
