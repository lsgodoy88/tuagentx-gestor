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

function hoy() { return new Date().toISOString().split('T')[0] }
function hace7() {
  const d = new Date(); d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'alistado', label: 'Alistado' },
  { value: 'despachado', label: 'Despachado' },
  { value: 'en_entrega', label: 'En entrega' },
  { value: 'en_transito', label: 'En tránsito' },
  { value: 'entregado', label: 'Entregado' },
]

const ICONO_ESTADO: Record<string, string> = {
  pendiente: '🟡',
  alistado: '🟢',
  despachado: '🚚',
  en_entrega: '🚚',
  en_transito: '🚛',
  entregado: '✅',
}

const LABEL_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  alistado: 'Alistado',
  despachado: 'Despachado',
  en_entrega: 'En entrega',
  en_transito: 'En tránsito',
  entregado: 'Entregado',
}

const BADGE_ESTADO: Record<string, string> = {
  pendiente: 'bg-zinc-700 text-zinc-400',
  alistado: 'bg-amber-500/15 text-amber-400',
  despachado: 'bg-blue-500/15 text-blue-400',
  en_entrega: 'bg-blue-500/15 text-blue-400',
  en_transito: 'bg-violet-500/15 text-violet-400',
  entregado: 'bg-emerald-500/15 text-emerald-400',
}

export default function TrazabilidadPage() {
  const { data: session } = useSession()
  const user = session?.user as any

  const [tabPrincipal, setTabPrincipal] = useState<'despachos' | 'inventario'>('despachos')
  const [ordenes, setOrdenes] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('')
  const [desde, setDesde] = useState(hace7)
  const [hasta, setHasta] = useState(hoy)

  const [expandido, setExpandido] = useState<Record<string, boolean>>({})
  const [fotoModal, setFotoModal] = useState<string | null>(null)
  const [firmaModal, setFirmaModal] = useState<string | null>(null)

  function toggleExpandido(id: string) {
    setExpandido(prev => ({ ...prev, [id]: !prev[id] }))
  }

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

  function buscar() { setQ(qInput) }
  function limpiar() { setQ(''); setQInput(''); setEstado(''); setDesde(hace7()); setHasta(hoy()) }

  if (!['empresa', 'supervisor', 'superadmin'].includes(user?.role)) {
    return <div className="p-8 text-zinc-400">Sin acceso</div>
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Trazabilidad</h1>
      </div>

      {/* Tabs principales */}
      <div className="flex border-b border-zinc-800">
        <button onClick={() => setTabPrincipal('despachos')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'despachos' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
          📦 Despachos
        </button>
        <button onClick={() => setTabPrincipal('inventario')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'inventario' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
          🏭 Inventario
        </button>
      </div>

      {tabPrincipal === 'inventario' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500">
          <p className="text-4xl mb-3">🏭</p>
          <p className="font-semibold text-white">Módulo en construcción</p>
          <p className="text-sm mt-1">Próximamente: control de stock, entradas y salidas</p>
        </div>
      )}

      {tabPrincipal === 'despachos' && (<>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="# orden o cliente..."
            className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none"
          />
          <select value={estado} onChange={e => setEstado(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none">
            {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <button onClick={buscar}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl">
            🔍
          </button>
        </div>
        <div className="flex gap-2">
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none" />
          <span className="text-zinc-500 self-center">—</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none" />
          {(q || estado || desde !== hace7() || hasta !== hoy()) && (
            <button onClick={limpiar} className="text-zinc-500 hover:text-white text-xs px-2">Limpiar</button>
          )}
        </div>
      </div>

      {/* Resultados */}
      {loading ? (
        <div className="text-zinc-400 py-12 text-center">Cargando...</div>
      ) : ordenes.length === 0 ? (
        <div className="text-zinc-500 py-12 text-center">Sin resultados en el período</div>
      ) : (
        <div className="space-y-2">
          <p className="text-zinc-500 text-xs">{total} órdenes encontradas</p>
          {ordenes.map(orden => {
            const fotos: string[] = Array.isArray(orden.fotosAlistamiento)
              ? orden.fotosAlistamiento
              : orden.fotoAlistamiento ? [orden.fotoAlistamiento] : []
            const firma = orden.visitas?.[0]?.firma || null
            const repartidorNombre = orden.repartidor?.nombre || null
            const entregadoPor = orden.visitas?.[0]?.empleado?.nombre || null
            const entregadoEl = orden.visitas?.[0]?.createdAt || orden.entregadoEl || null
            const abierto = expandido[orden.id] || false

            const etapas = [
              {
                icon: '📋',
                label: 'Orden',
                fecha: orden.fechaOrden,
                quien: null as string | null,
                accion: null as (() => void) | null,
                accionLabel: '',
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
                fecha: !['pendiente', 'alistado'].includes(orden.estado) ? orden.alistadoEl : null,
                quien: repartidorNombre,
                accion: null,
                accionLabel: '',
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
                {/* Header — siempre visible, clickeable */}
                <div onClick={() => toggleExpandido(orden.id)} className="flex items-center gap-2 p-3 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                  <span className="text-zinc-400 font-mono text-xs flex-shrink-0">#{orden.numeroOrden}</span>
                  <span className="text-white text-sm font-semibold truncate flex-1">{orden.clienteNombre}</span>
                  <span className="text-zinc-400 text-xs flex-shrink-0">{orden.ciudad}</span>
                  <span className="flex-shrink-0">{ICONO_ESTADO[orden.estado] || '⚪'}</span>
                  <span className="text-zinc-500 text-xs flex-shrink-0">{abierto ? '▲' : '▼'}</span>
                </div>

                {/* Timeline — solo si expandido */}
                {abierto && (
                  <div className="px-3 pb-3 border-t border-zinc-800 pt-2 space-y-0.5">
                    {etapas.map((etapa, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5">
                        <span className="text-base flex-shrink-0">{etapa.icon}</span>
                        <span className="text-zinc-400 text-xs w-20 flex-shrink-0">{etapa.label}</span>
                        <span className="text-white text-xs flex-shrink-0">{etapa.fecha ? fmtFecha(etapa.fecha) : '—'}</span>
                        <span className="text-zinc-500 text-xs truncate flex-1">{etapa.quien || ''}</span>
                        {etapa.accion && (
                          <button
                            onClick={e => { e.stopPropagation(); etapa.accion!() }}
                            className="flex-shrink-0 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-0.5 rounded-lg"
                          >
                            {etapa.accionLabel}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
      </>)}

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
