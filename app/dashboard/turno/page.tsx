'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TurnoPage() {
  const router = useRouter()
  const [turno, setTurno] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accionando, setAccionando] = useState(false)
  const [historial, setHistorial] = useState<any[]>([])
  const [fechaTurno, setFechaTurno] = useState('')
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  useEffect(() => { loadTurno(); loadHistorial() }, [])

  async function loadHistorial() {
    setLoadingHistorial(true)
    const res = await fetch('/api/turnos/historial').then(r => r.json())
    setHistorial(Array.isArray(res) ? res : [])
    setLoadingHistorial(false)
  }

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
          const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(v.createdAt).toLocaleDateString('en-CA')
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

  if (loading) return <div className="p-8 text-zinc-400">Cargando...</div>

  return (
    <div className="max-w-md mx-auto space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white">Mi turno</h1>
        <p className="text-zinc-400 text-sm mt-1">Controla tu jornada de trabajo</p>
      </div>

      {!turno ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">🟡</span>
          </div>
          <p className="text-white font-semibold">Sin turno activo</p>
          <p className="text-zinc-400 text-sm">Inicia tu turno para comenzar a registrar visitas</p>
          <button onClick={iniciarTurno} disabled={accionando}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-4 rounded-2xl text-lg transition-colors">
            {accionando ? 'Obteniendo ubicación...' : '🟢 Iniciar turno'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-emerald-400 font-semibold">Turno activo</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-zinc-400 text-xs mb-1">Inicio</p>
                {turno.latInicio
                  ? <a href={"https://www.google.com/maps?q=" + turno.latInicio + "," + turno.lngInicio} target="_blank" className="text-emerald-400 text-sm underline">{new Date(turno.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} 📍</a>
                  : <p className="text-white text-sm">{new Date(turno.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>}
              </div>
              <div>
                <p className="text-zinc-400 text-xs mb-1">Duración</p>
                <p className="text-white text-sm font-mono">{duracion(turno.inicio)}</p>
              </div>
              <div>
                <p className="text-zinc-400 text-xs mb-1">Visitas en turno</p>
                <p className="text-white text-2xl font-bold">{turno.visitas?.length || 0}</p>
              </div>
              <div>
                <p className="text-zinc-400 text-xs mb-1">GPS inicio</p>
                {turno.latInicio ? <span className="text-emerald-400 text-sm">✅ Registrado</span> : <span className="text-zinc-500 text-sm">❌ Sin GPS</span>}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white font-bold">Historial de turnos</p>
          <div className="relative">
            <input type="date" value={fechaTurno} onChange={e => setFechaTurno(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full" />
            <div className={"flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors " + (fechaTurno ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>
              <span>📅</span>
              {fechaTurno ? new Date(fechaTurno + 'T12:00:00Z').toLocaleDateString('es-CO', {day:'numeric', month:'short'}) : 'Filtrar fecha'}
              {fechaTurno && <button onClick={e => { e.stopPropagation(); setFechaTurno('') }} className="ml-1 text-white/70 hover:text-white">×</button>}
            </div>
          </div>
        </div>
        {loadingHistorial && <p className="text-zinc-500 text-sm text-center py-4">Cargando...</p>}
        {!loadingHistorial && (() => {
          const filtrados = fechaTurno ? historial.filter(t => t.fecha === fechaTurno) : historial.slice(0, 10)
          if (filtrados.length === 0) return <p className="text-zinc-500 text-sm text-center py-4">{fechaTurno ? 'Sin turnos para esta fecha' : 'Sin historial'}</p>
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-zinc-500 font-medium text-left pb-2">Fecha</th>
                    <th className="text-zinc-500 font-medium text-center pb-2">Inicio</th>
                    <th className="text-zinc-500 font-medium text-center pb-2">Cierre</th>
                    <th className="text-zinc-500 font-medium text-center pb-2">Duración</th>
                    <th className="text-zinc-500 font-medium text-center pb-2">Pausa</th>
                    <th className="text-zinc-500 font-medium text-center pb-2">Efectivo</th>
                    <th className="text-zinc-500 font-medium text-center pb-2">GPS</th>
                  </tr>
                </thead>
                <tbody className="space-y-1">
                  {filtrados.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800">
                      <td className="text-zinc-400 py-2 pr-2">{new Date(t.fecha + 'T12:00:00Z').toLocaleDateString('es-CO', {day:'numeric', month:'short'})}</td>
                      <td className="text-white text-center py-2">
                        {t.gpsInicio
                          ? <a href={"https://www.google.com/maps?q=" + t.latInicio + "," + t.lngInicio} target="_blank" className="text-emerald-400 underline">{t.inicio}</a>
                          : t.inicio}
                      </td>
                      <td className="text-white text-center py-2">
                        {t.fin
                          ? t.gpsFin
                            ? <a href={"https://www.google.com/maps?q=" + t.latFin + "," + t.lngFin} target="_blank" className="text-emerald-400 underline">{t.fin}</a>
                            : t.fin
                          : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="text-zinc-300 text-center py-2">{t.duracion || '—'}</td>
                      <td className="text-center py-2">
                        {t.pausaMotivo ? <span className="text-amber-400 text-xs">⏸️ {t.pausaMotivo} {t.pausaDuracionMin}min</span> : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="text-emerald-400 text-center py-2 font-semibold">{t.tiempoEfectivo || t.duracion || "—"}</td>
                      <td className="text-center py-2">
                        {t.gpsInicio && t.gpsFin ? <span className="text-emerald-400">✓✓</span> : t.gpsInicio ? <span className="text-yellow-400">✓</span> : <span className="text-zinc-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
