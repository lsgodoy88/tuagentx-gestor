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
}

export default function EntregaCard({
  cliente, numeroFactura, empresaOrigen,
  rezago, entregado, horaEntrega, onEntregar, turnoActivo
}: EntregaCardProps) {
  const lat = cliente.lat || cliente.latTmp
  const lng = cliente.lng || cliente.lngTmp
  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null
  const notaBodega = empresaOrigen
    ? `Bodega/${empresaOrigen}${numeroFactura ? ` #${numeroFactura}` : ''}`
    : numeroFactura ? `#${numeroFactura}` : null

  return (
    <div className={`px-4 py-3 ${rezago && !entregado ? 'border-l-2 border-amber-500 bg-amber-500/5' : ''}`}>

      {/* L1 — nombre */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className={`font-bold text-base leading-snug flex-1 ${rezago ? 'text-white' : 'text-white'}`}>
          {cliente.nombre}
          {rezago && !entregado && (
            <span className="ml-2 text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded align-middle">rezago</span>
          )}
        </p>
      </div>

      {/* L2 — dirección */}
      {cliente.direccion && (
        <p className="text-white text-sm flex items-center gap-1.5 mb-1">
          <span>📍</span>
          <span className="flex-1 truncate uppercase">
            {cliente.direccion}{cliente.ciudad ? ` ${cliente.ciudad}` : ''}
          </span>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-emerald-400 font-semibold hover:text-emerald-300 flex-shrink-0">
              Maps
            </a>
          )}
        </p>
      )}

      {/* L3+L4 — bodega/teléfono + botón/check derecha */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          {notaBodega && (
            <p className="text-white text-sm flex items-center gap-1.5">
              <span>📦</span><span className="truncate">{notaBodega}</span>
            </p>
          )}
          {cliente.telefono && (
            <p className="text-sm flex items-center gap-1.5">
              <span>📞</span>
              <a href={`tel:${cliente.telefono}`} onClick={e => e.stopPropagation()} className="text-white">
                {cliente.telefono}
              </a>
            </p>
          )}
        </div>
        {entregado ? (
          <div className="flex flex-col items-center flex-shrink-0 gap-0.5">
            {horaEntrega && <span className="text-emerald-400 text-xs font-semibold">{horaEntrega}</span>}
          </div>
        ) : turnoActivo && onEntregar ? (
          <button onClick={onEntregar}
            className={`flex-shrink-0 text-white text-xs font-semibold px-4 py-1.5 rounded-lg ${rezago ? 'bg-amber-500 hover:bg-amber-400' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            Entregar
          </button>
        ) : null}
      </div>

    </div>
  )
}
