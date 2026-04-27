'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

function fmtFecha(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'alistado', label: 'Alistado' },
  { value: 'despachado', label: 'Despachado' },
  { value: 'entregado', label: 'Entregado' },
]

export default function TrazabilidadPage() {
  const { data: session } = useSession()
  const user = session?.user as any

  const [ordenes, setOrdenes] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [qInput, setQInput] = useState('')

  const [fotoModal, setFotoModal] = useState<string | null>(null)
  const [firmaModal, setFirmaModal] = useState<string | null>(null)

  async function cargar(p = 1) {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (estado) params.set('estado', estado)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    params.set('page', String(p))
    const res = await fetch('/api/trazabilidad?' + params.toString()).then(r => r.json())
    setOrdenes(res.ordenes || [])
    setTotal(res.total || 0)
    setPages(res.pages || 1)
    setPage(p)
    setLoading(false)
  }

  useEffect(() => { cargar(1) }, [q, estado, desde, hasta])

  if (!['empresa', 'supervisor', 'superadmin'].includes(user?.role)) {
    return <div className="p-8 text-zinc-400">Sin acceso</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Trazabilidad</h1>
        <p className="text-zinc-400 text-sm mt-1">Ciclo completo: orden → alistamiento → despacho → entrega</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <input
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setQ(qInput)}
            placeholder="# orden o cliente..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
          />
          <button onClick={() => setQ(qInput)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
            Buscar
          </button>
        </div>
        <select value={estado} onChange={e => setEstado(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none">
          {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none" />
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none" />
        {(q || estado || desde || hasta) && (
          <button onClick={() => { setQ(''); setQInput(''); setEstado(''); setDesde(''); setHasta('') }}
            className="text-zinc-400 hover:text-white text-sm px-3 py-2.5">
            Limpiar
          </button>
        )}
      </div>

      {/* Resultados */}
      {loading ? (
        <div className="text-zinc-400 py-12 text-center">Cargando...</div>
      ) : ordenes.length === 0 ? (
        <div className="text-zinc-500 py-12 text-center">Sin resultados</div>
      ) : (
        <div className="space-y-4">
          <p className="text-zinc-500 text-xs">{total} órdenes encontradas</p>
          {ordenes.map(orden => {
            const fotos: string[] = Array.isArray(orden.fotosAlistamiento)
              ? orden.fotosAlistamiento
              : orden.fotoAlistamiento ? [orden.fotoAlistamiento] : []
            const firma = orden.visitas?.[0]?.firma || null
            const repartidorNombre = orden.repartidor?.nombre || null
            const entregadoPor = orden.visitas?.[0]?.empleado?.nombre || null
            const entregadoEl = orden.visitas?.[0]?.createdAt || orden.entregadoEl || null

            const etapas = [
              {
                icon: '📋',
                label: 'Orden',
                fecha: orden.fechaOrden,
                quien: null,
                accion: null,
              },
              {
                icon: '📦',
                label: 'Alistado',
                fecha: orden.alistadoEl,
                quien: orden.alistadoPor?.nombre || null,
                accion: fotos.length > 0 ? () => setFotoModal(fotos[0]) : null,
                accionLabel: '🖼️',
              },
              {
                icon: '🚚',
                label: 'Despachado',
                fecha: orden.estado !== 'pendiente' && orden.estado !== 'alistado' ? orden.alistadoEl : null,
                quien: repartidorNombre,
                accion: null,
              },
              {
                icon: '✅',
                label: 'Entregado',
                fecha: entregadoEl,
                quien: entregadoPor,
                accion: firma ? () => setFirmaModal(firma) : null,
                accionLabel: '✍️',
              },
            ]

            return (
              <div key={orden.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-3">
                  <span className="text-white font-bold text-sm">#{orden.numeroOrden}</span>
                  <span className="text-zinc-300 text-sm font-medium">{orden.clienteNombre}</span>
                  {orden.ciudad && <span className="text-zinc-500 text-xs">{orden.ciudad}</span>}
                  <span className="text-zinc-500 text-xs ml-auto">{fmtFecha(orden.fechaOrden)}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    orden.estado === 'entregado' ? 'bg-emerald-500/15 text-emerald-400' :
                    orden.estado === 'despachado' ? 'bg-blue-500/15 text-blue-400' :
                    orden.estado === 'alistado' ? 'bg-amber-500/15 text-amber-400' :
                    'bg-zinc-700 text-zinc-400'
                  }`}>
                    {orden.estado}
                  </span>
                </div>

                {/* Timeline */}
                <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {etapas.map((etapa, i) => (
                    <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl ${etapa.fecha ? 'bg-zinc-800/60' : 'bg-zinc-800/20'}`}>
                      <span className="text-lg flex-shrink-0">{etapa.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${etapa.fecha ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          {etapa.label}
                        </p>
                        <p className={`text-xs mt-0.5 ${etapa.fecha ? 'text-white' : 'text-zinc-700'}`}>
                          {etapa.fecha ? fmtFecha(etapa.fecha) : '—'}
                        </p>
                        {etapa.quien && (
                          <p className="text-zinc-500 text-xs mt-0.5 truncate">👤 {etapa.quien}</p>
                        )}
                        {etapa.accion && (
                          <button onClick={etapa.accion}
                            className="mt-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-0.5 rounded-lg">
                            {etapa.accionLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Paginación */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button onClick={() => cargar(page - 1)} disabled={page === 1}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-xl">
                ← Anterior
              </button>
              <span className="text-zinc-400 text-sm">{page} / {pages}</span>
              <button onClick={() => cargar(page + 1)} disabled={page === pages}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-xl">
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal foto */}
      {fotoModal && (
        <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4"
          onClick={() => setFotoModal(null)}>
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFotoModal(null)}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg z-10">
              ✕
            </button>
            <img src={fotoModal} alt="Foto alistamiento" className="w-full rounded-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}

      {/* Modal firma */}
      {firmaModal && (
        <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4"
          onClick={() => setFirmaModal(null)}>
          <div className="relative max-w-sm w-full bg-white rounded-2xl p-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFirmaModal(null)}
              className="absolute top-2 right-2 bg-black/20 text-black rounded-full w-7 h-7 flex items-center justify-center text-sm z-10">
              ✕
            </button>
            <p className="text-zinc-600 text-xs font-semibold mb-2 text-center">Firma del cliente</p>
            <img src={firmaModal} alt="Firma cliente" className="w-full object-contain max-h-48" />
          </div>
        </div>
      )}
    </div>
  )
}
