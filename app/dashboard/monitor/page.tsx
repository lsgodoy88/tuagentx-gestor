'use client'
import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const PLAN_COLOR: Record<string, string> = {
  basico: '#71717a',
  pro: '#3b82f6',
  business: '#10b981',
}

const ROL_ICON: Record<string, string> = {
  supervisor: '🔍',
  vendedor: '💼',
  entregas: '📦',
  impulsadora: '⭐',
  empresa: '👤',
}

const ROL_COLOR: Record<string, string> = {
  supervisor: '#8b5cf6',
  vendedor: '#3b82f6',
  entregas: '#f59e0b',
  impulsadora: '#ec4899',
  empresa: '#10b981',
}

export default function MonitorPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const user = session?.user as any
  const [empresas, setEmpresas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(0.85)
  const containerRef = useRef<HTMLDivElement>(null)
  const refreshCooldown = useRef(false)

  useEffect(() => {
    if (user && user.role !== 'superadmin') { router.push('/dashboard'); return }
    if (user) cargar()
  }, [user])

  async function cargar() {
    setLoading(true)
    const res = await fetch('/api/monitor').then(r => r.json()).catch(() => [])
    // Filtrar empresa superadmin
    const arr = (Array.isArray(res) ? res : []).filter((e: any) => e.plan !== 'superadmin' && e.nombre !== 'TuAgentX')
    setEmpresas(arr)
    setLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-zinc-400 animate-pulse text-sm">Cargando monitor...</div>
    </div>
  )

  return (
    <div className="h-screen overflow-hidden relative">
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h1 className="text-xl font-bold text-white">Control</h1>
        <span className="text-zinc-500 text-xs">{empresas.length} empresa{empresas.length !== 1 ? 's' : ''} · {empresas.reduce((a,e) => a + e.totalEmpleados, 0)} empleados</span>
      </div>

      {/* Controles fijos */}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-2xl p-2 shadow-xl">
        <button onClick={() => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(1)))} className="text-white bg-zinc-700 hover:bg-zinc-600 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl">+</button>
        <span className="text-zinc-400 text-xs">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1)))} className="text-white bg-zinc-700 hover:bg-zinc-600 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl">−</button>
        <button onClick={() => setZoom(0.85)} className="text-zinc-500 hover:text-white text-xs mt-1">↺</button>
        <button onClick={() => { if (refreshCooldown.current) return; refreshCooldown.current = true; cargar(); setTimeout(() => { refreshCooldown.current = false }, 2000) }} className="text-zinc-500 hover:text-white text-lg mt-1">🔄</button>
      </div>

      {/* Área scrolleable en ambas direcciones */}
      <div className="overflow-auto h-full" style={{ paddingBottom: '120px' }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.2s ease', padding: '24px', minWidth: 'max-content' }}>

          {/* Nodo raíz */}
          <div className="mb-2">
            <div className="inline-flex items-center gap-3 bg-zinc-800 border-2 border-zinc-600 rounded-2xl px-5 py-3 shadow-lg">
              <span className="text-2xl">⚡</span>
              <div>
                <p className="text-white font-bold">TuAgentX</p>
                <p className="text-zinc-500 text-xs">{empresas.length} empresas · {empresas.reduce((a,e) => a + e.totalEmpleados, 0)} empleados · {empresas.reduce((a,e) => a + e.visitasHoy, 0)} visitas hoy</p>
              </div>
            </div>
          </div>

          {/* Línea vertical */}
          <div className="ml-8 w-px h-6 bg-zinc-700" />

          {/* Empresas */}
          <div className="space-y-0">
            {empresas.map((e: any, ei: number) => {
              const color = PLAN_COLOR[e.plan] || '#71717a'
              const isLast = ei === empresas.length - 1

              return (
                <div key={e.id} className="relative flex">
                  {/* Línea vertical izquierda continua */}
                  {!isLast && <div className="absolute left-8 top-0 bottom-0 w-px bg-zinc-700" />}

                  {/* Conector L */}
                  <div className="flex-shrink-0 flex flex-col" style={{ width: '32px' }}>
                    <div className="w-px h-7 bg-zinc-700 mx-auto" />
                    <div className="flex items-center">
                      <div className="w-px h-3 bg-zinc-700 mx-auto" />
                    </div>
                    <div className="w-full h-px bg-zinc-700 mt-3" />
                  </div>

                  {/* Fila empresa + empleados — en una sola línea */}
                  <div className="flex items-center gap-3 py-3 flex-nowrap">

                    {/* Card empresa */}
                    <div className="rounded-2xl border-2 px-4 py-3 flex-shrink-0" style={{ borderColor: color + '70', backgroundColor: color + '12', minWidth: '180px' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">🏢</span>
                        <span className="text-white font-bold text-sm">{e.nombre}</span>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.totalEmpleados > 0 ? '#10b981' : '#71717a' }} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: color + '30', color }}>{e.plan.toUpperCase()}</span>
                        <span className="text-zinc-500 text-xs">👥{e.totalEmpleados}</span>
                        <span className="text-zinc-500 text-xs">🏪{e.clientes.total}</span>
                        {e.visitasHoy > 0 && <span className="text-blue-400 text-xs">📊{e.visitasHoy}</span>}
                      </div>
                    </div>

                    {/* Línea hacia empleados */}
                    {e.empleadosList && e.empleadosList.length > 0 && (
                      <div className="w-6 h-px bg-zinc-700 flex-shrink-0" />
                    )}

                    {/* Empleados en línea horizontal */}
                    <div className="flex items-center gap-2 flex-nowrap">
                      {e.empleadosList && e.empleadosList.map((emp: any, ei2: number) => {
                        const rc = ROL_COLOR[emp.rol] || '#71717a'
                        const ri = ROL_ICON[emp.rol] || '👤'
                        const estadoColor = emp.enTurno ? '#10b981' : '#71717a'

                        return (
                          <div key={emp.id} className="flex items-center gap-2 flex-shrink-0">
                            {ei2 > 0 && <div className="w-2 h-px bg-zinc-700" />}
                            <div className="rounded-xl border px-3 py-2 text-center" style={{ borderColor: rc + '50', backgroundColor: rc + '10', minWidth: '90px' }}>
                              <div className="flex items-center justify-center gap-1 mb-1">
                                <span className="text-base">{ri}</span>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: estadoColor }} title={emp.enTurno ? 'En turno' : 'Sin turno'} />
                              </div>
                              <p className="text-white text-xs font-semibold truncate" style={{ maxWidth: '80px' }}>{emp.nombre}</p>
                              <p className="text-xs capitalize" style={{ color: rc }}>{emp.rol}</p>

                            </div>
                          </div>
                        )
                      })}

                      {(!e.empleadosList || e.empleadosList.length === 0) && (
                        <div className="border border-dashed border-zinc-700 rounded-xl px-3 py-2 text-zinc-600 text-xs flex-shrink-0">Sin equipo</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {empresas.length === 0 && (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🏢</p>
              <p className="text-zinc-400">No hay empresas activas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
