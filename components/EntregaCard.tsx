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
    <div className={`py-3 px-4 ${entregado ? 'opacity-40' : rezago ? 'bg-amber-500/5 border-l-2 border-amber-500' : ''}`}>

      {/* Línea 1 — nombre + botón */}
      <div className="flex items-center gap-2">
        <p className={`flex-1 text-sm font-semibold truncate ${entregado ? 'line-through text-zinc-500' : rezago ? 'text-amber-300' : 'text-white'}`}>
          {cliente.nombre}
          {rezago && !entregado && (
            <span className="ml-1.5 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
              pendiente
            </span>
          )}
        </p>
        {!entregado && turnoActivo && onEntregar && (
          <button onClick={onEntregar}
            className={`flex-shrink-0 text-white text-xs font-semibold px-3 py-1.5 rounded-lg ${rezago ? 'bg-amber-500 hover:bg-amber-400' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            Entregar
          </button>
        )}
        {entregado && <span className="text-emerald-400 text-xs flex-shrink-0">Listo</span>}
      </div>

      {/* Línea 2 — dirección + maps */}
      {cliente.direccion && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-zinc-500 text-xs truncate flex-1">
            {cliente.direccion}{cliente.ciudad ? `, ${cliente.ciudad}` : ''}
          </span>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 text-[11px] font-semibold text-zinc-400 border border-zinc-700 rounded-md px-1.5 py-0.5 hover:text-white hover:border-zinc-500 transition-colors"
              onClick={e => e.stopPropagation()}>
              ↗ Maps
            </a>
          )}
        </div>
      )}

      {/* Línea 3 — factura · empresa · quién alistó · fecha · llamar */}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {numeroFactura && (
          <span className="text-zinc-300 text-[11px] font-semibold">
            Fac. {numeroFactura}
          </span>
        )}
        {empresaOrigen && (
          <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
            {empresaOrigen}
          </span>
        )}
        {alistadoPor && (
          <span className="text-zinc-500 text-[10px]">
            por {alistadoPor}
          </span>
        )}
        {asignadoEn && (
          <span className="text-zinc-600 text-[10px]">
            {fechaCorta(asignadoEn)}
          </span>
        )}
        {cliente.telefono && (
          <a href={`tel:${cliente.telefono}`}
            className="ml-auto text-blue-400 text-[11px] hover:text-blue-300 flex-shrink-0"
            onClick={e => e.stopPropagation()}>
            Llamar
          </a>
        )}
      </div>

    </div>
  )
}
