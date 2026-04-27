'use client'
import dynamic from 'next/dynamic'
import TarjetaVisita from '@/components/TarjetaVisita'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import ModalVisita from '@/components/ModalVisita'
import FirmaCanvas from '@/components/FirmaCanvas'

const MapaRutaVivo = dynamic(() => import('./MapaRutaVivo'), { ssr: false })

export default function MapaRutaPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const user = session?.user as any
  const isEntregas = user?.role === 'entregas'

  const [ruta, setRuta] = useState<any>(null)
  const [visitas, setVisitas] = useState<any[]>([])
  const [ubicacion, setUbicacion] = useState<{lat: number, lng: number} | null>(null)
  const [optimizando, setOptimizando] = useState(false)
  const [clientesOrdenados, setClientesOrdenados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'pendientes'|'ejecutadas'|'todas'>('pendientes')

  // Modal visita
  const [clienteModal, setClienteModal] = useState<any>(null)
  const [distanciaLejos, setDistanciaLejos] = useState(false)

  const [detalleId, setDetalleId] = useState<string|null>(null)

  const TIPOS = [
    { id: 'visita', label: 'Visita', icon: '👁️' },
    { id: 'venta', label: 'Venta', icon: '💰' },
    { id: 'cobro', label: 'Cobro', icon: '💵' },
    { id: 'entrega', label: 'Entrega', icon: '📦' },
  ]

  useEffect(() => {
    loadData()
    navigator.geolocation?.getCurrentPosition(
      pos => setUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 10000, enableHighAccuracy: true }
    )
  }, [])

  async function loadData() {
    const rutaRes = await fetch('/api/rutas/mi-ruta').then(r => r.json())
    const hoyStr = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
    const fechaRuta = rutaRes?.fecha ? new Date(new Date(rutaRes.fecha).getTime() - 5*60*60*1000).toISOString().split('T')[0] : hoyStr
    const visitasRes = await fetch(`/api/visitas/todas?fecha=${fechaRuta}`).then(r => r.json())
    setRuta(rutaRes)
    setClientesOrdenados(rutaRes?.clientes?.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null })) || [])
    setVisitas(Array.isArray(visitasRes) ? visitasRes : (visitasRes?.visitas ?? []))
    setLoading(false)
  }

  function navegarRuta() {
    const pendientesList = clientesOrdenados.filter(c => !ejecutado(c.id))
    const paradas = pendientesList
      .map(c => {
        const lat = c.lat || c.latTmp
        const lng = c.lng || c.lngTmp
        if (lat && lng) return `${lat},${lng}`
        if (c.maps) return encodeURIComponent(c.maps)
        if (c.direccion) return encodeURIComponent(c.direccion)
        return null
      })
      .filter(Boolean)
    if (paradas.length === 0) return
    const origen = ubicacion ? `${ubicacion.lat},${ubicacion.lng}` : ''
    const url = `https://www.google.com/maps/dir/${origen ? origen + '/' : ''}${paradas.join('/')}`
    window.open(url, '_blank')
  }

  async function getUbicacion(): Promise<{lat: number, lng: number} | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
      )
    })
  }


  const hoyStr = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
  const fechaRuta = ruta?.fecha ? new Date(new Date(ruta.fecha).getTime() - 5*60*60*1000).toISOString().split('T')[0] : hoyStr

  function ejecutado(clienteId: string) {
    return visitas.some(v => {
      if (v.clienteId !== clienteId) return false
      const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      return fv === fechaRuta
    })
  }

  // Auto-optimizar al tener ubicacion y clientes listos
  useEffect(() => {
    if (ubicacion && clientesOrdenados.length >= 2 && !optimizando) {
      optimizar()
    }
  }, [ubicacion, clientesOrdenados.length])

  async function optimizar() {
    if (!ruta?.clientes || !ubicacion) return
    setOptimizando(true)
    const clientes = ruta.clientes.map((rc: any) => ({ ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null }))
    const res = await fetch('/api/rutas/optimizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientes, latInicio: ubicacion.lat, lngInicio: ubicacion.lng })
    }).then(r => r.json())
    setOptimizando(false)
    if (res.orden) setClientesOrdenados(res.orden)
  }

  if (loading) return <div className="p-8 text-zinc-400 text-center">Cargando mapa...</div>
  if (!ruta) return <div className="p-8 text-zinc-400 text-center">Sin ruta asignada</div>

  function etiquetaColor(etiqueta: string): string {
    let hash = 0
    for (let i = 0; i < etiqueta.length; i++) hash = etiqueta.charCodeAt(i) + ((hash << 5) - hash)
    const h = Math.abs(hash) % 360
    return `hsl(${h}, 70%, 45%)`
  }

  const clientesConGps = clientesOrdenados.filter(c => c.lat && c.lng)
  const ejecutados = clientesOrdenados.filter(c => ejecutado(c.id)).length
  const pendientes = clientesOrdenados.length - ejecutados

  const clientesEjecutadosIds = clientesOrdenados.filter(c => ejecutado(c.id)).map(c => c.id)
  const clientesFiltrados = clientesOrdenados.filter(c => {
    if (filtro === 'pendientes') return !ejecutado(c.id)
    if (filtro === 'ejecutadas') return ejecutado(c.id)
    return true
  })

  return (
    <div className="pb-20 md:pb-0">
      <div className="flex items-center gap-3 p-3 border-b border-zinc-800 flex-shrink-0">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white text-lg">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base truncate">{ruta.nombre}</p>
          <p className="text-zinc-400 text-sm mt-0.5">{ejecutados} ejecutadas · {pendientes} pendientes</p>
        </div>
        {clientesConGps.length >= 2 && (
          <button onClick={optimizar} disabled={optimizando || !ubicacion}
            className={"font-semibold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 " + (optimizando ? "bg-zinc-700 text-zinc-400" : "bg-emerald-600 text-white hover:bg-emerald-500")}>
            {optimizando ? <span>Calculando...</span> : <><span style={{fontSize:'18px'}}>🤖</span><span style={{fontSize:'13px',fontWeight:'bold'}}> IA</span></>}
          </button>
        )}
        {clientesOrdenados.filter(c => !ejecutado(c.id)).length > 0 && (
          <button onClick={navegarRuta}
            className="font-semibold px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-1.5">
            <span style={{fontSize:'18px'}}>🧭</span>
          </button>
        )}
      </div>

      <div className="flex gap-1 p-2 border-b border-zinc-800 flex-shrink-0">
        {(['pendientes','ejecutadas','todas'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={"flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors " + (filtro === f ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white")}>
            {f === 'pendientes' ? '⏳ Pendientes' : f === 'ejecutadas' ? '✅ Ejecutadas' : '🗺 Todas'}
          </button>
        ))}
      </div>

      <div style={{height:'55vh'}}>
        {clientesFiltrados.length > 0 ? (
          <MapaRutaVivo
            clientes={clientesFiltrados}
            clientesEjecutados={clientesEjecutadosIds}
            ubicacionInicio={ubicacion}
            onClienteClick={(c) => {
              setClienteModal(c)
              if (ubicacion && (c.lat || c.latTmp) && (c.lng || c.lngTmp)) {
                const cLat = c.lat || c.latTmp
                const cLng = c.lng || c.lngTmp
                const R = 6371000
                const dLat = (cLat - ubicacion.lat) * Math.PI / 180
                const dLng = (cLng - ubicacion.lng) * Math.PI / 180
                const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(ubicacion.lat*Math.PI/180)*Math.cos(cLat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2)
                const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
                setDistanciaLejos(dist > 300)
              } else { setDistanciaLejos(false) }
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-400 text-sm">{filtro === 'pendientes' ? '✅ Todos los puntos ejecutados' : 'Sin puntos en este filtro'}</p>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <p className="text-zinc-400 text-xs font-semibold">
          {filtro === 'pendientes' ? '⏳ PENDIENTES' : filtro === 'ejecutadas' ? '✅ EJECUTADAS' : '🗺 TODOS'}
          {' '}{clientesFiltrados.length} punto{clientesFiltrados.length !== 1 ? 's' : ''}
        </p>
        {clientesFiltrados.map((c: any) => {
          const esEjecutado = clientesEjecutadosIds.includes(c.id)
          const expandido = detalleId === c.id
          const visitasCliente = visitas.filter((v: any) => {
            if (v.clienteId !== c.id) return false
            const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
            return fv === fechaRuta
          })
          return (
            <div key={c.id} className={"rounded-xl border overflow-hidden " + (esEjecutado ? "bg-zinc-900 border-zinc-700/30" : "bg-zinc-900 border-zinc-800")}>
              <div className="flex items-center gap-3 p-3" onClick={() => esEjecutado && setDetalleId(expandido ? null : c.id)} style={{cursor: esEjecutado ? 'pointer' : 'default'}}>
                <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 " + (esEjecutado ? "bg-emerald-600" : "bg-blue-600")} style={{color:'white'}}>
                  {esEjecutado ? '✓' : clientesFiltrados.indexOf(c) + 1}
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
                </div>
                {esEjecutado ? (
                  <span className="text-zinc-500 text-xs flex-shrink-0">{expandido ? '▲' : '▼'}</span>
                ) : (
                  <button onClick={(e) => { e.stopPropagation()
                    setClienteModal(c)
                    if (ubicacion && (c.lat || c.latTmp) && (c.lng || c.lngTmp)) {
                      const cLat = c.lat || c.latTmp
                      const cLng = c.lng || c.lngTmp
                      const R = 6371000
                      const dLat = (cLat - ubicacion.lat) * Math.PI / 180
                      const dLng = (cLng - ubicacion.lng) * Math.PI / 180
                      const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(ubicacion.lat*Math.PI/180)*Math.cos(cLat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2)
                      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
                      setDistanciaLejos(dist > 300)
                    } else { setDistanciaLejos(false) }
                  }}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0">
                    {isEntregas ? '📦' : '+ Visita'}
                  </button>
                )}
              </div>
              {expandido && (
                <div className="border-t border-zinc-800 px-3 pb-3 pt-2 space-y-2">
                  {visitasCliente.length > 0 ? visitasCliente.map((v: any) => (
                    <TarjetaVisita key={v.id} visita={v} mostrarCliente={false} />
                  )) : (
                    <p className="text-zinc-500 text-xs text-center py-2">Sin visitas registradas hoy</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {clientesFiltrados.length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-4">
            {filtro === 'pendientes' ? '✅ Todos ejecutados' : 'Sin puntos'}
          </p>
        )}
      </div>

      <ModalVisita
        key={clienteModal?.id || 'sin-cliente'}
        open={!!clienteModal}
        onClose={() => setClienteModal(null)}
        onRegistrado={loadData}
        clienteInicial={clienteModal}
        tipoForzado={isEntregas ? 'entrega' : undefined}
        distanciaLejos={isEntregas && distanciaLejos}
        titulo={isEntregas ? 'Registrar entrega' : 'Registrar visita'}
      />
    </div>
  )
}
