'use client'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { DIAS } from '@/lib/constants'
import { distanciaMetros } from '@/lib/gps'

export default function ImpulsoDashboard() {
  const { data: session } = useSession()
  const user = session?.user as any
  const [rutaHoy, setRutaHoy] = useState<any>(null)
  const [llegadas, setLlegadas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [registrando, setRegistrando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const res = await fetch('/api/rutas-fijas/hoy')
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
    for (const rc of rutaHoy.clientes) {
      const entradas = llegadas.filter((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'entrada')
      const salidas = llegadas.filter((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'salida')
      if (entradas.length === 0) return { rc, estado: 'pendiente' }
      if (salidas.length === 0) return { rc, estado: 'dentro' }
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

  if (loading) return <div className="p-8 text-zinc-400 text-center">Cargando...</div>

  const puntoActual = getPuntoActual()
  const completados = rutaHoy ? rutaHoy.clientes.filter((rc: any) => llegadas.filter((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'salida').length > 0).length : 0
  const total = rutaHoy?.clientes?.length || 0

  return (
    <div className="max-w-md mx-auto space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white">Hola, {user?.name}</h1>
        <p className="text-zinc-400 text-sm">{DIAS[new Date().getDay()]} - {new Date().toLocaleDateString('es-CO', {day:'numeric', month:'long'})}</p>
      </div>

      {!rutaHoy ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center space-y-3">
          <p className="text-3xl">📌</p>
          <p className="text-white font-semibold">Sin ruta asignada hoy</p>
          <p className="text-zinc-400 text-sm">Tu supervisor aun no ha configurado tu ruta para hoy</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white font-semibold">Progreso del dia</p>
              <p className="text-emerald-400 font-bold">{completados}/{total}</p>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{width: total > 0 ? (completados/total*100)+'%' : '0%'}} />
            </div>
          </div>

          {puntoActual ? (
            <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
              <div>
                <p className="text-zinc-400 text-xs font-semibold mb-1">
                  {puntoActual.estado === 'pendiente' ? 'PROXIMO PUNTO' : 'EN PUNTO'}
                </p>
                <p className="text-white text-xl font-bold">{puntoActual.rc.cliente.nombre}</p>
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

          <div className="space-y-2">
            <p className="text-zinc-400 text-xs font-semibold">TODOS LOS PUNTOS</p>
            {rutaHoy.clientes.map((rc: any, i: number) => {
              const entrada = llegadas.find((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'entrada')
              const salida = llegadas.find((l: any) => l.rutaFijaClienteId === rc.id && l.tipo === 'salida')
              return (
                <div key={rc.id} className={'rounded-xl p-3 flex items-center gap-3 border ' + (salida ? 'bg-zinc-900/50 border-zinc-700/30' : entrada ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-900 border-zinc-800')}>
                  <div className={'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ' + (salida ? 'bg-zinc-700 text-zinc-400' : entrada ? 'bg-emerald-500 text-black' : 'bg-zinc-700 text-white')}>
                    {salida ? 'ok' : entrada ? '>' : i+1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={'text-sm font-medium ' + (salida ? 'text-zinc-500' : 'text-white')}>{rc.cliente.nombre}</p>
                    {entrada && <p className="text-zinc-500 text-xs">Entrada: {new Date(entrada.createdAt).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}</p>}
                    {salida && <p className="text-zinc-500 text-xs">Salida: {new Date(salida.createdAt).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}</p>}
                  </div>
                  {salida && entrada && (
                    <span className="text-zinc-500 text-xs flex-shrink-0">
                      {Math.round((new Date(salida.createdAt).getTime() - new Date(entrada.createdAt).getTime()) / 60000)} min
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
