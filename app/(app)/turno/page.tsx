'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function TurnoPage() {
  const router = useRouter()
  const [turno, setTurno]         = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [accionando, setAccionando] = useState(false)

  useEffect(() => { loadTurno() }, [])

  async function loadTurno() {
    const res = await fetch('/api/turnos')
    const data = await res.json()
    setTurno(data)
    setLoading(false)
  }

  async function getUbicacion(): Promise<{lat: number, lng: number} | null> {
    const { obtenerGpsMejor } = await import('@/lib/gps')
    const pos = await obtenerGpsMejor()
    if (!pos) return null
    return { lat: pos.lat, lng: pos.lng }
  }

  async function iniciarTurno() {
    setAccionando(true)
    const ubicacion = await getUbicacion()
    await fetch('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'iniciar', ...ubicacion })
    })
    await loadTurno()
    setAccionando(false)
  }

  async function cerrarTurno() {
    const [rutaRes, visitasRes] = await Promise.all([
      fetch('/api/rutas/mi-ruta').then(r => r.json()),
      fetch('/api/visitas/todas').then(r => r.json()),
    ])
    if (rutaRes?.clientes?.length > 0) {
      const fechaRuta = rutaRes.fecha ? new Date(new Date(rutaRes.fecha).getTime() - 5*60*60*1000).toISOString().split('T')[0] : new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
      const visitas = Array.isArray(visitasRes) ? visitasRes : []
      const ejecutados = rutaRes.clientes.filter((rc: any) =>
        visitas.some((v: any) => {
          if (v.clienteId !== rc.cliente.id) return false
          const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
          return fv === fechaRuta
        })
      ).length
      const total = rutaRes.clientes.length
      const pct = Math.round((ejecutados / total) * 100)
      if (pct < 100) {
        if (!confirm(`Ruta incompleta: ${ejecutados}/${total} clientes (${pct}%). ¿Cerrar turno de todas formas?`)) return
      } else {
        if (!confirm('Ruta completada al 100%. ¿Cerrar turno?')) return
      }
    } else {
      if (!confirm('¿Cerrar turno?')) return
    }
    setAccionando(true)
    const ubicacion = await getUbicacion()
    await fetch('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'cerrar', ...ubicacion })
    })
    setTurno(null)
    setAccionando(false)
  }

  function duracion(inicio: string) {
    const diff = Date.now() - new Date(inicio).getTime()
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    return `${h}h ${m}m`
  }

  if (loading) return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <div className="shimmer h-8 w-1/3 rounded-xl" />
      <div className="shimmer h-40 rounded-2xl" />
      <div className="shimmer h-12 rounded-2xl" />
    </div>
  )

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-24 md:pb-0 p-4">

      {/* Card turno activo */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
        <p className="text-white font-bold text-base">⏱ Turno</p>

        {turno ? (
          <>
            <div className="text-center space-y-1">
              <p className="text-emerald-400 text-3xl font-bold font-mono">{duracion(turno.inicio)}</p>
              <p className="text-zinc-500 text-xs">
                Iniciado {turno.inicioBogota || new Date(turno.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
              </p>
              {turno.pausado && (
                <span className="inline-block bg-amber-500/20 text-amber-400 text-xs px-3 py-1 rounded-full">⏸ En pausa — {turno.pausaMotivo}</span>
              )}
            </div>
            <button onClick={cerrarTurno} disabled={accionando}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-50">
              {accionando ? 'Cerrando...' : '🔴 Cerrar turno'}
            </button>
          </>
        ) : (
          <>
            <p className="text-zinc-500 text-sm text-center">No tienes un turno activo</p>
            <button onClick={iniciarTurno} disabled={accionando}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors disabled:opacity-50">
              {accionando ? 'Iniciando...' : '🟢 Iniciar turno'}
            </button>
          </>
        )}
      </div>

      {/* Botón historial */}
      <Link href="/historial-turnos"
        className="flex items-center justify-between w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-white hover:bg-zinc-800 transition-colors">
        <span className="font-semibold text-sm">📋 Ver historial de turnos</span>
        <span className="text-zinc-500">›</span>
      </Link>

    </div>
  )
}
