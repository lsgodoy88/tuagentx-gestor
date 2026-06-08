'use client'
import { useEffect, useState, useCallback } from 'react'
import { fetchApi } from '@/lib/fetchApi'
import dynamic from 'next/dynamic'

const ModalVisita  = dynamic(() => import('@/components/ModalVisita'),  { ssr: false })
const EntregaCard  = dynamic(() => import('@/components/EntregaCard'),  { ssr: false })

export default function DashboardEntregas({ user }: { user: any }) {
  const [turno,             setTurno]             = useState<any>(null)
  const [cargandoTurno,     setCargandoTurno]     = useState(true)
  const [ruta,              setRuta]              = useState<any>(null)
  const [clientesOrdenados, setClientesOrdenados] = useState<any[]>([])
  const [visitasRuta,       setVisitasRuta]       = useState<any[]>([])
  const [ordenesEntregadas, setOrdenesEntregadas] = useState<Set<string>>(new Set())
  const [clienteModal,      setClienteModal]      = useState<any>(null)
  const [distanciaLejos,    setDistanciaLejos]    = useState(false)
  const [bloqueadoTurno,    setBloqueadoTurno]    = useState(false)
  const [obteniendoGps,     setObteniendoGps]     = useState(false)
  const [puedeCapturarGps,  setPuedeCapturarGps]  = useState(false)

  const hoyStr = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
  const fechaRuta = ruta?.fecha
    ? new Date(new Date(ruta.fecha).getTime() - 5*60*60*1000).toISOString().split('T')[0]
    : hoyStr

  const totalClientes = clientesOrdenados.length
  const ejecutadosRuta = clientesOrdenados.filter(c =>
    visitasRuta.some(v => {
      if (v.clienteId !== c.id) return false
      const fv = v.fechaBogota
        ? new Date(v.fechaBogota).toISOString().split('T')[0]
        : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      return fv === fechaRuta
    })
  ).length
  const rutaCompletada = totalClientes > 0 && ejecutadosRuta >= totalClientes

  const cargarRuta = useCallback(async () => {
    const hoy = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
    const [r, v] = await Promise.all([
      fetch('/api/rutas/mi-ruta').then(r => r.json()).catch(() => null),
      fetch('/api/visitas/todas?fecha=' + hoy).then(r => r.json()).catch(() => null),
    ])
    if (r) {
      setRuta(r)
      setClientesOrdenados(r.clientes?.map((rc: any) => ({
        ...rc.cliente,
        supervisorEtiqueta: rc.supervisorEtiqueta || null,
        rezago: rc.rezago,
        orden: rc.orden,
        notas: rc.notas || null,
        ordenDespachoId: rc.ordenDespachoId || null,
        numeroFactura: rc.numeroFactura || null,
        empresaOrigen: rc.empresaOrigen || null,
        alistadoPor: rc.alistadoPor || null,
        asignadoEn: rc.asignadoEn || null,
        ordenCreadaEl: rc.ordenCreadaEl || null,
      })) || [])
    }
    if (v) setVisitasRuta(Array.isArray(v?.visitas) ? v.visitas : Array.isArray(v) ? v : [])
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/turnos').then(r => r.json()),
      fetch('/api/me').then(r => r.json()),
    ]).then(([t, me]) => {
      setTurno(t)
      setCargandoTurno(false)
      setPuedeCapturarGps(me?.puedeCapturarGps === true)
    })
    cargarRuta()
  }, [cargarRuta])

  async function getUbicacion() {
    return new Promise<{lat:number,lng:number}|null>(resolve => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
      )
    })
  }

  async function iniciarTurno() {
    if (bloqueadoTurno) return
    setBloqueadoTurno(true); setObteniendoGps(true)
    const ubicacion = await getUbicacion()
    setObteniendoGps(false)
    if (!ubicacion) { alert('⚠️ No se pudo obtener GPS'); setBloqueadoTurno(false); return }
    const res = await fetchApi('/api/turnos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'iniciar', ...ubicacion }) })
    if (res?.ok) setTurno(res.turno)
    setBloqueadoTurno(false)
  }

  async function cerrarTurno() {
    if (bloqueadoTurno) return
    setBloqueadoTurno(true)
    const ubicacion = await getUbicacion()
    await fetchApi('/api/turnos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'cerrar', ...ubicacion }) })
    setTurno(null); setBloqueadoTurno(false)
  }

  return (
    <div className="space-y-3 pb-20">
      {!turno && !cargandoTurno && (
        <h1 className="text-2xl font-bold text-white px-1">Bienvenido, {user?.name?.split(' ')[0]}</h1>
      )}

      {/* Turno */}
      {cargandoTurno && (
        <div className="rounded-2xl px-4 py-3 animate-pulse" style={{ background: 'rgba(148,160,185,0.22)', border: '1px solid rgba(148,180,255,0.25)', height: 48 }} />
      )}
      {!cargandoTurno && (
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, overflow: 'hidden' }}>
          {turno ? (
            <div className="flex items-center justify-between px-3 py-2.5 gap-2">
              <div className="flex items-center gap-2">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 live-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-emerald-400 text-sm font-semibold">Turno activo</span>
              </div>
              <button onClick={cerrarTurno} disabled={bloqueadoTurno}
                className="bg-red-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                {bloqueadoTurno ? '...' : 'Cerrar turno'}
              </button>
            </div>
          ) : (
            <div className="px-3 py-2.5">
              <button onClick={iniciarTurno} disabled={bloqueadoTurno || obteniendoGps}
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
                {obteniendoGps
                  ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Buscando GPS...</>
                  : <>⚡ Iniciar turno</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ruta del día */}
      {ruta && totalClientes > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <p className="text-white font-bold">📦 Ruta de hoy</p>
            <span className="text-zinc-400 text-xs">{ejecutadosRuta}/{totalClientes} entregas</span>
          </div>
          <div className="divide-y divide-zinc-800">
            {clientesOrdenados.slice().sort((a, b) => a.orden - b.orden).map(c => {
              const entregado = ordenesEntregadas.has(c.ordenDespachoId) ||
                visitasRuta.some(v => {
                  if (v.clienteId !== c.id) return false
                  const fv = v.fechaBogota
                    ? new Date(v.fechaBogota).toISOString().split('T')[0]
                    : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
                  return fv === fechaRuta
                })
              return (
                <EntregaCard
                  key={c.id}
                  cliente={c}
                  numeroFactura={c.numeroFactura}
                  empresaOrigen={c.empresaOrigen || c.supervisorEtiqueta}
                  alistadoPor={c.alistadoPor}
                  asignadoEn={c.asignadoEn || c.ordenCreadaEl}
                  rezago={c.rezago === true}
                  entregado={entregado}
                  turnoActivo={!!turno}
                  onEntregar={() => {
                    setClienteModal(c)
                    const cLat = c.lat || c.latTmp
                    const cLng = c.lng || c.lngTmp
                    if (navigator.geolocation && cLat && cLng) {
                      navigator.geolocation.getCurrentPosition(pos => {
                        const R = 6371000
                        const dLat = (cLat - pos.coords.latitude) * Math.PI / 180
                        const dLng = (cLng - pos.coords.longitude) * Math.PI / 180
                        const a = Math.sin(dLat/2)**2 + Math.cos(pos.coords.latitude*Math.PI/180)*Math.cos(cLat*Math.PI/180)*Math.sin(dLng/2)**2
                        setDistanciaLejos(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) > 300)
                      }, () => setDistanciaLejos(false), { timeout: 3000 })
                    } else { setDistanciaLejos(false) }
                  }}
                />
              )
            })}
          </div>
          {rutaCompletada && (
            <div className="px-4 py-3 bg-emerald-500/10 border-t border-emerald-500/20">
              <p className="text-emerald-400 text-sm font-semibold text-center">✅ Ruta completada</p>
            </div>
          )}
        </div>
      )}

      {/* Modal entrega */}
      <ModalVisita
        key={clienteModal?.id || 'sin-cliente'}
        open={!!clienteModal}
        onClose={() => setClienteModal(null)}
        facturaPreset={clienteModal?.numeroFactura || undefined}
        onRegistrado={() => {
          if (clienteModal?.ordenDespachoId) setOrdenesEntregadas(prev => new Set([...prev, clienteModal.ordenDespachoId]))
          cargarRuta()
        }}
        clienteInicial={clienteModal}
        tipoForzado="entrega"
        distanciaLejos={distanciaLejos}
        puedeCapturarGps={puedeCapturarGps}
        titulo="📦 Registrar entrega"
        extraData={clienteModal?.ordenDespachoId ? { ordenDespachoId: clienteModal.ordenDespachoId } : {}}
      />
    </div>
  )
}
