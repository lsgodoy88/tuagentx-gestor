'use client'

interface EntregaCardProps {
  cliente: {
    nombre: string
    direccion?: string | null
    ciudad?: string | null
    telefono?: string | null
    lat?: number | null
    lng?: number | null
    latTmp?: number | null
    lngTmp?: number | null
  }
  numeroFactura?: string | null
  empresaOrigen?: string | null
  alistadoPor?: string | null
  asignadoEn?: string | null
  rezago?: boolean
  entregado?: boolean
  horaEntrega?: string | null
  onEntregar?: () => void
  turnoActivo?: boolean
  rutaActiva?: boolean
  observacion?: string | null
}

export default function EntregaCard({
  cliente, numeroFactura, empresaOrigen,
  rezago, entregado, horaEntrega, onEntregar, turnoActivo, rutaActiva, observacion
}: EntregaCardProps) {
  const tieneGpsReal = !!cliente.lat && !!cliente.lng
  const lat = cliente.lat || cliente.latTmp
  const lng = cliente.lng || cliente.lngTmp
  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null
  const notaBodega = empresaOrigen
    ? `Bodega/${empresaOrigen}${numeroFactura ? ` F_${numeroFactura}` : ''}`
    : numeroFactura ? `F_${numeroFactura}` : null

  return (
    <div className={`px-4 py-3 ${rezago && !entregado ? 'border-l-2 border-amber-500 bg-amber-500/5' : ''} ${rutaActiva && onEntregar && !entregado ? 'cursor-pointer active:opacity-80' : ''}`}
      onClick={rutaActiva && onEntregar && !entregado ? onEntregar : undefined}>

      {/* L1 — nombre + mapa */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="font-bold text-base leading-snug flex-1 flex items-center gap-1.5">
          {entregado && <span className="text-emerald-400 text-base">✓</span>}
          <span className={entregado ? "text-zinc-400" : "text-white"}>{cliente.nombre}</span>
          {rezago && !entregado && (
            <span className="ml-2 text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded align-middle">rezago</span>
          )}
        </p>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); if (mapsUrl) window.open(mapsUrl) }}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: mapsUrl ? 'rgba(5,150,105,0.15)' : 'rgba(113,113,122,0.10)',
              border: mapsUrl ? '1px solid rgba(5,150,105,0.3)' : '1px solid rgba(113,113,122,0.2)',
              cursor: mapsUrl ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}>🗺️</button>
          {tieneGpsReal && <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 13, height: 13, borderRadius: '50%',
            background: '#059669', border: '1px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, fontWeight: 900, color: '#fff', lineHeight: 1,
          }}>✓</span>}
        </div>
      </div>

      {/* L2 — dirección + hora entrega */}
      {cliente.direccion && (
        <p className="text-zinc-400 text-sm flex items-center gap-1.5 mb-1">
          <span className="flex-1 truncate uppercase">{cliente.direccion}</span>
          {entregado && horaEntrega && (
            <span className="text-emerald-400 text-xs font-semibold flex-shrink-0">{horaEntrega}</span>
          )}
        </p>
      )}

      {/* L3 — bodega + teléfono misma línea */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex-1 min-w-0">
          {notaBodega && (
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className={`text-sm flex items-center gap-1.5 min-w-0 ${entregado ? 'text-zinc-400' : 'text-white'}`}>
                <span className="truncate">{notaBodega}</span>
              </p>
              {cliente.telefono && (
                <a href={`tel:${cliente.telefono}`} onClick={e => e.stopPropagation()}
                  className={`text-sm flex items-center gap-1 flex-shrink-0 ${entregado ? 'text-zinc-400' : 'text-white'}`}>
                  <span className={`font-bold ${entregado ? 'text-zinc-500' : 'text-red-400'}`}>✆</span>{cliente.telefono}
                </a>
              )}
            </div>
          )}
          {/* L4 — observación */}
          {observacion && (
            <p className="text-zinc-400 text-xs mt-0.5 truncate">✍🏼 {observacion}</p>
          )}
        </div>

      </div>

    </div>
  )
}
