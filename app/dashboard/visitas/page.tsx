'use client'
import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { fetchApi } from '@/lib/fetchApi'
import ModalVisita from '@/components/ModalVisita'
import { checkPermiso } from '@/lib/permisos'

export default function VisitasPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const isEntregas = user?.role === 'entregas'
  const puedeRegistrar = user?.role !== 'supervisor' || checkPermiso(session, 'registrarVisitas')

  // Hoy
  const [visitasHoy, setVisitasHoy] = useState<any[]>([])
  const [turno, setTurno] = useState<any>(null)
  const [puedeCapturarGps, setPuedeCapturarGps] = useState(false)
  const [modal, setModal] = useState(false)

  // Historial paginado
  const [historial, setHistorial] = useState<any[]>([])
  const [historialTotal, setHistorialTotal] = useState(0)
  const [historialPage, setHistorialPage] = useState(1)
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [buscarHistorial, setBuscarHistorial] = useState('')
  const [fechaHistorial, setFechaHistorial] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [tab, setTab] = useState<'nueva' | 'historial'>('nueva')

  // Firma viewer
  const [firmaVer, setFirmaVer] = useState<any>(null)
  const [firmaUrlGenerada, setFirmaUrlGenerada] = useState<string | null>(null)
  const [detalleCliente, setDetalleCliente] = useState<string | null>(null)

  useEffect(() => { loadHoy() }, [])

  async function loadHoy() {
    const [visRes, turRes, meRes] = await Promise.all([
      fetch('/api/visitas').then(r => r.json()),
      fetch('/api/turnos').then(r => r.json()),
      fetch('/api/me').then(r => r.json()),
    ])
    setVisitasHoy(Array.isArray(visRes) ? visRes : [])
    setTurno(turRes)
    setPuedeCapturarGps(meRes?.puedeCapturarGps === true)
  }

  async function loadHistorial(q: string, fecha: string, p: number) {
    if (p === 1) setLoadingHistorial(true); else setLoadingMore(true)
    const params = new URLSearchParams({ page: String(p), limit: '15' })
    if (q) params.set('q', q)
    if (fecha) params.set('fecha', fecha)
    const data = await fetch('/api/visitas/todas?' + params).then(r => r.json())
    const nuevas = data.visitas ?? []
    setHistorial(p === 1 ? nuevas : prev => [...prev, ...nuevas])
    setHistorialTotal(data.total ?? 0)
    setHistorialPage(p)
    if (p === 1) setLoadingHistorial(false); else setLoadingMore(false)
  }

  // Cargar historial al abrir tab
  useEffect(() => {
    if (tab === 'historial' && historial.length === 0) {
      loadHistorial('', '', 1)
    }
  }, [tab])

  const hoyStr = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
  const visitasLibres = visitasHoy.filter(v => v.esLibre)

  function CardVisita({ v }: { v: any }) {
    const expandido = detalleCliente === v.id
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-lg flex-shrink-0">
            {v.tipo === 'venta' ? '💰' : v.tipo === 'cobro' ? '💵' : v.tipo === 'entrega' ? '📦' : '👁️'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{v.cliente?.nombre}</p>
            <p className="text-zinc-500 text-xs capitalize">{v.tipo} — {new Date(v.createdAt).toLocaleDateString('es-CO', {day:'numeric', month:'short'})}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => setDetalleCliente(expandido ? null : v.id)}
              className="text-zinc-400 text-xs bg-zinc-800 px-2 py-1 rounded-lg hover:bg-zinc-700">
              {expandido ? 'Ocultar' : 'Ver'}
            </button>
            {v.lat && (
              <a href={"https://www.google.com/maps?q=" + v.lat + "," + v.lng}
                target="_blank" className="text-emerald-400 text-xs bg-emerald-500/10 px-2 py-1 rounded-lg">
                Mapa
              </a>
            )}
          </div>
        </div>
        {expandido && (
          <div className="mt-3 pl-8 space-y-1">
            {v.cliente?.direccion && <p className="text-zinc-400 text-xs">{v.cliente.direccion}</p>}
            {v.factura && <p className="text-blue-400 text-xs font-semibold">Factura: {v.factura}</p>}
            {v.monto && <p className="text-emerald-400 text-sm font-semibold">${Number(v.monto).toLocaleString('es-CO')}</p>}
            {v.nota && <p className="text-zinc-400 text-xs">{v.nota}</p>}
            <p className="text-zinc-500 text-xs">{new Date(v.createdAt).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}</p>
            {v.lat ? <p className="text-emerald-400 text-xs">GPS registrado</p> : <p className="text-zinc-600 text-xs">Sin GPS</p>}
            {v.firma && (
              <button onClick={async () => {
                setFirmaUrlGenerada(null)
                setFirmaVer({ cliente: v.cliente?.nombre, factura: v.factura, fecha: new Date(v.createdAt).toLocaleDateString('es-CO', {day:'numeric', month:'long', year:'numeric'}) })
                const d = await fetchApi('/api/firma', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ firma: v.firma }) })
                if (d?.url) setFirmaUrlGenerada(d.url)
              }} className="text-blue-400 text-xs bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-500/20">
                Ver firma
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  function SkeletonCard() {
    return <div className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-2xl h-16" />
  }

  return (
    <div className="max-w-md mx-auto space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-white">{isEntregas ? 'Entregas' : 'Visitas'}</h1>
        <p className="text-zinc-400 text-sm mt-1">{visitasLibres.length} {isEntregas ? 'entregas' : 'visitas libres'} registradas hoy</p>
      </div>

      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
        <button onClick={() => setTab('nueva')}
          className={"flex-1 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === 'nueva' ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300")}>
          {isEntregas ? '📦 Nueva entrega' : '📍 Nueva visita'}
        </button>
        <button onClick={() => setTab('historial')}
          className={"flex-1 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === 'historial' ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300")}>
          Historial
        </button>
      </div>

      {tab === 'nueva' && (
        <div className="space-y-4">
          {turno && puedeRegistrar ? (
            <button onClick={() => setModal(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl text-lg transition-colors">
              + {isEntregas ? 'Registrar entrega' : 'Registrar visita libre'}
            </button>
          ) : turno && !puedeRegistrar ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
              <p className="text-zinc-400 text-sm">Sin permiso para registrar visitas</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-center">
              <p className="text-zinc-400 text-sm">Debes tener un turno activo para {isEntregas ? 'registrar entregas' : 'registrar visitas'}</p>
            </div>
          )}
          {visitasLibres.length > 0 && (
            <div className="space-y-2">
              <p className="text-zinc-400 text-xs font-semibold">{isEntregas ? 'ENTREGAS HOY' : 'VISITAS LIBRES'}</p>
              {visitasLibres.map((v: any) => <CardVisita key={v.id} v={v} />)}
            </div>
          )}
        </div>
      )}

      {tab === 'historial' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={buscarHistorial} onChange={e => {
              const q = e.target.value
              setBuscarHistorial(q)
              setFechaHistorial('')
              clearTimeout(debounceRef.current)
              debounceRef.current = setTimeout(() => loadHistorial(q, '', 1), 500)
            }}
              placeholder="Buscar cliente..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
            <div className="relative">
              <input type="date" value={fechaHistorial} onChange={e => {
                const f = e.target.value
                setFechaHistorial(f)
                setBuscarHistorial('')
                clearTimeout(debounceRef.current)
                loadHistorial('', f, 1)
              }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full" />
              <div className={"flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors " + (fechaHistorial ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>
                📅 {fechaHistorial ? new Date(fechaHistorial + 'T12:00:00Z').toLocaleDateString('es-CO', {day:'numeric', month:'short'}) : 'Fecha'}
                {fechaHistorial && <button onClick={e => { e.stopPropagation(); setFechaHistorial(''); loadHistorial('', '', 1) }} className="ml-1 text-white/70 hover:text-white">×</button>}
              </div>
            </div>
          </div>

          {historial.length > 0 && (
            <p className="text-zinc-500 text-xs">Mostrando {historial.length} de {historialTotal} visitas</p>
          )}

          {loadingHistorial ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : historial.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
              <p className="text-zinc-400 text-sm">{buscarHistorial || fechaHistorial ? 'Sin resultados' : 'Sin registros anteriores'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historial.map(v => <CardVisita key={v.id} v={v} />)}
              {historial.length < historialTotal && (
                <button onClick={() => loadHistorial(buscarHistorial, fechaHistorial, historialPage + 1)} disabled={loadingMore}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-medium py-3 rounded-2xl border border-zinc-700 transition-colors">
                  {loadingMore ? 'Cargando...' : `Cargar más (${historial.length} de ${historialTotal})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <ModalVisita
        key="visitas-modal-visita"
        open={modal}
        onClose={() => setModal(false)}
        onRegistrado={loadHoy}
        tipoForzado={isEntregas ? 'entrega' : undefined}
        puedeCapturarGps={puedeCapturarGps}
        titulo={isEntregas ? 'Registrar entrega' : 'Registrar visita libre'}
        extraData={{ esLibre: true }}
      />

      {firmaVer && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white font-bold">Comprobante de entrega</p>
              <button onClick={() => setFirmaVer(null)} className="text-zinc-400 hover:text-white text-xl">×</button>
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
    </div>
  )
}
