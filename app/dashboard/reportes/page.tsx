'use client'
import TarjetaVisita from '@/components/TarjetaVisita'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { checkPermiso } from '@/lib/permisos'

export default function ReportesPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const [datos, setDatos] = useState<any>({ visitas: [], empleados: [], resumenPorEmpleado: [], totales: {}, turnos: [] })
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [empleadoId, setEmpleadoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'dia' | 'ranking'>('dia')
  const [periodoRanking, setPeriodoRanking] = useState<'semana' | 'mes'>('semana')
  const [ranking, setRanking] = useState<any[]>([])

  useEffect(() => { loadData() }, [fecha, empleadoId])
  useEffect(() => { loadRanking() }, [periodoRanking])

  async function loadRanking() {
    const res = await fetch('/api/reportes?ranking=true&periodo=' + periodoRanking)
    const data = await res.json()
    setRanking(Array.isArray(data.ranking) ? data.ranking : [])
  }

  async function loadData() {
    setLoading(true)
    const params = new URLSearchParams({ fecha })
    if (empleadoId) params.append('empleadoId', empleadoId)
    const res = await fetch(`/api/reportes?${params}`)
    const data = await res.json()
    setDatos(data)
    setLoading(false)
  }

  const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`

  if (user?.role === 'supervisor' && !checkPermiso(session, 'verReportes')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-3">
        <p className="text-4xl">🔒</p>
        <p className="text-white font-semibold">Sin acceso a reportes</p>
        <p className="text-zinc-400 text-sm">No tienes permiso para ver esta sección</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
          <p className="text-zinc-400 text-sm mt-1">Actividad del equipo en campo</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
        <button onClick={() => setTab('dia')}
          className={"flex-1 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === 'dia' ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300")}>
          📊 Por día
        </button>
        <button onClick={() => setTab('ranking')}
          className={"flex-1 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === 'ranking' ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300")}>
          🏆 Ranking
        </button>
      </div>

      {tab === 'ranking' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setPeriodoRanking('semana')}
              className={"flex-1 py-2 rounded-xl text-sm font-semibold border transition-all " + (periodoRanking === 'semana' ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400")}>
              Esta semana
            </button>
            <button onClick={() => setPeriodoRanking('mes')}
              className={"flex-1 py-2 rounded-xl text-sm font-semibold border transition-all " + (periodoRanking === 'mes' ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400")}>
              Este mes
            </button>
          </div>
          <div className="space-y-2">
            {ranking.map((r: any, i: number) => (
              <div key={r.empleadoId} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4">
                <div className={"w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 " + (i === 0 ? "bg-yellow-500 text-black" : i === 1 ? "bg-zinc-400 text-black" : i === 2 ? "bg-amber-700 text-white" : "bg-zinc-700 text-white")}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold">{r.nombre}</p>
                  <p className="text-zinc-500 text-xs capitalize">{r.rol}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-emerald-400 font-bold">${Number(r.totalVentas || 0).toLocaleString('es-CO')}</p>
                  <p className="text-zinc-500 text-xs">{r.totalVisitas} visitas</p>
                </div>
              </div>
            ))}
            {ranking.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
                <p className="text-zinc-500 text-sm">Sin datos para este periodo</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'dia' && (
        <>
      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-emerald-500" />
        <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-emerald-500">
          <option value="">Todos los empleados</option>
          {datos.empleados.map((e: any) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total gestiones', value: datos.totales.total || 0, icon: '📍', sub: null },
          { label: 'Ventas', value: datos.totales.ventas || 0, icon: '💰', sub: fmt(datos.totales.montoVentas || 0) },
          { label: 'Cobros', value: datos.totales.cobros || 0, icon: '💵', sub: fmt(datos.totales.montoCobros || 0) },
          { label: 'Entregas', value: datos.totales.entregas || 0, icon: '📦', sub: null },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-zinc-400 text-xs">{s.label}</div>
            {s.sub && <div className="text-emerald-400 text-xs font-semibold mt-1">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Resumen por empleado */}
      {datos.resumenPorEmpleado.length > 0 && (
        <div className="space-y-3">
          <p className="text-zinc-400 text-xs font-semibold">RESUMEN POR EMPLEADO</p>
          {datos.resumenPorEmpleado
            .sort((a: any, b: any) => b.total - a.total)
            .map((r: any) => (
              <div key={r.empleado.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-zinc-700 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {r.empleado.nombre[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold">{r.empleado.nombre}</p>
                    <p className="text-zinc-500 text-xs capitalize">{r.empleado.rol}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.enTurno && <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">En turno</span>}
                    <span className="text-white font-bold text-lg">{r.total}</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-zinc-800 rounded-xl p-2 text-center">
                    <p className="text-white font-bold">{r.visitas}</p>
                    <p className="text-zinc-500 text-xs">👁️ Visitas</p>
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-2 text-center">
                    <p className="text-white font-bold">{r.ventas}</p>
                    <p className="text-zinc-500 text-xs">💰 Ventas</p>
                    {r.montoVentas > 0 && <p className="text-emerald-400 text-xs">{fmt(r.montoVentas)}</p>}
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-2 text-center">
                    <p className="text-white font-bold">{r.cobros}</p>
                    <p className="text-zinc-500 text-xs">💵 Cobros</p>
                    {r.montoCobros > 0 && <p className="text-emerald-400 text-xs">{fmt(r.montoCobros)}</p>}
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-2 text-center">
                    <p className="text-white font-bold">{r.entregas}</p>
                    <p className="text-zinc-500 text-xs">📦 Entregas</p>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Detalle de visitas */}
      {datos.visitas.length > 0 && (
        <div className="space-y-3">
          <p className="text-zinc-400 text-xs font-semibold">DETALLE DE GESTIONES</p>
          <div className="space-y-2">
            {datos.visitas.map((v: any) => (
              <TarjetaVisita key={v.id} visita={v} mostrarEmpleado mostrarCliente colapsado />
            ))}
          </div>
        </div>
      )}

      {datos.visitas.length === 0 && !loading && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-zinc-400">Sin actividad en esta fecha</p>
        </div>
      )}
        </>
      )}
    </div>
  )
}
