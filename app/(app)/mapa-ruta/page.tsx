'use client'
import dynamic from 'next/dynamic'
import TarjetaVisita from '@/components/TarjetaVisita'
import React, { useEffect, useState } from 'react'
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
  const [rutaIniciada, setRutaIniciada] = useState(false)
  const [distanciaLejos, setDistanciaLejos] = useState(false)

  const [detalleId, setDetalleId] = useState<string|null>(null)
  const entregadosRef = React.useRef<any[]>([])

  const TIPOS = [
    { id: 'visita', label: 'Visita', icon: '📍' },
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
    const data = await fetch('/api/rutas/mi-ruta?todos=1').then(r => r.json())
    const rutaRes = data?.rutaHoy ?? null
    const hoyStr = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
    const fechaRuta = rutaRes?.fecha ? new Date(new Date(rutaRes.fecha).getTime() - 5*60*60*1000).toISOString().split('T')[0] : hoyStr
    const visitasRes = await fetch(`/api/visitas/todas?fecha=${fechaRuta}`).then(r => r.json())
    setRuta(rutaRes)
    setRutaIniciada(rutaRes?.iniciada === true)
    const visitas2 = Array.isArray(visitasRes) ? visitasRes : (visitasRes?.visitas ?? [])
    setClientesOrdenados(rutaRes?.clientes?.map((rc: any) => {
      const notas = rc.notas || null
      const mN = notas?.match(/#(\d+)/); const mE = notas?.match(/^Bodega\/([^#]+)/)
      return { ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null, ordenNumero: rc.ordenNumero || null, notas, ordenDespachoId: rc.ordenDespachoId || null, ordenEstado: rc.ordenEstado || null, numeroFactura: mN ? mN[1] : null, empresaOrigen: mE ? mE[1].trim() : null }
    }) || [])
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
    // Fuente de verdad: ordenEstado o visita del día
    const cliente = clientesOrdenados.find(c => c.id === clienteId)
    if (cliente?.ordenEstado === 'entregado') return true
    return visitas.some(v => {
      if (v.clienteId !== clienteId) return false
      const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      return fv === fechaRuta
    })
  }

  // Auto-optimizar al tener ubicacion y clientes listos
  useEffect(() => {
    const pendientes = clientesOrdenados.filter(c => !ejecutado(c.id))
    if (ubicacion && pendientes.length >= 2 && !optimizando && filtro === 'pendientes') {
      optimizar()
    }
  }, [ubicacion, clientesOrdenados.length, filtro])

  async function optimizar() {
    if (!ruta?.clientes || !ubicacion) return
    setOptimizando(true)
    const clientes = ruta.clientes.map((rc: any) => {
      const notas = rc.notas || null
      const mN = notas?.match(/#(\d+)/); const mE = notas?.match(/^Bodega\/([^#]+)/)
      return { ...rc.cliente, supervisorEtiqueta: rc.supervisorEtiqueta || null, ordenNumero: rc.ordenNumero || null, notas, ordenDespachoId: rc.ordenDespachoId || null, ordenEstado: rc.ordenEstado || null, numeroFactura: mN ? mN[1] : null, empresaOrigen: mE ? mE[1].trim() : null }
    })
    const res = await fetch('/api/rutas/optimizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientes, latInicio: ubicacion.lat, lngInicio: ubicacion.lng })
    }).then(r => r.json())
    setOptimizando(false)
    if (res.orden) {
      // Preservar ordenEstado al reordenar — es la fuente de verdad
      setClientesOrdenados(res.orden.map((c: any) => {
        const original = clientesOrdenados.find((o: any) => o.id === c.id)
        return { ...c, ordenEstado: original?.ordenEstado || c.ordenEstado || null }
      }))
    }
  }

  if (loading) return (
    <div className="p-4 space-y-4">
      <div className="shimmer h-8 w-1/2 rounded-xl" />
      <div className="shimmer rounded-2xl h-64" />
      {Array.from({length: 3}).map((_,i) => (
        <div key={i} className="shimmer rounded-2xl h-20" />
      ))}
    </div>
  )
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
  }).sort((a, b) => {
    const eA = ejecutado(a.id)
    const eB = ejecutado(b.id)
    if (eA !== eB) return eA ? 1 : -1
    return 0
  })

  return (
    <div className="pb-20 md:pb-0">
      <div className="flex items-center gap-3 p-3 border-b border-zinc-800 flex-shrink-0">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white text-lg">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base">Ruta de hoy</p>
          <p className="text-zinc-400 text-sm mt-0.5">{ejecutados} ejecutadas · {pendientes} pendientes</p>
        </div>

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

      <div style={{height:'55vh', marginBottom:'12px'}}>
        {clientesFiltrados.length > 0 ? (
          <MapaRutaVivo
            clientes={clientesFiltrados}
            clientesEjecutados={clientesEjecutadosIds}
            ubicacionInicio={ubicacion}
            onClienteClick={(c) => {
              if (isEntregas && !rutaIniciada) return
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

      <div className="space-y-2">

        {clientesFiltrados.map((c: any) => {
          const esEjecutado = clientesEjecutadosIds.includes(c.id)
          const expandido = detalleId === c.id
          const visitasCliente = visitas.filter((v: any) => {
            if (v.clienteId !== c.id) return false
            const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
            return fv === fechaRuta
          })
          const idx = clientesFiltrados.indexOf(c) + 1
          const notaBodega = c.empresaOrigen
            ? `Bodega/${c.empresaOrigen}${c.numeroFactura ? ` F_${c.numeroFactura}` : ''}`
            : c.numeroFactura ? `F_${c.numeroFactura}` : c.notas || null

          function abrirEntrega() {
            if (esEjecutado) return
            if (isEntregas && !rutaIniciada) return
            setClienteModal(c)
            if (ubicacion && (c.lat || c.latTmp) && (c.lng || c.lngTmp)) {
              const cLat = c.lat || c.latTmp; const cLng = c.lng || c.lngTmp
              const R = 6371000
              const dLat = (cLat - ubicacion.lat) * Math.PI / 180
              const dLng = (cLng - ubicacion.lng) * Math.PI / 180
              const a = Math.sin(dLat/2)**2 + Math.cos(ubicacion.lat*Math.PI/180)*Math.cos(cLat*Math.PI/180)*Math.sin(dLng/2)**2
              setDistanciaLejos(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) > 300)
            } else { setDistanciaLejos(false) }
          }

          return (
            <div key={c.id}
              onClick={abrirEntrega}
              className={"rounded-xl border px-3 py-2.5 w-full flex items-center gap-3 " + (esEjecutado ? "bg-zinc-900 border-zinc-700/30" : "bg-zinc-900 border-zinc-800 cursor-pointer active:opacity-80")}>
              {/* Número — span 3 filas */}
              <span className={"w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 self-center " + (esEjecutado ? "bg-emerald-600 text-white" : "bg-blue-600 text-white")}>
                {esEjecutado ? '✓' : idx}
              </span>
              {/* Contenido 3 líneas */}
              <div className="flex-1 min-w-0">
                <p className={"font-semibold text-sm truncate " + (esEjecutado ? "text-zinc-400" : "text-white")}>{c.nombre}</p>
                {c.direccion && <p className="text-white text-xs truncate">{c.direccion}</p>}
                <div className="flex items-center justify-between">
                  {notaBodega && <p className="text-white text-xs truncate flex-1">{notaBodega}</p>}
                  {c.telefono && (
                    <a href={"tel:" + c.telefono} onClick={e => e.stopPropagation()}
                      className="text-red-400 text-xs flex-shrink-0 ml-2">✆ {c.telefono}</a>
                  )}
                </div>
              </div>
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
        facturaPreset={clienteModal?.numeroFactura || undefined}
        empresaOrigen={clienteModal?.empresaOrigen || undefined}
        extraData={clienteModal?.ordenDespachoId ? { ordenDespachoId: clienteModal.ordenDespachoId } : {}}
      />
    </div>
  )
}
