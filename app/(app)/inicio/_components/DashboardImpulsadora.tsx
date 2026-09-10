'use client'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { DIAS } from '@/lib/constants'
import { distanciaMetros } from '@/lib/gps'

export default function DashboardImpulsadora() {
  const { data: session } = useSession()
  const user = session?.user as any
  const [rutaHoy, setRutaHoy] = useState<any>(null)
  const [llegadas, setLlegadas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [registrando, setRegistrando] = useState(false)
  const [error, setError] = useState('')
  const [ordenLocal, setOrdenLocal] = useState<string[]>([])
  const [popupRc, setPopupRc] = useState<any>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const res = await fetch('/api/impulsadora/hoy')
    const data = await res.json()
    if (data) {
      setRutaHoy(data.rutaFija)
      setLlegadas(data.llegadasHoy || [])
    }
    setLoading(false)
  }

  async function getUbicacionConRetry(clienteLat?: number, clienteLng?: number): Promise<{lat: number, lng: number} | null> {
    function obtenerPos(highAccuracy: boolean, maxAge: number, timeout: number) {
      return new Promise<{lat: number, lng: number} | null>(resolve => {
        if (!navigator.geolocation) { resolve(null); return }
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { timeout, enableHighAccuracy: highAccuracy, maximumAge: maxAge }
        )
      })
    }
    const rapida = await obtenerPos(false, 30000, 3000)
    if (!rapida) return await obtenerPos(true, 0, 10000)
    if (!clienteLat || !clienteLng) return rapida
    const dist = distanciaMetros(rapida.lat, rapida.lng, clienteLat, clienteLng)
    if (dist <= 20) return rapida
    const precisa = await obtenerPos(true, 0, 10000)
    if (!precisa) return rapida
    const dist2 = distanciaMetros(precisa.lat, precisa.lng, clienteLat, clienteLng)
    return dist2 < dist ? precisa : rapida
  }

  function getPuntoActual() {
    if (!rutaHoy) return null
    // Prioridad 1: quien ya tiene entrada pero no salida (está dentro), sin importar orden
    const dentro = rutaHoy.clientes.find((rc: any) => {
      const entradas = llegadas.filter((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'entrada')
      const salidas = llegadas.filter((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'salida')
      return entradas.length > 0 && salidas.length === 0
    })
    if (dentro) return { rc: dentro, estado: 'dentro' }
    // Prioridad 2: siguiente pendiente según ordenLocal
    const priorizados = ordenLocal.filter(id => rutaHoy.clientes.some((rc: any) => rc.id === id))
    const resto = rutaHoy.clientes.filter((rc: any) => !priorizados.includes(rc.id))
    const ordenados = [
      ...priorizados.map((id: string) => rutaHoy.clientes.find((rc: any) => rc.id === id)),
      ...resto
    ]
    for (const rc of ordenados) {
      const entradas = llegadas.filter((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'entrada')
      const salidas = llegadas.filter((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'salida')
      if (entradas.length === 0 && salidas.length === 0) return { rc, estado: 'pendiente' }
    }
    return null
  }

  async function registrar(tipo: string, rc: any) {
    setRegistrando(true)
    setError('')
    const ubicacion = await getUbicacionConRetry(rc.cliente.lat, rc.cliente.lng)
    let distanciaFinal = 0
    let fueraDeRango = false
    if (ubicacion && rc.cliente.lat && rc.cliente.lng) {
      distanciaFinal = Math.round(distanciaMetros(ubicacion.lat, ubicacion.lng, rc.cliente.lat, rc.cliente.lng))
      if (distanciaFinal > 20) fueraDeRango = true
    }
    await fetch('/api/visitas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: rc.cliente.id, tipo, rutaFijaClienteId: rc.id, ...ubicacion })
    })
    if (fueraDeRango) {
      setError('Registrado pero estas a ' + distanciaFinal + 'm del punto (max 20m)')
      await fetch('/api/push/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: 'Alerta GPS fuera de rango', mensaje: user?.name + ' marco ' + tipo + ' en ' + rc.cliente.nombre + ' desde ' + distanciaFinal + 'm' })
      })
    }
    setRegistrando(false)
    loadData()
  }

  if (loading) return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="shimmer h-8 w-1/2 rounded-xl" />
      <div className="shimmer h-32 rounded-2xl" />
      {Array.from({length: 5}).map((_,i) => (
        <div key={i} className="shimmer rounded-2xl h-20" />
      ))}
    </div>
  )

  const puntoActual = getPuntoActual()
  const completados = rutaHoy ? rutaHoy.clientes.filter((rc: any) => llegadas.filter((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'salida').length > 0).length : 0
  const total = rutaHoy?.clientes?.length || 0

  return (
    <div data-tour="imp-page" className="max-w-2xl mx-auto space-y-6 pb-24 md:pb-0">
      <div>
        <h1 className="text-lg font-bold text-white">Hola, {user?.name}</h1>
        <p className="text-zinc-400 text-sm">{DIAS[new Date().getDay()]} - {new Date().toLocaleDateString('es-CO', {day:'numeric', month:'long', timeZone: 'America/Bogota'})}</p>
      </div>

      {!rutaHoy ? (
        <div data-tour="imp-contenido" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center space-y-3">
          <p className="text-3xl">📌</p>
          <p className="text-white font-semibold">Sin ruta asignada hoy</p>
          <p className="text-zinc-400 text-sm">Tu supervisor aun no ha configurado tu ruta para hoy</p>
        </div>
      ) : (
        <div data-tour="imp-contenido" className="space-y-4">
          <div data-tour="imp-progreso" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white font-semibold">Progreso del dia</p>
              <p className="text-emerald-400 font-bold">{completados}/{total}</p>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{width: total > 0 ? (completados/total*100)+'%' : '0%'}} />
            </div>
          </div>

          {puntoActual ? (
            <div data-tour="imp-punto" className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
              <div>
                <p className="text-zinc-400 text-xs font-semibold mb-1">
                  {puntoActual.estado === 'pendiente' ? 'PROXIMO PUNTO' : 'EN PUNTO'}
                </p>
                <p className="text-white text-lg font-bold">{puntoActual.rc.cliente.nombre}</p>
                {puntoActual.rc.cliente.nombreComercial && (
                  <p className="text-zinc-400 text-sm">{puntoActual.rc.cliente.nombreComercial}</p>
                )}
                {puntoActual.rc.cliente.direccion && (
                  <p className="text-zinc-500 text-sm mt-1">{puntoActual.rc.cliente.direccion}</p>
                )}
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              <button
                data-tour="imp-boton"
                onClick={() => registrar(puntoActual.estado === 'pendiente' ? 'entrada' : 'salida', puntoActual.rc)}
                disabled={registrando}
                className={'w-full font-bold py-5 rounded-2xl text-lg transition-all disabled:opacity-40 ' + (puntoActual.estado === 'pendiente' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-orange-500 hover:bg-orange-400 text-white')}>
                {registrando ? 'Obteniendo GPS...' : puntoActual.estado === 'pendiente' ? 'Registrar Entrada' : 'Registrar Salida'}
              </button>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center space-y-2">
              <p className="text-3xl">🎉</p>
              <p className="text-white font-bold text-lg">Ruta completada</p>
              <p className="text-zinc-400 text-sm">Visitaste todos los puntos del dia</p>
            </div>
          )}

          <div data-tour="imp-lista" className="space-y-2">
            <p className="text-zinc-400 text-xs font-semibold">TODOS LOS PUNTOS</p>
            {(() => {
              const priorizados = ordenLocal.filter(id => rutaHoy.clientes.some((rc: any) => rc.id === id))
              const resto = rutaHoy.clientes.filter((rc: any) => !priorizados.includes(rc.id))
              const clientesOrdenados = [
                ...priorizados.map((id: string) => rutaHoy.clientes.find((rc: any) => rc.id === id)),
                ...resto
              ]
              return clientesOrdenados.map((rc: any, i: number) => {
                const entrada = llegadas.find((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'entrada')
                const salida = llegadas.find((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'salida')
                const yaVisitado = !!salida
                const puedeIrPrimero = rutaHoy.priorizableHoy && !yaVisitado && !entrada
                return (
                  <div key={rc.id} className="relative">
                    <div className={'rounded-xl p-3 flex items-center gap-3 border ' + (salida ? 'bg-zinc-900/50 border-zinc-700/30' : entrada ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-900 border-zinc-800')}>
                      <div className={'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ' + (salida ? 'bg-zinc-700 text-zinc-400' : entrada ? 'bg-emerald-500 text-black' : 'bg-zinc-700 text-white')}>
                        {salida ? 'ok' : entrada ? '>' : i+1}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                        <p className={'text-[13px] font-medium truncate flex-1 min-w-0 ' + (salida ? 'text-zinc-500' : 'text-white')}>{rc.cliente.nombre}</p>
                        {entrada
                          ? <span className="text-emerald-400 text-xs flex-shrink-0">{new Date(entrada.createdAt).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', timeZone: 'America/Bogota'})}</span>
                          : rc.horaEntrada
                            ? <span className="text-white text-xs flex-shrink-0">{(() => { const [h,m] = rc.horaEntrada.split(':').map(Number); const ampm = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12; return `🕓 ${h12}:${String(m).padStart(2,'0')}${ampm}` })()}</span>
                            : null
                        }
                      </div>
                      {salida && entrada && (
                        <span className="text-zinc-500 text-xs flex-shrink-0">
                          {Math.round((new Date(salida.createdAt).getTime() - new Date(entrada.createdAt).getTime()) / 60000)} min
                        </span>
                      )}
                      {puedeIrPrimero && (
                        <button
                          onClick={() => setPopupRc(popupRc?.id === rc.id ? null : rc)}
                          className="text-base flex-shrink-0 ml-1">
                          🔂
                        </button>
                      )}
                    </div>
                    {popupRc?.id === rc.id && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl px-4 py-3 flex items-center gap-2 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setOrdenLocal(prev => [rc.id, ...prev.filter(id => id !== rc.id)])
                            setPopupRc(null)
                          }}
                          className="text-sm font-semibold text-white flex items-center gap-2">
                          🔂 Asignar primero
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
