'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

function fechaHoyBogota() {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
}

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
        const hoy = fechaHoyBogota()
        const todas = Array.isArray(d) ? d : []
        const misRutas = todas
          .filter((r: any) =>
            r.empleados?.some((re: any) => re.empleadoId === user.id) &&
            r.clientes?.length > 0 &&                          // solo rutas con entregas
            r.fecha && r.fecha.split('T')[0] < hoy             // excluir hoy (está en dashboard)
          )
          .sort((a: any, b: any) =>
            new Date(b.fecha).getTime() - new Date(a.fecha).getTime()  // más recientes primero
          )
        setRutas(misRutas)
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
        <p className="text-white text-xl font-bold">📋 Historial de rutas</p>
        <Link href="/inicio" className="text-emerald-400 text-sm font-semibold">← Inicio</Link>
      </div>

      {rutas.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">Sin historial de entregas</p>
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
            <div className="flex items-center justify-between">
              <p className="text-white text-sm font-semibold">{nombreFecha(r.fecha)}</p>
              <div className="flex items-center gap-3">
                <span className="text-zinc-400 text-xs">📦 {totalClientes}</span>
                <span className="text-emerald-400 text-xs">✓ {visitados}</span>
                {pendientes === 0
                  ? <span className="text-xs font-semibold text-emerald-400">100%</span>
                  : <span className="text-xs font-semibold text-amber-400">{pct}%</span>
                }
                <button onClick={() => setDetalle(expandido ? null : r.id)}
                  className="text-zinc-400 hover:text-white text-sm bg-zinc-800 px-2.5 py-1.5 rounded-lg ml-1">
                  {expandido ? '▲' : '▼'}
                </button>
              </div>
            </div>

            {expandido && (
              <div className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3">
                {r.clientes?.map((rc: any, i: number) => {
                  const visita = (r.visitas || []).find((v: any) => v.clienteId === rc.clienteId)
                  const ejecutado = !!visita
                  const horaEntrega = visita?.fechaBogota
                    ? new Date(visita.fechaBogota).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' })
                    : visita?.createdAt
                      ? new Date(new Date(visita.createdAt).getTime() - 5*60*60*1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
                      : null
                  const c = rc.cliente
                  // Maps = GPS donde se entregó (visita.lat/lng), fallback a dirección cliente
                  const mapsUrl = (visita?.lat && visita?.lng)
                    ? `https://maps.google.com/?q=${visita.lat},${visita.lng}`
                    : c?.lat && c?.lng ? `https://maps.google.com/?q=${c.lat},${c.lng}`
                    : c?.latTmp && c?.lngTmp ? `https://maps.google.com/?q=${c.latTmp},${c.lngTmp}`
                    : c?.direccion ? `https://maps.google.com/?q=${encodeURIComponent((c.direccion || '') + ' ' + (c.ciudad || ''))}` : null
                  return (
                    <div key={rc.id} className={"rounded-xl border px-3 py-2.5 " +
                      (ejecutado ? "bg-zinc-800/60 border-zinc-700" : "bg-zinc-800 border-zinc-700")}>
                      <div className="flex items-center gap-2">
                        <span className={"text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0 " +
                          (ejecutado ? "bg-emerald-500 text-black" : rc.rezago ? "bg-amber-500/20 text-amber-400" : "bg-zinc-600 text-zinc-300")}>
                          {ejecutado ? '✓' : rc.rezago ? '↩' : i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{c?.nombre}</p>
                          {c?.direccion && <p className="text-zinc-400 text-xs truncate">{c.direccion}{c.ciudad ? `, ${c.ciudad}` : ''}</p>}
                          {rc.notas && (
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className="text-zinc-300 text-xs truncate">📦 {rc.notas.replace(/#(\d+)/, "F_$1")}</p>
                              {ejecutado && horaEntrega && (
                                <p className="text-emerald-400 text-xs whitespace-nowrap flex-shrink-0">{horaEntrega}</p>
                              )}
                            </div>
                          )}
                        </div>
                        {mapsUrl && (
                          <a href={mapsUrl} target="_blank" rel="noreferrer"
                            className="text-blue-400 text-xs px-2 py-1 bg-blue-500/10 rounded-lg flex-shrink-0">
                            🗺️
                          </a>
                        )}
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
