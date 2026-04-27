'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { fetchApi, errorMsg } from '@/lib/fetchApi'
import { useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import ModalVisita from '@/components/ModalVisita'

const MapaRutaVivo = dynamic(() => import('../mapa-ruta/MapaRutaVivo'), { ssr: false })
import { obtenerGpsMejor, calentar } from '@/lib/gps'

const TIPOS = [
  { id: 'visita', label: 'Visita', icon: '👁️' },
  { id: 'venta', label: 'Venta', icon: '💰' },
  { id: 'cobro', label: 'Cobro', icon: '💵' },
  { id: 'entrega', label: 'Entrega', icon: '📦' },
]

function etiquetaColor(etiqueta: string): string {
  let hash = 0
  for (let i = 0; i < etiqueta.length; i++) hash = etiqueta.charCodeAt(i) + ((hash << 5) - hash)
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 70%, 45%)`
}

export default function MiRutaPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const [ruta, setRuta] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [clienteModal, setClienteModal] = useState<any>(null)
  const [visitasHoy, setVisitasHoy] = useState<any[]>([])
  const [turno, setTurno] = useState<any>(null)
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0])
  const [detalleCliente, setDetalleCliente] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const [puedeCapturarGps, setPuedeCapturarGps] = useState(false)
  const [verClientes, setVerClientes] = useState(false)
  const [historial, setHistorial] = useState<any[]>([])
  const [rutaExpandida, setRutaExpandida] = useState<string | null>(null)
  const [optimizando, setOptimizando] = useState(false)
  const [rutaOptimizada, setRutaOptimizada] = useState<any[]>([])
  const [mostrarOptimizada, setMostrarOptimizada] = useState(false)
  const [clientesOrdenados, setClientesOrdenados] = useState<any[]>([])
  // Desktop
  const [paradaSeleccionada, setParadaSeleccionada] = useState<string | null>(null)
  const [showTipoDropdown, setShowTipoDropdown] = useState(false)
  const [tipoModal, setTipoModal] = useState<string | undefined>(undefined)
  const paradaSeleccionadaRef = useRef<string | null>(null)

  useEffect(() => { paradaSeleccionadaRef.current = paradaSeleccionada }, [paradaSeleccionada])
  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [rutaRes, visitasRes, turnoRes, historialRes, meRes] = await Promise.all([
      fetch('/api/rutas/mi-ruta').then(r => r.json()),
      fetch('/api/visitas/todas').then(r => r.json()),
      fetch('/api/turnos').then(r => r.json()),
      fetch('/api/rutas/historial').then(r => r.json()),
      fetch('/api/me').then(r => r.json()),
    ])
    setRuta(rutaRes)
    const clientes = rutaRes?.clientes?.map((rc: any) => ({
      ...rc.cliente,
      supervisorEtiqueta: rc.supervisorEtiqueta || null,
      notas: rc.notas || null,
      ordenDespachoId: rc.ordenDespachoId || null,
    })) || []
    setClientesOrdenados(clientes)
    const visitas = Array.isArray(visitasRes) ? visitasRes : []
    setVisitasHoy(visitas)
    setTurno(turnoRes)
    setHistorial(Array.isArray(historialRes) ? historialRes.slice(1) : [])
    setPuedeCapturarGps(meRes?.puedeCapturarGps === true)

    // Auto-seleccionar primera parada no ejecutada (o avanzar si la actual ya fue ejecutada)
    if (clientes.length > 0) {
      const fechaRuta = rutaRes?.fecha
        ? new Date(new Date(rutaRes.fecha).getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
      const ejecutadaFn = (clienteId: string) =>
        visitas.some((v: any) => {
          if (v.clienteId !== clienteId) return false
          const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(v.createdAt).toLocaleDateString('en-CA')
          return fv === fechaRuta
        })
      const actual = paradaSeleccionadaRef.current
      if (!actual || ejecutadaFn(actual)) {
        const primero = clientes.find((c: any) => !ejecutadaFn(c.id))
        setParadaSeleccionada(primero?.id || clientes[0]?.id || null)
      }
    }

    setLoading(false)
  }

  async function optimizarRuta() {
    if (!ruta?.clientes) return
    setOptimizando(true)
    const gpos = await obtenerGpsMejor()
    const ubicacion = gpos ? { lat: gpos.lat, lng: gpos.lng } : null
    if (!ubicacion) { setOptimizando(false); alert('No se pudo obtener tu ubicación GPS'); return }
    const clientes = clientesOrdenados
    const res = await fetchApi('/api/rutas/optimizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientes, latInicio: ubicacion.lat, lngInicio: ubicacion.lng })
    }).then(r => r.json())
    setOptimizando(false)
    if (res.error) { alert(res.error); return }
    setRutaOptimizada(res.orden || [])
    setMostrarOptimizada(true)
  }

  function visitasCliente(clienteId: string) {
    const fechaRuta = ruta?.fecha ? new Date(new Date(ruta.fecha).getTime() - 5*60*60*1000).toISOString().split('T')[0] : fechaFiltro
    return visitasHoy.filter(v => {
      if (v.clienteId !== clienteId) return false
      const fechaVisita = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(v.createdAt).toLocaleDateString('en-CA')
      return fechaVisita === fechaRuta
    })
  }

  function renderClienteCard(c: any, i: number) {
    const esEjecutado = visitasCliente(c.id).length > 0
    const visitas = visitasCliente(c.id)
    return (
      <div key={c.id} className={"rounded-xl border overflow-hidden " + (esEjecutado ? "bg-zinc-900 border-zinc-700/30" : "bg-zinc-900 border-zinc-800")}>
        <div className="flex items-center gap-3 p-3" onClick={() => esEjecutado && setDetalleCliente(detalleCliente === c.id ? null : c.id)} style={{cursor: esEjecutado ? 'pointer' : 'default'}}>
          <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 " + (esEjecutado ? "bg-emerald-600" : "bg-zinc-700")} style={{color:'white'}}>
            {esEjecutado ? '✓' : i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-white text-sm font-medium truncate">{c.nombre}</p>
              {c.supervisorEtiqueta && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                  style={{ backgroundColor: etiquetaColor(c.supervisorEtiqueta) + '33', color: etiquetaColor(c.supervisorEtiqueta), border: `1px solid ${etiquetaColor(c.supervisorEtiqueta)}66` }}>
                  {c.supervisorEtiqueta}
                </span>
              )}
            </div>
            {c.direccion && <p className="text-zinc-500 text-xs truncate">📍 {c.direccion}</p>}
            {c.telefono && <a href={"tel:" + c.telefono} onClick={e => e.stopPropagation()} className="text-emerald-400 text-xs hover:text-emerald-300">📞 {c.telefono}</a>}
            {c.lat && c.lng ? (
              <span className="text-emerald-400 text-xs">🗺️ ✓</span>
            ) : c.maps ? (
              <span className="text-zinc-500 text-xs">🗺️</span>
            ) : null}
          </div>
          {esEjecutado ? (
            <span className="text-zinc-500 text-xs flex-shrink-0">{detalleCliente === c.id ? '▲' : '▼'}</span>
          ) : (
            turno ? (
              <button onClick={(e) => { e.stopPropagation(); setClienteModal(c) }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0">
                Entregar
              </button>
            ) : (
              <span className="text-zinc-500 text-xs bg-zinc-800 px-2 py-1 rounded-lg flex-shrink-0">Sin turno</span>
            )
          )}
        </div>
        {detalleCliente === c.id && esEjecutado && (
          <div className="border-t border-zinc-800 px-3 pb-3 pt-2 space-y-1">
            {visitas.length === 0 ? (
              <p className="text-zinc-500 text-xs text-center py-2">Sin visitas registradas</p>
            ) : visitas.map((v: any) => (
              <div key={v.id} className="flex items-center gap-2">
                <span className="text-xs">{v.tipo === "venta" ? "💰" : v.tipo === "cobro" ? "💵" : v.tipo === "entrega" ? "📦" : "👁️"}</span>
                <span className="text-zinc-400 text-xs capitalize">{v.tipo}</span>
                {v.monto && <span className="text-emerald-400 text-xs font-semibold">${Number(v.monto).toLocaleString("es-CO")}</span>}
                {v.nota && <span className="text-zinc-500 text-xs truncate">— {v.nota}</span>}
                <span className="text-zinc-600 text-xs ml-auto">{new Date(v.createdAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div className="p-8 text-zinc-400">Cargando...</div>

  const clientesConGps = clientesOrdenados.filter((c: any) => c.ubicacionReal).length
  const ejecutadasCount = clientesOrdenados.filter(c => visitasCliente(c.id).length > 0).length
  const clientesEjecutadosIds = clientesOrdenados.filter(c => visitasCliente(c.id).length > 0).map(c => c.id)
  const clienteDetalle = clientesOrdenados.find(c => c.id === paradaSeleccionada) || null
  const indexDetalle = clientesOrdenados.findIndex(c => c.id === paradaSeleccionada)
  const esEjecutadoDetalle = clienteDetalle ? visitasCliente(clienteDetalle.id).length > 0 : false
  const visitasDetalle = clienteDetalle ? visitasCliente(clienteDetalle.id) : []

  return (
    <>
      {/* ── MOBILE (sin cambios) ── */}
      <div className="lg:hidden max-w-md mx-auto space-y-6 pb-24">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-white">Mi ruta {ruta ? `— ${ruta.nombre}` : ""}</h1>
          </div>
          {ruta && (
            <div className="flex gap-3 mt-1">
              <span className="text-emerald-400 text-sm">✅ {clientesOrdenados.filter((c: any) => visitasCliente(c.id).length > 0).length} ejecutadas</span>
              <span className="text-zinc-400 text-sm">⏳ {clientesOrdenados.filter((c: any) => visitasCliente(c.id).length === 0).length} pendientes</span>
            </div>
          )}
        </div>

        {!ruta ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center space-y-3">
            <p className="text-3xl">🛣️</p>
            <p className="text-white font-semibold">Sin ruta asignada</p>
            <p className="text-zinc-400 text-sm">Tu supervisor aún no ha asignado una ruta</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
              <p className="text-emerald-400 font-bold text-lg">{ruta.nombre}</p>
              <p className="text-zinc-400 text-xs mt-1">🏪 {clientesOrdenados.length} clientes asignados</p>
              {clientesConGps > 0 && <p className="text-emerald-400 text-xs mt-0.5">📍 {clientesConGps} con GPS</p>}
              {clientesConGps >= 2 && (
                <button onClick={mostrarOptimizada ? () => setMostrarOptimizada(false) : optimizarRuta}
                  disabled={optimizando}
                  className={"w-full mt-3 font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 " + (mostrarOptimizada ? "bg-blue-500/10 border border-blue-500/20 text-blue-400" : "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white")}>
                  {optimizando ? '⏳ Calculando ruta...' : mostrarOptimizada ? '✅ Ruta optimizada — Ver original' : '🤖 Optimizar ruta con IA'}
                </button>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={() => setVerClientes(v => !v)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl text-xs transition-colors">
                  📋 {verClientes ? 'Ocultar' : 'Ver clientes'}
                </button>
                <Link href="/dashboard/mapa-ruta"
                  className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-2 rounded-xl text-xs text-center transition-colors">
                  🗺️ Ver mapa
                </Link>
              </div>
            </div>

            {mostrarOptimizada && rutaOptimizada.length > 0 && (
              <div className="space-y-2">
                <p className="text-blue-400 text-xs font-semibold flex items-center gap-1">🤖 ORDEN OPTIMIZADO POR IA</p>
                {rutaOptimizada.map((c: any, i: number) => renderClienteCard(c, i))}
              </div>
            )}
            {verClientes && !mostrarOptimizada && (
              <div className="space-y-3">
                <input value={buscar} onChange={e => setBuscar(e.target.value)}
                  placeholder="Buscar cliente por nombre..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />

                {clientesOrdenados.filter((c: any) => visitasCliente(c.id).length === 0 && (buscar === '' || c.nombre.toLowerCase().includes(buscar.toLowerCase()))).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-zinc-400 text-xs font-semibold">⏳ PENDIENTES</p>
                    {clientesOrdenados
                      .filter((c: any) => visitasCliente(c.id).length === 0 && (buscar === '' || c.nombre.toLowerCase().includes(buscar.toLowerCase())))
                      .map((c: any, i: number) => renderClienteCard(c, i))}
                  </div>
                )}

                {clientesOrdenados.filter((c: any) => visitasCliente(c.id).length > 0 && (buscar === '' || c.nombre.toLowerCase().includes(buscar.toLowerCase()))).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-zinc-400 text-xs font-semibold">✅ EJECUTADAS ({clientesOrdenados.filter((c: any) => visitasCliente(c.id).length > 0).length})</p>
                    {clientesOrdenados
                      .filter((c: any) => visitasCliente(c.id).length > 0 && (buscar === '' || c.nombre.toLowerCase().includes(buscar.toLowerCase())))
                      .map((c: any, i: number) => renderClienteCard(c, i))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {historial.length > 0 && (
          <div className="space-y-2">
            <p className="text-zinc-500 text-xs font-semibold">RUTAS ANTERIORES</p>
            {historial.map((r: any) => (
              <div key={r.id} className="bg-black border border-emerald-500/40 rounded-2xl p-4">
                <p className="text-emerald-400/70 font-bold">{r.nombre}</p>
                <p className="text-zinc-500 text-xs mt-1">🏪 {r.clientes.length} clientes asignados</p>
                {r.clientes.filter((rc: any) => rc.cliente.ubicacionReal).length > 0 && (
                  <p className="text-emerald-400/70 text-xs mt-0.5">📍 {r.clientes.filter((rc: any) => rc.cliente.ubicacionReal).length} con GPS</p>
                )}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setRutaExpandida(rutaExpandida === r.id ? null : r.id)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2 rounded-xl text-xs transition-colors">
                    📋 {rutaExpandida === r.id ? 'Ocultar' : 'Ver clientes'}
                  </button>
                  <Link href="/dashboard/mapa-ruta"
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2 rounded-xl text-xs text-center transition-colors">
                    🗺️ Ver mapa
                  </Link>
                </div>
                {rutaExpandida === r.id && (
                  <div className="mt-3 space-y-2">
                    {r.clientes.map((rc: any, i: number) => {
                      const visitasRuta = visitasHoy.filter(v => {
                        if (v.clienteId !== rc.cliente.id) return false
                        const fechaVisita = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(v.createdAt).toLocaleDateString('en-CA')
                        const fechaRuta = r.fecha ? new Date(new Date(r.fecha).getTime() - 5*60*60*1000).toISOString().split('T')[0] : ''
                        return fechaVisita === fechaRuta
                      })
                      const ejecutado = visitasRuta.length > 0
                      return (
                        <div key={rc.id} className={"rounded-xl p-3 border " + (ejecutado ? "bg-zinc-900/50 border-zinc-700/30" : "bg-zinc-900 border-zinc-800")}>
                          <div className="flex-1 min-w-0">
                            {ejecutado && <span className="text-emerald-400 text-xs mb-1 block">✓ Listo</span>}
                            <p className="text-white text-sm truncate">{rc.cliente.nombre}</p>
                            {rc.cliente.nombreComercial && <p className="text-zinc-500 text-xs">{rc.cliente.nombreComercial}</p>}
                            {rc.notas && <p className="text-blue-400 text-xs">📦 {rc.notas}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {ejecutado && (
                              <div className="text-right">
                                {visitasRuta.map((v: any) => (
                                  <div key={v.id} className="flex items-center gap-1">
                                    <span className="text-xs">{v.tipo === 'venta' ? '💰' : v.tipo === 'cobro' ? '💵' : v.tipo === 'entrega' ? '📦' : '👁️'}</span>
                                    {v.monto && <span className="text-emerald-400 text-xs">${Number(v.monto).toLocaleString('es-CO')}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <span className={"text-xs px-2 py-0.5 rounded-full " + (ejecutado ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500")}>
                              {ejecutado ? 'Listo' : 'Pendiente'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DESKTOP lg+ ── */}
      <div
        className="hidden lg:flex -mx-6 -mt-6 -mb-6 overflow-hidden"
        style={{ height: '100vh' }}
      >
        {/* Panel izquierdo: lista paradas */}
        <div className="w-[300px] flex-shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-zinc-800 flex-shrink-0">
            <h1 className="text-white font-bold text-sm truncate">
              {ruta ? ruta.nombre : 'Mi ruta'}
            </h1>
            <p className="text-zinc-400 text-xs mt-0.5">
              {ejecutadasCount} ejecutadas · {clientesOrdenados.length - ejecutadasCount} pendientes
            </p>
          </div>

          {/* Lista scrolleable */}
          <div className="flex-1 overflow-y-auto">
            {!ruta ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-2xl">🛣️</p>
                <p className="text-zinc-400 text-sm">Sin ruta asignada</p>
              </div>
            ) : clientesOrdenados.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-zinc-500 text-sm">Sin clientes en esta ruta</p>
              </div>
            ) : (
              clientesOrdenados.map((c, i) => {
                const eje = visitasCliente(c.id).length > 0
                const sel = paradaSeleccionada === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => setParadaSeleccionada(c.id)}
                    className={
                      'w-full flex items-center gap-3 px-3 py-3 text-left border-b border-zinc-800/50 transition-colors ' +
                      (sel ? 'bg-zinc-800' : 'hover:bg-zinc-900/60')
                    }
                  >
                    {/* Círculo numerado */}
                    <div
                      className={
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white ' +
                        (eje ? 'bg-emerald-600' : sel ? 'bg-blue-600' : 'bg-zinc-700')
                      }
                    >
                      {eje ? '✓' : i + 1}
                    </div>
                    {/* Nombre + dirección */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{c.nombre}</p>
                      {c.direccion && (
                        <p className="text-zinc-500 text-xs truncate">
                          {c.direccion.split(',')[0]}
                        </p>
                      )}
                      {c.lat && c.lng ? (
                        <span className="text-emerald-400 text-xs">🗺️ ✓</span>
                      ) : c.maps ? (
                        <span className="text-zinc-500 text-xs">🗺️</span>
                      ) : null}
                    </div>
                    {/* Badge etiqueta */}
                    {c.supervisorEtiqueta && (
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                        style={{
                          backgroundColor: etiquetaColor(c.supervisorEtiqueta) + '33',
                          color: etiquetaColor(c.supervisorEtiqueta),
                          border: `1px solid ${etiquetaColor(c.supervisorEtiqueta)}66`,
                        }}
                      >
                        {c.supervisorEtiqueta}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer: barra progreso */}
          {ruta && clientesOrdenados.length > 0 && (
            <div className="p-4 border-t border-zinc-800 flex-shrink-0">
              <div className="flex justify-between text-xs text-zinc-400 mb-2">
                <span>{ejecutadasCount} / {clientesOrdenados.length} completadas</span>
                <span className="text-emerald-400 font-semibold">
                  {Math.round((ejecutadasCount / clientesOrdenados.length) * 100)}%
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${(ejecutadasCount / clientesOrdenados.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Centro: mapa Leaflet */}
        <div className="flex-1 relative overflow-hidden">
          {clientesOrdenados.length > 0 ? (
            <MapaRutaVivo
              clientes={clientesOrdenados}
              clientesEjecutados={clientesEjecutadosIds}
              ubicacionInicio={null}
              onClienteClick={(c: any) => setParadaSeleccionada(c.id)}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-zinc-900/30">
              <div className="text-center">
                <p className="text-4xl mb-3">🗺️</p>
                <p className="text-zinc-400 text-sm font-medium">Sin clientes en la ruta</p>
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho: detalle parada */}
        <div className="w-[320px] flex-shrink-0 border-l border-zinc-800 flex flex-col overflow-hidden">
          {!clienteDetalle ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-zinc-500 text-sm">Selecciona una parada</p>
            </div>
          ) : (
            <>
              {/* Header detalle */}
              <div className="p-4 border-b border-zinc-800 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ' +
                      (esEjecutadoDetalle ? 'bg-emerald-600' : 'bg-zinc-600')
                    }
                  >
                    {esEjecutadoDetalle ? '✓' : indexDetalle + 1}
                  </div>
                  <span className="text-zinc-500 text-xs">
                    Parada {indexDetalle + 1} de {clientesOrdenados.length}
                  </span>
                  {esEjecutadoDetalle && (
                    <span className="ml-auto text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">
                      Ejecutada
                    </span>
                  )}
                </div>
                <h2 className="text-white font-bold text-base leading-snug">{clienteDetalle.nombre}</h2>
                {clienteDetalle.nombreComercial && (
                  <p className="text-zinc-400 text-sm mt-0.5">{clienteDetalle.nombreComercial}</p>
                )}
                {clienteDetalle.supervisorEtiqueta && (
                  <span
                    className="inline-block mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-md"
                    style={{
                      backgroundColor: etiquetaColor(clienteDetalle.supervisorEtiqueta) + '33',
                      color: etiquetaColor(clienteDetalle.supervisorEtiqueta),
                      border: `1px solid ${etiquetaColor(clienteDetalle.supervisorEtiqueta)}66`,
                    }}
                  >
                    {clienteDetalle.supervisorEtiqueta}
                  </span>
                )}
              </div>

              {/* Cuerpo scrolleable */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Dirección */}
                {clienteDetalle.direccion && (
                  <div>
                    <p className="text-zinc-500 text-xs font-semibold mb-1">DIRECCIÓN</p>
                    {clienteDetalle.lat && clienteDetalle.lng ? (
                      <a
                        href={`https://www.google.com/maps?q=${clienteDetalle.lat},${clienteDetalle.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 text-sm hover:text-blue-300 flex items-start gap-1.5"
                      >
                        <span className="flex-shrink-0">📍</span>
                        <span>{clienteDetalle.direccion}</span>
                      </a>
                    ) : (
                      <p className="text-white text-sm flex items-start gap-1.5">
                        <span className="flex-shrink-0">📍</span>
                        <span>{clienteDetalle.direccion}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Celular */}
                {clienteDetalle.telefono && (
                  <div>
                    <p className="text-zinc-500 text-xs font-semibold mb-1">CELULAR</p>
                    <a
                      href={`tel:${clienteDetalle.telefono}`}
                      className="text-white text-sm flex items-center gap-1.5 hover:text-zinc-300"
                    >
                      📞 {clienteDetalle.telefono}
                    </a>
                  </div>
                )}

                {/* Saldo pendiente */}
                {clienteDetalle.saldo > 0 && (
                  <div>
                    <p className="text-zinc-500 text-xs font-semibold mb-1">SALDO PENDIENTE</p>
                    <p className="text-red-400 text-xl font-bold">
                      ${Number(clienteDetalle.saldo).toLocaleString('es-CO')}
                    </p>
                  </div>
                )}

                {/* Últimas visitas hoy */}
                <div>
                  <p className="text-zinc-500 text-xs font-semibold mb-2">VISITAS HOY</p>
                  {visitasDetalle.length === 0 ? (
                    <p className="text-zinc-600 text-xs">Sin visitas registradas hoy</p>
                  ) : (
                    <div className="space-y-1.5">
                      {visitasDetalle.slice(-3).map((v: any) => (
                        <div
                          key={v.id}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-2"
                        >
                          <span className="text-sm">
                            {v.tipo === 'venta' ? '💰' : v.tipo === 'cobro' ? '💵' : v.tipo === 'entrega' ? '📦' : '👁️'}
                          </span>
                          <span className="text-zinc-300 text-xs capitalize flex-1">{v.tipo}</span>
                          {v.monto && (
                            <span className="text-emerald-400 text-xs font-semibold">
                              ${Number(v.monto).toLocaleString('es-CO')}
                            </span>
                          )}
                          <span className="text-zinc-600 text-xs">
                            {new Date(v.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: botones acción */}
              <div className="p-4 border-t border-zinc-800 flex-shrink-0 space-y-2">
                {/* Registrar visita con dropdown de tipo */}
                <div className="relative">
                  <div className="flex">
                    <button
                      onClick={() => {
                        setTipoModal(undefined)
                        setClienteModal(clienteDetalle)
                        setShowTipoDropdown(false)
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-l-xl text-sm transition-colors"
                    >
                      + Registrar visita
                    </button>
                    <button
                      onClick={() => setShowTipoDropdown(v => !v)}
                      className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-2.5 rounded-r-xl border-l border-emerald-500 transition-colors text-xs"
                    >
                      ▾
                    </button>
                  </div>
                  {showTipoDropdown && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl z-10">
                      {TIPOS.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setTipoModal(t.id)
                            setClienteModal(clienteDetalle)
                            setShowTipoDropdown(false)
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors flex items-center gap-2"
                        >
                          <span>{t.icon}</span> {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Llamar + WhatsApp */}
                {clienteDetalle.telefono && (
                  <div className="flex gap-2">
                    <a
                      href={`tel:${clienteDetalle.telefono}`}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-sm text-center transition-colors"
                    >
                      📞 Llamar
                    </a>
                    <a
                      href={`https://wa.me/${clienteDetalle.telefono.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-sm text-center transition-colors"
                    >
                      💬 WhatsApp
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal visita (compartido mobile + desktop) */}
      {(() => {
        const esDespacho = clienteModal?.notas?.startsWith('Bodega/')
        const numFactura = esDespacho ? clienteModal.notas.split('/')[1] : undefined
        const extraData: Record<string, any> = {}
        if (clienteModal?.ordenDespachoId) extraData.ordenDespachoId = clienteModal.ordenDespachoId
        if (numFactura) extraData.facturaPreset = numFactura
        return (
          <ModalVisita
            key={(clienteModal?.id || 'sin-cliente') + (tipoModal || '')}
            open={!!clienteModal}
            onClose={() => { setClienteModal(null); setTipoModal(undefined) }}
            onRegistrado={loadData}
            clienteInicial={clienteModal}
            tipoForzado={tipoModal ?? (esDespacho ? 'entrega' : undefined)}
            puedeCapturarGps={puedeCapturarGps}
            titulo={esDespacho ? `📦 Entrega — Factura #${numFactura}` : (tipoModal ? TIPOS.find(t => t.id === tipoModal)?.label : 'Registrar visita')}
            extraData={extraData}
            facturaPreset={numFactura}
          />
        )
      })()}
    </>
  )
}
