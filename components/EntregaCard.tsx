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
  onEntregar?: () => void
  turnoActivo?: boolean
}

export default function EntregaCard({
  cliente, numeroFactura, empresaOrigen,
  rezago, entregado, onEntregar, turnoActivo
}: EntregaCardProps) {
  const lat = cliente.lat || cliente.latTmp
  const lng = cliente.lng || cliente.lngTmp
  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null
  const notaBodega = empresaOrigen
    ? `Bodega/${empresaOrigen}${numeroFactura ? ` #${numeroFactura}` : ''}`
    : numeroFactura ? `#${numeroFactura}` : null

  return (
    <div className={`px-4 py-3 space-y-1.5 ${
      entregado ? 'opacity-40' : rezago ? 'border-l-2 border-amber-500 bg-amber-500/5' : ''
    }`}>

      {/* L1 — nombre + botón Entregar */}
      <div className="flex items-center justify-between gap-3">
        <p className={`font-bold text-sm leading-snug flex-1 ${
          entregado ? 'line-through text-zinc-500' : rezago ? 'text-amber-200' : 'text-white'
        }`}>
          {cliente.nombre}
          {rezago && !entregado && (
            <span className="ml-2 text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded align-middle">
              rezago
            </span>
          )}
        </p>
        {!entregado && turnoActivo && onEntregar && (
          <button onClick={onEntregar}
            className={`flex-shrink-0 text-white text-xs font-semibold px-4 py-1.5 rounded-lg ${
              rezago ? 'bg-amber-500 hover:bg-amber-400' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}>
            Entregar
          </button>
        )}
        {entregado && (
          <span className="text-emerald-400 text-xs flex-shrink-0 font-semibold">✓ Listo</span>
        )}
      </div>

      {/* L2 — dirección + Maps */}
      {cliente.direccion && (
        <p className="text-zinc-500 text-xs flex items-center gap-1.5">
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

      {/* L3 — bodega/factura */}
      {notaBodega && (
        <p className="text-zinc-400 text-xs flex items-center gap-1.5">
          <span>📦</span>
          <span>{notaBodega}</span>
        </p>
      )}

      {/* L4 — teléfono */}
      {cliente.telefono && (
        <p className="text-xs flex items-center gap-1.5">
          <span>📞</span>
          <a href={`tel:${cliente.telefono}`}
            onClick={e => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300">
            {cliente.telefono}
          </a>
        </p>
      )}

    </div>
  )
}
