'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
const MapaVivo = dynamic(() => import('./MapaVivo'), { ssr: false })
const COLORES = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']


function FirmaInline({ firma }: { firma: string }) {
  const [url, setUrl] = useState<string|null>(null)
  const [cargando, setCargando] = useState(false)
  async function ver() {
    if (url) { setUrl(null); return }
    setCargando(true)
    const res = await fetch('/api/firma', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ firma }) }).then(r => r.json())
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

export default function MapaPage() {
  const [datos, setDatos] = useState<any>({ visitas: [], empleados: [] })
  const [fecha, setFecha] = useState(new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0])
  const { data: session } = useSession()
  const rol = (session?.user as any)?.role || ''
  const esEmpleado = !rol || ['vendedor', 'entregas'].includes(rol)
  const [empleadoId, setEmpleadoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [visitaSeleccionada, setVisitaSeleccionada] = useState<any>(null)
  const searchParams = useSearchParams()
  const rutaId = searchParams.get('rutaId')

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
            <p className="text-zinc-400 text-sm flex-1">{datos.visitas.length} visitas con GPS</p>
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
        {rutaId && <p className="text-zinc-400 text-sm mt-1">{datos.visitas.length} visitas con GPS</p>}
      </div>
      {/* Leyenda empleados */}
      {!esEmpleado && datos.empleados.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {datos.empleados.map((e: any, i: number) => (
            <div key={e.id} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORES[i % COLORES.length] }} />
              <span className="text-zinc-400 text-xs">{e.nombre}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Mapa */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden" style={{ height: '500px' }}>
          {loading ? (
            <div className="h-full flex items-center justify-center text-zinc-400">Cargando mapa...</div>
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

        {/* Timeline */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 overflow-y-auto" style={{ maxHeight: '500px' }}>
          <p className="text-zinc-400 text-xs font-semibold mb-3">TIMELINE</p>
          {datos.visitas.length === 0 ? (
            <p className="text-zinc-600 text-sm">Sin visitas</p>
          ) : (
            <div className="space-y-3">
              {datos.visitas.map((v: any) => (
                <button key={v.id} onClick={() => setVisitaSeleccionada(v)}
                  className={"w-full text-left p-3 rounded-xl border transition-all " + (visitaSeleccionada?.id === v.id ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-800 bg-zinc-800 hover:border-zinc-700")}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorEmpleado(v.empleadoId) }} />
                    <span className="text-zinc-400 text-xs">{new Date(v.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-white text-sm font-medium truncate">{v.cliente?.nombre}</p>
                  <p className="text-zinc-500 text-xs truncate">{v.empleado?.nombre}</p>
                  {v.nota && <p className="text-zinc-400 text-xs mt-1 truncate">{v.nota}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detalle visita seleccionada */}
      {visitaSeleccionada && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold">Detalle de visita</p>
            <button onClick={() => setVisitaSeleccionada(null)} className="text-zinc-500 hover:text-white">✕</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-zinc-400 text-xs">Cliente</p>
              <p className="text-white text-sm">{visitaSeleccionada.cliente?.nombre}</p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs">Empleado</p>
              <p className="text-white text-sm">{visitaSeleccionada.empleado?.nombre}</p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs">Hora</p>
              <p className="text-white text-sm">{new Date(visitaSeleccionada.createdAt).toLocaleTimeString('es-CO')}</p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs">Coordenadas</p>
              <a href={`https://www.google.com/maps?q=${visitaSeleccionada.lat},${visitaSeleccionada.lng}`}
                target="_blank" className="text-emerald-400 text-sm hover:underline">
                Ver en Maps →
              </a>
            </div>
            {visitaSeleccionada.nota && (
              <div className="col-span-2 md:col-span-4">
                <p className="text-zinc-400 text-xs">Nota</p>
                <p className="text-white text-sm">{visitaSeleccionada.nota}</p>
              </div>
            )}
            {visitaSeleccionada.factura && (
              <div className="col-span-2 md:col-span-4">
                <p className="text-zinc-400 text-xs">Factura</p>
                <p className="text-blue-400 text-sm font-semibold">{visitaSeleccionada.factura}</p>
              </div>
            )}
            {visitaSeleccionada.firma && (
              <div className="col-span-2 md:col-span-4">
                <FirmaInline firma={visitaSeleccionada.firma} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
