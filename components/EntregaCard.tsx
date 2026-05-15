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

function fechaCorta(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function EntregaCard({
  cliente, numeroFactura, empresaOrigen, alistadoPor,
  asignadoEn, rezago, entregado, onEntregar, turnoActivo
}: EntregaCardProps) {
  const lat = cliente.lat || cliente.latTmp
  const lng = cliente.lng || cliente.lngTmp
  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null

  return (
    <div className={`px-4 py-3 space-y-2 ${
      entregado ? 'opacity-40' : rezago ? 'border-l-2 border-amber-500 bg-amber-500/5' : ''
    }`}>

      {/* L1 — nombre */}
      <p className={`text-base font-bold leading-snug ${
        entregado ? 'line-through text-zinc-500' : rezago ? 'text-amber-200' : 'text-white'
      }`}>
        {cliente.nombre}
        {rezago && !entregado && (
          <span className="ml-2 text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded align-middle">
            rezago
          </span>
        )}
      </p>

      {/* L2 — dirección */}
      {cliente.direccion && (
        <p className="text-sm text-zinc-400 leading-snug">
          {cliente.direccion}{cliente.ciudad ? `, ${cliente.ciudad}` : ''}
        </p>
      )}

      {/* L3 — factura + empresa + quién alistó */}
      {(numeroFactura || empresaOrigen || alistadoPor) && (
        <div className="flex items-center gap-2 flex-wrap">
          {numeroFactura && (
            <span className="text-sm font-bold text-zinc-200">#{numeroFactura}</span>
          )}
          {empresaOrigen && (
            <span className="text-xs font-semibold text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-md">
              {empresaOrigen}
            </span>
          )}
          {alistadoPor && (
            <span className="text-xs text-zinc-500">por {alistadoPor}</span>
          )}
          {asignadoEn && (
            <span className="text-xs text-zinc-600">{fechaCorta(asignadoEn)}</span>
          )}
        </div>
      )}

      {/* L4 — acciones */}
      <div className="flex items-center gap-2 pt-0.5">
        {!entregado && turnoActivo && onEntregar && (
          <button onClick={onEntregar}
            className={`flex items-center justify-center w-9 h-9 rounded-xl text-white text-base flex-shrink-0 ${
              rezago ? 'bg-amber-500 hover:bg-amber-400' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}>
            ✓
          </button>
        )}
        {entregado && (
          <span className="w-9 h-9 flex items-center justify-center text-emerald-400 text-base flex-shrink-0">✓</span>
        )}
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-base transition-colors flex-shrink-0">
            ↗
          </a>
        )}
        {cliente.telefono && (
          <a href={`tel:${cliente.telefono}`}
            onClick={e => e.stopPropagation()}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-base transition-colors flex-shrink-0">
            📞
          </a>
        )}
      </div>

    </div>
  )
}
