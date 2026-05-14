'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { CountUp, LiveDot } from '@/components/FX'
const MapaVivo = dynamic(() => import('@/app/dashboard/mapa/MapaVivo'), { ssr: false })
const COLORES = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

function FirmaInline({ firma }: { firma: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  async function ver() {
    if (url) { setUrl(null); return }
    setCargando(true)
    const res = await fetch('/api/firma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firma }) }).then(r => r.json())
    if (res.url) setUrl(res.url)
    setCargando(false)
  }
  return (
    <div>
      <button onClick={ver} className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-lg">
        {cargando ? 'Cargando...' : url ? 'Ocultar firma' : 'Ver firma'}
      </button>
      {url && <div className="bg-white rounded-lg p-2 mt-2"><img src={url} alt="Firma" className="w-full rounded" /></div>}
    </div>
  )
}

export default function MapaEnVivo({ embebido = false }: { embebido?: boolean }) {
  const [datos, setDatos] = useState<any>({ visitas: [], empleados: [] })
  const [fecha, setFecha] = useState(new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0])
  const { data: session } = useSession()
  const rol = (session?.user as any)?.role || ''
  const esEmpleado = !rol || ['vendedor', 'entregas'].includes(rol)
  const [empleadoId, setEmpleadoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [visitaSeleccionada, setVisitaSeleccionada] = useState<any>(null)
  const searchParams = useSearchParams()
  const rutaId = embebido ? null : searchParams.get('rutaId')

  useEffect(() => { loadData() }, [fecha, empleadoId, rutaId])

  async function loadData() {
    setLoading(true)
    const params = new URLSearchParams(rutaId ? {} : { fecha })
    if (empleadoId) params.append('empleadoId', empleadoId)
    if (rutaId) params.append('rutaId', rutaId)
    const res = await fetch(`/api/mapa?${params}`)
    const data = await res.json()
    setDatos(data)
    setLoading(false)
  }

  const colorEmpleado = (id: string) => {
    const idx = datos.empleados.findIndex((e: any) => e.id === id)
    return COLORES[idx % COLORES.length] || COLORES[0]
  }

  return (
    <div className="space-y-3">
      {!embebido && (
        <div>
          <div className="flex items-center gap-2">
            {rutaId && (
              <Link href="/dashboard/rutas" className="text-zinc-400 hover:text-white text-lg">←</Link>
            )}
            <h1 className="text-lg font-bold text-white flex-1">
              {rutaId ? `🗺️ ${datos.rutaNombre || 'Ruta'}` : 'Mapa en vivo'}
            </h1>
          </div>
          {!rutaId && (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-zinc-400 text-sm flex-1 flex items-center gap-2"><CountUp end={datos.visitas.length} /> visitas con GPS {datos.visitas.length > 0 && <LiveDot color="emerald" />}</p>
              {!esEmpleado && <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-white text-xs outline-none max-w-[140px]">
                <option value="">Vendedores</option>
                {datos.empleados.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>}
              <div className="relative flex-shrink-0">
                <button onClick={() => (document.getElementById("mapa-fecha") as HTMLInputElement)?.showPicker?.()}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-sm">
                  📅
                </button>
                <input id="mapa-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  className="absolute opacity-0 pointer-events-none top-0 left-0 w-0 h-0" />
              </div>
            </div>
          )}
          {rutaId && <p className="text-zinc-400 text-sm mt-1 flex items-center gap-2"><CountUp end={datos.visitas.length} /> visitas con GPS {datos.visitas.length > 0 && <LiveDot color="emerald" />}</p>}
        </div>
      )}

      {embebido && (
        <div className="flex items-center gap-2">
          <p className="text-zinc-400 text-sm flex-1 flex items-center gap-2"><CountUp end={datos.visitas.length} /> visitas con GPS {datos.visitas.length > 0 && <LiveDot color="emerald" />}</p>
          {!esEmpleado && <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-white text-xs outline-none max-w-[140px]">
            <option value="">Vendedores</option>
            {datos.empleados.map((e: any) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>}
          <div className="relative flex-shrink-0">
            <button onClick={() => (document.getElementById("mapa-fecha-tab") as HTMLInputElement)?.showPicker?.()}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-sm">
              📅
            </button>
            <input id="mapa-fecha-tab" type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="absolute opacity-0 pointer-events-none top-0 left-0 w-0 h-0" />
          </div>
        </div>
      )}

      {!esEmpleado && datos.empleados.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {datos.empleados.map((e: any, i: number) => (
            <div key={e.id} className={`flex items-center gap-1.5 fade-up stagger-${Math.min(i+1, 8)}`}>
              <span className="relative inline-flex h-3 w-3 align-middle">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 live-ping" style={{ backgroundColor: COLORES[i % COLORES.length] }} />
                <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: COLORES[i % COLORES.length] }} />
              </span>
              <span className="text-zinc-400 text-xs">{e.nombre}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden" style={{ height: '500px' }}>
          {loading ? (
            <div className="h-full p-4 space-y-3"><div className="shimmer h-full rounded-xl" /></div>
          ) : datos.visitas.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-2">
              <span className="text-4xl">🗺️</span>
              <p>Sin visitas con GPS en esta fecha</p>
            </div>
          ) : (
            <MapaVivo
              visitas={datos.visitas}
              colorEmpleado={colorEmpleado}
              onVisitaClick={setVisitaSeleccionada}
            />
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 overflow-y-auto" style={{ maxHeight: '500px' }}>
          <p className="text-zinc-600 text-[10px] font-bold tracking-widest mb-2 px-1">TIMELINE</p>
          {datos.visitas.length === 0 ? (
            <p className="text-zinc-600 text-sm px-1">Sin visitas</p>
          ) : (
            <div className="space-y-1">
              {datos.visitas.map((v: any, i: number) => {
                const isOpen = visitaSeleccionada?.id === v.id
                const tipoIcon: Record<string, string> = { visita: '🤝', recaudo: '💵', venta: '🧾', entrega: '📦' }
                const icon = tipoIcon[v.tipo] ?? '🤝'
                const hora = new Date(v.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
                const dir = [v.cliente?.direccion, v.cliente?.ciudad].filter(Boolean).join(', ')
                const mapsUrl = v.lat && v.lng ? `https://www.google.com/maps?q=${v.lat},${v.lng}` : (v.cliente?.maps || null)
                return (
                  <div key={v.id}
                    className={`bg-zinc-800 border rounded-xl overflow-hidden transition-colors fade-up stagger-${Math.min(i+1,8)} ${isOpen ? 'border-zinc-600' : 'border-zinc-800 hover:border-zinc-700'}`}>
                    {/* Línea 1 — siempre visible */}
                    <button onClick={() => setVisitaSeleccionada(isOpen ? null : v)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left">
                      {!esEmpleado && (
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorEmpleado(v.empleadoId) }} />
                      )}
                      <span className="text-sm flex-shrink-0">{icon}</span>
                      <span className="text-white text-xs font-medium flex-1 truncate">{v.cliente?.nombre || v.cliente?.nombreComercial}</span>
                      <span className="text-zinc-500 text-[11px] flex-shrink-0 tabular-nums">{hora}</span>
                    </button>
                    {/* Línea 2 — solo desplegada */}
                    {isOpen && dir && (
                      <div className="flex items-center gap-2 px-3 pb-2">
                        <span className="text-zinc-500 text-[11px] flex-1 truncate">{dir}</span>
                        {mapsUrl && (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 text-[11px] font-semibold text-zinc-400 border border-zinc-600 rounded-md px-2 py-0.5 hover:text-white hover:border-zinc-500 transition-colors">
                            ↗ Maps
                          </a>
                        )}
                      </div>
                    )}
                    {isOpen && !dir && mapsUrl && (
                      <div className="px-3 pb-2">
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-zinc-400 border border-zinc-600 rounded-md px-2 py-0.5 hover:text-white hover:border-zinc-500 transition-colors">
                          ↗ Maps
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>


    </div>
  )
}
