'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

function nombreFecha(f: string) {
  if (!f) return ''
  const fStr = typeof f === 'string' ? f.split('T')[0] : new Date(f).toISOString().split('T')[0]
  const d = new Date(fStr + 'T12:00:00')
  const dia = DIAS[d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `${dia} ${dd}-${mm}-${yy}`
}

export default function RutasEntregasPage() {
  const { data: session, status } = useSession()
  const user = session?.user as any
  const router = useRouter()
  const [rutas, setRutas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!user || user.role !== 'entregas') { router.push('/'); return }
    fetch('/api/rutas')
      .then(r => r.json())
      .then(d => {
        const todas = Array.isArray(d) ? d : []
        setRutas(todas.filter((r: any) => r.empleados?.some((re: any) => re.empleadoId === user.id)))
        setLoading(false)
      })
  }, [status, user, router])

  if (loading) return (
    <div className="space-y-3 pb-20 pt-4">
      {[1,2,3].map(i => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl h-16 animate-pulse" />)}
    </div>
  )

  return (
    <div className="space-y-3 pb-20 pt-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-white text-xl font-bold">📋 Mis Rutas</p>
        <Link href="/mapa-ruta" className="text-emerald-400 text-sm font-semibold">Ruta de hoy →</Link>
      </div>

      {rutas.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">Sin rutas registradas</p>
      )}

      {rutas.map((r: any) => {
        const totalClientes = r.clientes?.length || 0
        const visitados = r.clientes?.filter((rc: any) =>
          (r.visitas || []).some((v: any) => v.clienteId === rc.clienteId)
        ).length || 0
        const pct = totalClientes > 0 ? Math.round(visitados / totalClientes * 100) : 0
        const pendientes = totalClientes - visitados
        const expandido = detalle === r.id

        return (
          <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3">
            {/* L1: nombre + fecha */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-white font-semibold truncate">{r.nombre}</p>
              {r.fecha && <p className="text-zinc-500 text-xs whitespace-nowrap">{nombreFecha(r.fecha)}</p>}
            </div>
            {/* L2: stats + botones */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-zinc-400 text-xs">👤{totalClientes}</span>
              {r.cerrada && totalClientes > 0 && r.fecha && (
                pendientes === 0
                  ? <span className="text-xs font-semibold text-emerald-400">✓ 100%</span>
                  : <span className="text-xs font-semibold text-amber-400">✓ {pct}% ⚠️{pendientes}</span>
              )}
              {!r.cerrada && <span className="text-xs font-semibold text-emerald-400">● Activa</span>}
              <div className="flex-1" />
              <button onClick={() => setDetalle(expandido ? null : r.id)}
                className="text-zinc-400 hover:text-white text-sm bg-zinc-800 px-2.5 py-1.5 rounded-lg">
                {expandido ? '▲' : '👁️'}
              </button>
              <Link href={`/mapa?rutaId=${r.id}`}
                className="text-zinc-400 hover:text-white text-sm bg-zinc-800 px-2.5 py-1.5 rounded-lg">
                🗺️
              </Link>
            </div>
            {/* Detalle clientes */}
            {expandido && (
              <div className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3">
                <p className="text-zinc-400 text-xs font-semibold mb-2">CLIENTES</p>
                {r.clientes?.map((rc: any, i: number) => {
                  const ejecutado = (r.visitas || []).some((v: any) => v.clienteId === rc.clienteId)
                  return (
                    <div key={rc.id} className={"rounded-xl border flex items-center gap-2 px-3 py-2 " + (ejecutado ? "bg-zinc-800/60 border-zinc-700" : "bg-zinc-800 border-zinc-700")}>
                      <span className={"text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0 " + (ejecutado ? "bg-emerald-500 text-black" : rc.rezago ? "bg-amber-500/20 text-amber-400" : "bg-zinc-600 text-zinc-300")}>
                        {ejecutado ? '✓' : rc.rezago ? '↩' : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{rc.cliente?.nombre}</p>
                        {rc.notas && <p className="text-zinc-500 text-xs truncate">📦 {rc.notas}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
