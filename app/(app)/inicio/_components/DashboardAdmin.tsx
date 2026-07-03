'use client'
import { useEffect, useState, useCallback } from 'react'
import { CountUp, LiveDot } from '@/components/FX'
import { CardKPIGroup, CardCountAdmin, CardCountAdminSkeleton } from '@/components/ui/cards'
import { useRouter } from 'next/navigation'

const CACHE_KEY_BASE = 'inicio_admin_cache'
const CACHE_TTL = 10 * 60 * 1000
const CACHE_TTL_PRECIOS = 30 * 60 * 1000

export default function DashboardAdmin({ user }: { user: any }) {
  const router = useRouter()
  const [stats, setStats] = useState<any>({ empleados: 0, clientes: 0, visitasHoy: 0, enTurno: 0 })
  const [monitor, setMonitor] = useState<any[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const [empresaDetalleSA, setEmpresaDetalleSA] = useState<string | null>(null)
  const [mostrarEstadisticas, setMostrarEstadisticas] = useState(false)
  const [resumenFinanciero, setResumenFinanciero] = useState<any>(null)

  const isEmpresa   = user?.role === 'empresa'
  const isSupervisor = user?.role === 'supervisor'

  // Clave namespaced por userId — nunca lee/escribe el cache de OTRO usuario,
  // sin importar orden de efectos ni si el login pasó literalmente por /login
  // (a diferencia de antes, que dependía de document.referrer). El uid está
  // disponible desde el primer render via prop `user`, sin race condition.
  const CACHE_KEY = user?.id ? `${CACHE_KEY_BASE}_${user.id}` : CACHE_KEY_BASE

  function getCached() {
    if (CACHE_KEY === CACHE_KEY_BASE) return null
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const { ts, data } = JSON.parse(raw)
      if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null }
      return { ...data, ts }
    } catch { return null }
  }

  function setCached(patch: Record<string, any>) {
    try {
      const prev = getCached() || {}
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: { ...prev, ...patch } }))
    } catch {}
  }

  function vieneDelLogin() {
    try { return document.referrer.includes('/login') || sessionStorage.getItem(CACHE_KEY) === null }
    catch { return true }
  }

  useEffect(() => {
    if (user?.role === 'superadmin') {
      const cached = getCached()
      if (cached?.resumenFinanciero && (Date.now() - (cached.ts||0)) < CACHE_TTL_PRECIOS) {
        setResumenFinanciero(cached.resumenFinanciero)
      } else {
        fetch('/api/precios').then(r => r.json()).then(d => { setResumenFinanciero(d); setCached({ resumenFinanciero: d }) })
      }
      return
    }

    const adminFetches: Promise<any>[] = [
      fetch('/api/stats').then(r => r.json()).catch(() => null),
    ]
    if (isEmpresa || isSupervisor) adminFetches.push(fetch('/api/integracion/estado').then(r => r.json()).catch(() => null))

    const cached = getCached()
    if (cached && !vieneDelLogin()) {
      if (cached.stats) setStats(cached.stats)
    }

    Promise.all(adminFetches).then(([s]) => {
      if (s) { setStats(s); setCached({ stats: s }) }
    })
  }, [user])

  async function cargarEstadisticas() {
    setMostrarEstadisticas(prev => !prev)
    if (!mostrarEstadisticas) {
      try {
        const d = await fetch('/api/stats').then(r => r.json())
        setStats(d)
      } catch {}
    }
  }

  async function dispararSync() {
    setSincronizando(true)
    try {
      await fetch('/api/integracion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'delta' })
      })
      fetch('/api/stats').then(r => r.json()).then(d => setStats(d)).catch(() => {})
    } catch {}
    setSincronizando(false)
  }

  // ── Superadmin ──────────────────────────────────────────────
  if (user?.role === 'superadmin') {
    const totalMensual = resumenFinanciero?.resumenEmpresas?.reduce((a: number, e: any) => a + e.total, 0) || 0
    return (
      <div className="space-y-6 pb-20 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">Bienvenido, {user?.name?.split(' ')[0]}</h1>
          <p className="text-zinc-400 text-sm mt-1">Superadmin</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-emerald-400 font-semibold text-lg">💰 Facturación mensual</p>
            <p className="text-zinc-400 text-xs mt-0.5">{resumenFinanciero?.resumenEmpresas?.length || 0} empresa{resumenFinanciero?.resumenEmpresas?.length !== 1 ? 's' : ''} activa{resumenFinanciero?.resumenEmpresas?.length !== 1 ? 's' : ''}</p>
          </div>
          <p className="text-emerald-400 font-bold text-2xl">${totalMensual.toLocaleString('es-CO')}</p>
        </div>
        <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-white font-semibold">Por empresa</p>
          </div>
          {(resumenFinanciero?.resumenEmpresas || []).map((e: any) => (
            <div key={e.id}>
              <button onClick={() => setEmpresaDetalleSA(empresaDetalleSA === e.id ? null : e.id)}
                className="w-full flex items-center justify-between px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🏢</span>
                  <div className="text-left">
                    <p className="text-white text-sm font-medium">{e.nombre}</p>
                    <div className="flex gap-2 mt-0.5">
                      {Object.entries(e.conteo || {}).map(([rol, cant]: any) => (
                        <span key={rol} className="text-zinc-500 text-xs">
                          {rol === 'vendedor' ? '💼' : rol === 'entregas' ? '📦' : rol === 'impulsadora' ? '⭐' : '🔍'}{cant}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold">${e.total.toLocaleString('es-CO')}</p>
                  <span className="text-zinc-500 text-xs">{empresaDetalleSA === e.id ? '▲' : '▼'}</span>
                </div>
              </button>
              {empresaDetalleSA === e.id && (
                <div className="px-4 py-3 border-b space-y-2" style={{"borderColor":"rgba(148,180,255,0.20)"}}>
                  {Object.entries(e.conteo || {}).map(([rol, cant]: any) => {
                    const precio = resumenFinanciero?.precios?.find((p: any) => p.rol === rol)?.precio || 0
                    return (
                      <div key={rol} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">
                          {rol === 'vendedor' ? '💼' : rol === 'entregas' ? '📦' : rol === 'impulsadora' ? '⭐' : '🔍'} {rol} × {cant}
                        </span>
                        <span className="text-white">${(precio * cant).toLocaleString('es-CO')}</span>
                      </div>
                    )
                  })}
                  <div className="border-t border-zinc-700 pt-2 flex justify-between text-sm font-semibold">
                    <span className="text-zinc-300">Total mensual</span>
                    <span className="text-emerald-400">${e.total.toLocaleString('es-CO')}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
          {(!resumenFinanciero?.resumenEmpresas?.length) && (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">Sin empresas activas</div>
          )}
        </div>
      </div>
    )
  }


  // ── Empresa / Supervisor ────────────────────────────────────
  return (
    <div className="space-y-3 pb-20 md:pb-0 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white px-1">Bienvenido, {user?.name?.split(' ')[0]}</h1>
      {(isEmpresa || isSupervisor) && (
        <div className="space-y-6">
          <div className="rounded-2xl" style={{overflow:"hidden",borderRadius:16}}>
          <div className="grid grid-cols-2 gap-3">

            <div className="rounded-2xl p-4 hover-lift card-glass flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">🛍️</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Vendedores</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-white text-2xl font-bold"><CountUp end={stats.vendedoresActivos||0} /></span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold"><CountUp end={stats.totalVendedores||0} /></span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">en turno</span>
                <span className="text-white text-xs">activos</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 hover-lift card-glass flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">⚡</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Impulsos</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-amber-400 text-2xl font-bold"><CountUp end={stats.impulsosActivos||0} /></span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold"><CountUp end={stats.totalImpulsos||0} /></span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">activas</span>
                <span className="text-white text-xs">total</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 hover-lift card-glass flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">📦</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Órdenes hoy</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-emerald-400 text-2xl font-bold"><CountUp end={stats.ordenesDespachadasHoy||0} /></span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold"><CountUp end={stats.ordenesFact||0} /></span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">despacho</span>
                <span className="text-white text-xs">facturas</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 hover-lift card-glass flex flex-col items-center justify-center min-h-[110px]" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-sm">💰</span>
                <span className="text-white text-[10px] font-bold tracking-widest uppercase">Recaudado</span>
              </div>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-blue-400 text-2xl font-bold"><CountUp end={stats.recaudoHoy||0} prefix="$" /></span>
                <span className="text-white/40 text-xl font-light">/</span>
                <span className="text-white text-2xl font-bold"><CountUp end={stats.recaudoMes||0} prefix="$" /></span>
              </div>
              <div className="flex justify-center gap-4 mt-1">
                <span className="text-white text-xs">hoy</span>
                <span className="text-white text-xs">mes</span>
              </div>
            </div>

          </div>
          </div>

          {/* Botón Estadísticas */}
          <button
            onClick={cargarEstadisticas}
            style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25)',borderRadius:16,width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer'}}>
            <span className="text-white font-semibold text-sm">📊 Estadísticas</span>
            <span className="text-zinc-500 text-xs">{mostrarEstadisticas ? '▲ Ocultar' : '▼ Ver'}</span>
          </button>

          {mostrarEstadisticas ? (
          <div className="md:grid md:grid-cols-2 md:gap-6 space-y-6 md:space-y-0" style={{}}>
          <div className="space-y-6">
          {stats.visitasPorDia && stats.visitasPorDia.length > 0 && (
            <div className="rounded-2xl p-4 card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <p className="text-white font-semibold text-sm mb-4">Visitas últimos 7 días</p>
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...(stats.visitasPorDia || []).map((d: any) => d.cantidad), 1)
                  return (stats.visitasPorDia || []).map((d: any) => (
                    <div key={d.dia} className="flex items-center gap-3">
                      <div className="text-zinc-500 text-xs w-16 flex-shrink-0">{d.dia}</div>
                      <div className="flex-1 bg-zinc-800 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: ((d.cantidad / max) * 100) + '%' }} />
                      </div>
                      <div className="text-white text-xs w-4 text-right">{d.cantidad}</div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}
          {stats.topEmpleados && stats.topEmpleados.length > 0 && (
            <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-white font-semibold text-sm">Top vendedores - 30 dias</p>
              </div>
              {(stats.topEmpleados || []).map((e: any, i: number) => (
                <div key={e.nombre} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{e.nombre}</p>
                    <p className="text-zinc-500 text-xs">{e.ventas} ventas</p>
                  </div>
                  <p className="text-emerald-400 font-semibold text-sm">{"$" + e.monto.toLocaleString('es-CO')}</p>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl p-4 card-glass flex items-center justify-between" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
            <div>
              <p className="text-white font-semibold">Rutas activas</p>
              <p className="text-zinc-500 text-xs mt-0.5">Sin cerrar</p>
            </div>
            <p className="text-2xl font-bold text-white">{stats.rutasActivas || 0}</p>
          </div>
          </div>
          <div className="space-y-6">
          {/* Monitor empleados en turno */}
          {monitor.length > 0 && (
            <div className="space-y-4">
              {['vendedor', 'impulsadora', 'entregas'].map(rol => {
                const empleadosRol = monitor.filter((m: any) => m.rol === rol)
                if (empleadosRol.length === 0) return null
                const titulo = rol === 'vendedor' ? 'Vendedores' : rol === 'impulsadora' ? 'Impulsadoras' : 'Entregas'
                return (
                  <div key={rol} className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
                    <div className="px-4 py-3 border-b border-zinc-800">
                      <p className="text-white font-semibold text-sm">{titulo} en turno</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{background:"#0d1220",borderBottom:"1px solid #1e2a3d"}}>
                            <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:'white',textAlign:'left',whiteSpace:'nowrap' as const,overflow:'hidden' as const}}>Empleado</th>
                            <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:'white',textAlign:'left',whiteSpace:'nowrap' as const,overflow:'hidden' as const}}>Inicio turno</th>
                            <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:'white',textAlign:'left',whiteSpace:'nowrap' as const,overflow:'hidden' as const}}>Ultima visita</th>
                            <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:'white',textAlign:'left',whiteSpace:'nowrap' as const,overflow:'hidden' as const}}>Proximo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empleadosRol.map((m: any) => (
                            <tr key={m.empleado} style={{background:"#141c2e",borderBottom:"1px solid #1e2a3d"}}>
                              <td className="px-3 py-2">
                                <p className="text-white font-medium whitespace-nowrap">{m.empleado}</p>
                                {m.ruta && <p className="text-blue-400 mt-0.5">{m.ruta}</p>}
                                {m.totalRuta > 0 && <p className="text-zinc-500">{m.visitados}/{m.totalRuta}</p>}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <p className="text-white">{new Date(m.inicioTurno).toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota'})}</p>
                                {m.latInicio && m.lngInicio && (
                                  <a href={'https://www.google.com/maps?q=' + m.latInicio + ',' + m.lngInicio} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">📍 ver</a>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {m.ultimaVisita ? (
                                  <div>
                                    <p className="text-white whitespace-nowrap">{new Date(m.ultimaVisita.hora).toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota'})} - {m.ultimaVisita.cliente}</p>
                                    <p className="text-zinc-500 capitalize">{m.ultimaVisita.tipo}</p>
                                    {m.ultimaVisita.lat && m.ultimaVisita.lng && (
                                      <a href={'https://www.google.com/maps?q=' + m.ultimaVisita.lat + ',' + m.ultimaVisita.lng} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">📍 ver</a>
                                    )}
                                  </div>
                                ) : <span className="text-zinc-600">Sin visitas</span>}
                              </td>
                              <td className="px-3 py-2">
                                {m.proximoPendiente ? (
                                  <p className="text-emerald-400 whitespace-nowrap">{m.proximoPendiente}</p>
                                ) : <span className="text-zinc-600">-</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {/* Tabla 7 dias x vendedor */}
          {stats.vendedores7 && stats.vendedores7.length > 0 && (
            <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-white font-semibold text-sm">Visitas por vendedor - ultimos 7 dias</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{background:"#0d1220",borderBottom:"1px solid #1e2a3d"}}>
                      <th className="px-3 py-2 text-left text-zinc-500 font-medium w-24">Dia</th>
                      {(stats.vendedores7 || []).map((v: string) => (
                        <th key={v} className="px-3 py-2 text-center text-zinc-400 font-medium whitespace-nowrap">{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.tabla7dias || []).map((row: any) => (
                      <tr key={row.dia} style={{background:"#141c2e",borderBottom:"1px solid #1e2a3d"}}>
                        <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{row.dia}</td>
                        {(stats.vendedores7 || []).map((v: string) => (
                          <td key={v} className="px-3 py-2 text-center text-white font-medium">
                            {row[v] > 0 ? row[v] : <span className="text-zinc-700">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* Tabla 7 meses x vendedor */}
          {stats.vendedores7m && stats.vendedores7m.length > 0 && (
            <div className="rounded-2xl overflow-hidden card-glass" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.30)",boxShadow:"0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)"}}>
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-white font-semibold text-sm">Visitas por vendedor - ultimos 7 meses</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{background:"#0d1220",borderBottom:"1px solid #1e2a3d"}}>
                      <th className="px-3 py-2 text-left text-zinc-500 font-medium w-24">Mes</th>
                      {(stats.vendedores7m || []).map((v: string) => (
                        <th key={v} className="px-3 py-2 text-center text-zinc-400 font-medium whitespace-nowrap">{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.tabla7meses || []).map((row: any) => (
                      <tr key={row.mes} style={{background:"#141c2e",borderBottom:"1px solid #1e2a3d"}}>
                        <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{row.mes}</td>
                        {(stats.vendedores7m || []).map((v: string) => (
                          <td key={v} className="px-3 py-2 text-center text-white font-medium">
                            {row[v] > 0 ? row[v] : <span className="text-zinc-700">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>
          </div>
          ) : null}
        </div>
      )}
      {/* bodega → DashboardBodega (componente separado) */}
    </div>
  )
}
