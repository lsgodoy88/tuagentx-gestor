'use client'
import { estadoMasCritico } from '@/lib/cartera'

const ESTADO_BADGE: Record<string, string> = {
  critica:  'bg-red-500/15 text-red-400 border border-red-500/30',
  mora:     'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  vencida:  'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  pendiente:'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  abonada:  'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  pagada:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
}
const ESTADO_ICON: Record<string, string> = {
  critica: '⛔', mora: '🔴', vencida: '🟠', pendiente: '🟡', abonada: '🔵', pagada: '✅',
}

interface Cliente {
  id: string
  nombre: string
  nombreComercial?: string
  direccion?: string
  telefono?: string
  ciudad?: string
  nit?: string
  lat?: number
  lng?: number
  ubicacionReal?: boolean
  lista?: { id: string; nombre: string } | null
}
interface Props {
  cliente: Cliente
  onGps?: (id: string) => void
  onEliminar?: (id: string) => void
  onEditar?: (cliente: Cliente) => void
  onClick?: (cliente: Cliente) => void
  onCartera?: (cliente: Cliente) => void
  onVerDeuda?: (cliente: Cliente) => void
  deuda?: { saldoPendiente: number; DetalleCartera?: any[] } | null
  seleccionado?: boolean
  orden?: number
  esAdmin?: boolean
}
export default function ClienteCard({ cliente: c, onGps, onEliminar, onEditar, onClick, onCartera, onVerDeuda, deuda, seleccionado, orden, esAdmin }: Props) {
  const fmtCOP = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
  const saldo = deuda ? Number(deuda.saldoPendiente) : 0
  const detalles = deuda?.DetalleCartera || []
  const estadoCrit = detalles.length > 0
    ? estadoMasCritico(detalles.map((d: any) => ({
        estado: d.estado,
        valorFactura: d.valorFactura ?? d.valor,
        valor: d.valor,
        abonos: d.abonos,
        fechaVencimiento: d.fechaVencimiento ? new Date(d.fechaVencimiento) : null,
      })))
    : (saldo > 0 ? 'pendiente' : 'pagada')
  const estadoBadge = ESTADO_BADGE[estadoCrit] || ''
  const estadoIcon = ESTADO_ICON[estadoCrit] || ''
  return (
    <div
      onClick={() => onClick?.(c)}
      className={
        "bg-zinc-900 border rounded-2xl px-4 py-3 " +
        (onClick ? "cursor-pointer hover:bg-zinc-800/50 " : "") +
        (seleccionado ? "border-emerald-500 bg-emerald-500/10 " : "border-zinc-800 ")
      }
    >
      {/* Fila 1: avatar + nombre */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {orden !== undefined ? orden : c.nombre[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium truncate text-sm">{c.nombre}</p>
          {c.nombreComercial && <p className="text-zinc-200 text-xs truncate">{c.nombreComercial}</p>}
        </div>
      </div>

      {/* Fila 2: badge + monto + botones en una sola línea */}
      <div className="flex items-center justify-between gap-2 mt-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {c.lista && <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">{c.lista.nombre}</span>}
          {deuda && saldo > 0 && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${estadoBadge}`}>
              {estadoIcon} {fmtCOP(saldo)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {deuda && saldo > 0 && onVerDeuda && (
            <button onClick={e => { e.stopPropagation(); onVerDeuda(c) }}
              className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg hover:bg-emerald-500/20 font-semibold whitespace-nowrap">
              💳 Recaudar
            </button>
          )}
          {onCartera && (
            <button onClick={e => { e.stopPropagation(); onCartera(c) }}
              className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-lg hover:bg-blue-500/20">
              📊
            </button>
          )}
          {c.ubicacionReal ? (
            <span className="text-xs text-emerald-400">GPS ✓</span>
          ) : onGps ? (
            <button onClick={e => { e.stopPropagation(); onGps(c.id) }}
              className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-lg hover:bg-red-500/20">
              📍
            </button>
          ) : null}
          {esAdmin && onEditar && (
            <button onClick={e => { e.stopPropagation(); onEditar(c) }}
              className="text-zinc-300 hover:text-blue-400 text-sm">
              ✏️
            </button>
          )}
          {onEliminar && (
            <button onClick={e => { e.stopPropagation(); onEliminar(c.id) }}
              className="text-zinc-600 hover:text-red-400 text-sm">
              🗑️
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
