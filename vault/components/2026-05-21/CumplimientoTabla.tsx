'use client'
import BadgePct from '@/components/BadgePct'

interface Punto {
  clienteId: string
  nombre: string
  nombreComercial?: string
  meta: number
  montoMes: number
  pct: number
  esPrimero?: boolean
}

interface Dia {
  dia: number
  nombre: string
  configurado: boolean
  puntos: Punto[]
  totalMeta: number
  totalMes: number
  pctTotal: number
}

interface CumplimientoData {
  nombre: string
  semana: Dia[]
  totalMeta: number
  totalMes: number
  pctTotal: number
}

interface Props {
  impId: string
  data: CumplimientoData
  onVenta?: (impId: string, punto: Punto) => void
  esImpulsadora?: boolean
}

function colorPct(pct: number) {
  if (pct >= 80) return 'text-emerald-400'
  if (pct >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function bgPct(pct: number) {
  if (pct >= 80) return 'bg-emerald-500'
  if (pct >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function badgePct(pct: number) {
  if (pct >= 80) return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
  if (pct >= 50) return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
  return 'bg-red-500/20 text-red-400 border border-red-500/30'
}

const fmt = (n: number) => '$' + (n || 0).toLocaleString('es-CO')

export default function CumplimientoTabla({ impId, data, onVenta, esImpulsadora }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden pb-24">
      {/* Header */}
      <div className="px-2 py-3 border-b border-zinc-800 flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-white font-bold text-base mb-1">{data.nombre}</p>
          <div className="flex items-center gap-3">
            <span className="text-xs"><span className="text-zinc-300">Ventas </span><span className="text-blue-400 font-bold">{fmt(data.totalMes)}</span></span>
            <span className="text-xs"><span className="text-zinc-300">Meta </span><span className="text-orange-400 font-bold">{fmt(data.totalMeta)}</span></span>
          </div>
        </div>
        <BadgePct pct={data.pctTotal} />
      </div>

      {/* Barra global */}
      {data.totalMeta > 0 && (
        <div className="px-2 py-2 border-b border-zinc-800">
          <div className="w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all ${bgPct(data.pctTotal || 0)}`}
              style={{ width: Math.min(100, data.pctTotal || 0) + '%' }}
            />
          </div>
        </div>
      )}

      {/* Tabla */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left px-2 py-2 text-zinc-200 font-semibold">Cliente</th>
            <th className="text-right px-1 py-2 text-orange-400 font-semibold w-20">Meta</th>
            <th className="text-right px-1 py-2 text-blue-400 font-semibold w-20">Ventas</th>
            <th className="text-right px-2 py-2 text-zinc-200 font-semibold w-10">%</th>
          </tr>
        </thead>
        <tbody>
          {(data.semana || []).map((dia: Dia) => (
            <>
              {/* Fila día — solo nombre */}
              <tr key={`dia-${dia.dia}`} className="bg-zinc-800/60 border-t border-zinc-700">
                <td colSpan={4} className="px-2 py-1.5">
                  <span className="text-blue-400 font-bold text-xs uppercase tracking-wide">{dia.nombre}</span>
                  {!dia.configurado && <span className="text-zinc-600 text-xs ml-2">Sin ruta</span>}
                </td>
              </tr>

              {/* Filas clientes */}
              {dia.configurado && dia.puntos.map((p: Punto) => (
                <tr key={p.clienteId} className="border-t border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-2 py-2">
                    <p className="text-white text-xs font-medium leading-tight">{p.nombre}</p>
                    {p.nombreComercial && (
                      <p className="text-zinc-300 text-xs leading-tight">{p.nombreComercial}</p>
                    )}
                  </td>
                  <td className="px-1 py-2 text-right">
                    {p.meta > 0
                      ? <span className="text-orange-400 font-semibold">{fmt(p.meta)}</span>
                      : <span className="text-zinc-600">—</span>
                    }
                  </td>
                  <td className="px-1 py-2 text-right">
                    {p.montoMes > 0
                      ? <span className="text-blue-400 font-semibold">{fmt(p.montoMes)}</span>
                      : <span className="text-zinc-600">—</span>
                    }
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.meta > 0
                        ? <BadgePct pct={p.pct} size="sm" />
                        : <span className="text-zinc-600">—</span>
                      }
                      {!esImpulsadora && onVenta && p.esPrimero !== false && p.meta > 0 && (
                        <button
                          onClick={() => onVenta(impId, p)}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-2 py-0.5 rounded-lg ml-1"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
