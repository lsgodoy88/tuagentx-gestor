'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

import TarjetaVisita from '@/components/TarjetaVisita'
export default function VisitasAdminPage() {
  const { data: session } = useSession()
  const user = session?.user as any

  const [visitas, setVisitas] = useState<any[]>([])
  const [empleados, setEmpleados] = useState<any[]>([])
  const [empleadoFiltro, setEmpleadoFiltro] = useState('')
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [loading, setLoading] = useState(false)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [firmaVer, setFirmaVer] = useState<any>(null)
  const [firmaUrlGenerada, setFirmaUrlGenerada] = useState<string | null>(null)
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 15

  useEffect(() => {
    fetch('/api/empleados').then(r => r.json()).then(d => {
      setEmpleados(Array.isArray(d) ? d : d?.empleados || [])
    })
    buscar()
  }, [])

  async function buscar(p?: number) {
    const pg = p ?? page
    setLoading(true)
    const params = new URLSearchParams()
    if (empleadoFiltro) params.set('empleadoId', empleadoFiltro)
    if (fechaFiltro) params.set('fecha', fechaFiltro)
    if (clienteFiltro) params.set('q', clienteFiltro)
    params.set('page', String(pg))
    params.set('limit', String(LIMIT))
    const res = await fetch('/api/visitas/admin?' + params.toString()).then(r => r.json())
    if (res?.visitas) { setVisitas(res.visitas); setTotal(res.total || 0) } else { setVisitas(Array.isArray(res) ? res : []); setTotal(0) }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white">Historial de visitas</h1>
        <p className="text-zinc-400 text-sm mt-1">Visitas libres de todos los empleados</p>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
        <div className="flex gap-2">
          <input value={clienteFiltro} onChange={e => setClienteFiltro(e.target.value)}
            placeholder="Buscar cliente..." onKeyDown={e => e.key === 'Enter' && buscar()}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-emerald-500" />
          <button onClick={() => buscar()} disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors flex-shrink-0">
            {loading ? '...' : 'Buscar'}
          </button>
        </div>
        <div className="flex gap-2">
          <select value={empleadoFiltro} onChange={e => setEmpleadoFiltro(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none">
            <option value="">Todos los empleados</option>
            {empleados.filter((e: any) => e.activo).map((e: any) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
          <div className="relative flex-shrink-0">
            <input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full" />
            <div className={"flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border " + (fechaFiltro ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>
              <span>📅</span>
              {fechaFiltro ? new Date(fechaFiltro + 'T12:00:00Z').toLocaleDateString('es-CO', {day:'numeric', month:'short'}) : ''}
              {fechaFiltro && <button onClick={e => { e.stopPropagation(); setFechaFiltro('') }} className="ml-1 text-white/70 hover:text-white">✕</button>}
            </div>
          </div>
        </div>
      </div>
      <p className="text-zinc-500 text-xs">{total || visitas.length} resultado{(total || visitas.length) !== 1 ? 's' : ''}</p>
      <div className="space-y-2">
        {visitas.map((v: any) => (
          <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-lg flex-shrink-0">
                {v.tipo === 'venta' ? '💰' : v.tipo === 'cobro' ? '💵' : v.tipo === 'entrega' ? '📦' : '👁️'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{v.cliente?.nombre}</p>
                <p className="text-zinc-500 text-xs capitalize">{v.tipo} · {v.empleado?.nombre} · {new Date(v.createdAt).toLocaleDateString('es-CO', {day:'numeric', month:'short', year:'numeric'})}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setDetalle(detalle === v.id ? null : v.id)}
                  className="text-zinc-400 text-xs bg-zinc-800 px-2 py-1 rounded-lg hover:bg-zinc-700">
                  {detalle === v.id ? 'Ocultar' : 'Ver'}
                </button>
                {v.lat && (
                  <a href={"https://www.google.com/maps?q=" + v.lat + "," + v.lng}
                    target="_blank" className="text-emerald-400 text-xs bg-emerald-500/10 px-2 py-1 rounded-lg">
                    Mapa
                  </a>
                )}
              </div>
            </div>
            {detalle === v.id && (
              <div className="mt-3">
                <TarjetaVisita visita={v} mostrarEmpleado={true} />
              </div>
            )}
          </div>
        ))}
        {visitas.length === 0 && !loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-zinc-400 text-sm">Sin visitas para los filtros seleccionados</p>
          </div>
        )}
      </div>
      {firmaVer && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white font-bold">Comprobante de entrega</p>
              <button onClick={() => { setFirmaVer(null); setFirmaUrlGenerada(null) }} className="text-zinc-400 hover:text-white text-xl">x</button>
            </div>
            <div className="space-y-1 text-sm border-b border-zinc-700 pb-3">
              <p className="text-zinc-400">Cliente: <span className="text-white">{firmaVer.cliente}</span></p>
              <p className="text-zinc-400">Factura: <span className="text-blue-400 font-semibold">{firmaVer.factura || 'Sin factura'}</span></p>
              <p className="text-zinc-400">Fecha: <span className="text-white">{firmaVer.fecha}</span></p>
            </div>
            <div className="bg-white rounded-xl p-2">
              {firmaUrlGenerada
              ? <img src={firmaUrlGenerada} alt="Firma" className="w-full rounded-lg" />
              : <div className="flex items-center justify-center h-20 text-zinc-400 text-sm">Cargando firma...</div>
            }
            </div>
          </div>
        </div>
      )}
      {total > LIMIT && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-zinc-500 text-xs">{(page-1)*LIMIT+1}–{Math.min(page*LIMIT, total)} de {total}</span>
          <div className="flex gap-2">
            <button disabled={page===1} onClick={() => { const np = page-1; setPage(np); buscar(np) }} className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40">← Ant</button>
            <button disabled={page*LIMIT>=total} onClick={() => { const np = page+1; setPage(np); buscar(np) }} className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40">Sig →</button>
          </div>
        </div>
      )}
    </div>
  )
}
