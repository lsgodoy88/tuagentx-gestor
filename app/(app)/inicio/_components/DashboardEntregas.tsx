'use client'
import { useEffect, useState, useCallback } from 'react'
import { fetchApi } from '@/lib/fetchApi'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import SaludoBlock from '@/components/SaludoBlock'
import TurnoBlock from '@/components/TurnoBlock'

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
  const [rutaIniciada,      setRutaIniciada]      = useState(false)
  const [accionandoRuta,    setAccionandoRuta]    = useState(false)
  const [todasRutasHoyIds,  setTodasRutasHoyIds]  = useState<string[]>([])
  const [rutaMañana,        setRutaMañana]        = useState<any>(null)
  const [adelantarRc,       setAdelantarRc]       = useState<any>(null)
  const [confirmCerrar,     setConfirmCerrar]     = useState(false)

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
    const data = await fetch('/api/rutas/mi-ruta').then(r => r.json()).catch(() => null)
    const r = data?.rutaHoy ?? null
    setRutaMañana(data?.rutaMañana ?? null)
    if (r) {
      setRuta(r)
      setRutaIniciada(r.iniciada === true)
      setTodasRutasHoyIds(r._todasRutasHoyIds || [r.id])
      setClientesOrdenados(r.clientes?.map((rc: any) => ({
        ...rc.cliente,
        supervisorEtiqueta: rc.supervisorEtiqueta || null,
        rezago: rc.rezago,
        orden: rc.orden,
        notas: rc.notas || null,
        ordenDespachoId: rc.ordenDespachoId || null,
        observacion: rc.observacion || null,
        ordenEstado: rc.ordenEstado || null,
        entregadoEl: rc.entregadoEl || null,
        numeroFactura: rc.numeroFactura || (() => { const m = (rc.notas||'').match(/#(\d+)/); return m ? m[1] : null })(),
        empresaOrigen: rc.empresaOrigen || (() => { const m = (rc.notas||'').match(/^Bodega\/([^#]+)/); return m ? m[1].trim() : null })(),
        alistadoPor: rc.alistadoPor || null,
        asignadoEn: rc.asignadoEn || null,
        ordenCreadaEl: rc.ordenCreadaEl || null,
      })) || [])
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/turnos').then(r => r.json()),
      fetch('/api/me').then(r => r.json()),
      cargarRuta(),
    ]).then(([t, me]) => {
      setTurno(t)
      setCargandoTurno(false)
      setPuedeCapturarGps(me?.puedeCapturarGps === true)
    })
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

  async function cerrarRuta() {
    if (!ruta || accionandoRuta) return
    setAccionandoRuta(true)
    setConfirmCerrar(false)
    await fetch(`/api/rutas/${ruta.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'cerrar', rutaIds: todasRutasHoyIds })
    })
    await cargarRuta()
    setAccionandoRuta(false)
  }

  async function iniciarRuta() {
    if (!ruta || accionandoRuta) return
    setAccionandoRuta(true)
    await fetch(`/api/rutas/${ruta.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'iniciar', rutaIds: todasRutasHoyIds })
    })
    setRutaIniciada(true)
    setAccionandoRuta(false)
  }

  return (
    <div className="space-y-3 pb-20 md:max-w-2xl md:mx-auto">
      {!turno && !cargandoTurno && <SaludoBlock nombre={user?.name} />}
      <TurnoBlock
        turno={turno}
        cargando={cargandoTurno}
        bloqueado={bloqueadoTurno}
        obteniendoGps={obteniendoGps}
        onIniciar={iniciarTurno}
        onCerrar={cerrarTurno}
      />

      {/* Ruta del día */}
      {ruta && totalClientes > 0 && (
        <div className="rounded-2xl overflow-hidden card-glass" style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)'}}>
          {!rutaIniciada && (
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 bg-emerald-500/10">
              <p className="text-emerald-300 text-sm">Inicia tu ruta para comenzar las entregas</p>
              <button onClick={iniciarRuta} disabled={accionandoRuta}
                className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors">
                {accionandoRuta ? '...' : '🚀 Iniciar'}
              </button>
            </div>
          )}
          <Link href="/mapa-ruta" className="px-4 py-3 border-b border-white/20 flex items-center justify-between hover:bg-white/5 transition-colors">
            <span className="text-white font-bold">📦 Ruta de hoy →</span>
            <span className="text-white text-sm font-semibold">{ejecutadosRuta}/{totalClientes} entregas</span>
          </Link>
          <div className="divide-y divide-white/20">
            {clientesOrdenados.slice().sort((a, b) => {
              const eA = a.ordenEstado === 'entregado' || ordenesEntregadas.has(a.ordenDespachoId)
              const eB = b.ordenEstado === 'entregado' || ordenesEntregadas.has(b.ordenDespachoId)
              if (eA !== eB) return eA ? 1 : -1
              return a.orden - b.orden
            }).map(c => {
              const entregado = c.ordenEstado === 'entregado' || ordenesEntregadas.has(c.ordenDespachoId)
              const horaEntrega = c.entregadoEl
                ? new Date(c.entregadoEl).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' })
                : null
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
                  horaEntrega={horaEntrega}
                  turnoActivo={!!turno}
                  rutaActiva={rutaIniciada}
                  observacion={c.observacion}
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
          {rutaIniciada && !ruta?.cerrada && (
            <div className="px-4 py-3 border-t border-white/10 flex justify-end">
              <button onClick={() => setConfirmCerrar(true)} disabled={accionandoRuta}
                className="text-red-400 hover:text-red-300 text-sm font-bold disabled:opacity-30 transition-colors">
                Cerrar ruta de hoy
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ruta mañana */}
      {rutaMañana && rutaMañana.clientes?.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)'}}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-zinc-400 font-semibold text-sm">🗓 Mañana — En espera</span>
            <span className="text-zinc-500 text-xs">{rutaMañana.clientes.length} orden{rutaMañana.clientes.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="divide-y divide-white/5">
            {rutaMañana.clientes.map((rc: any) => {
              const nombre = rc.cliente?.nombre || rc.nombre || '—'
              const empresaOrigen = rc.empresaOrigen || (() => { const m = (rc.notas||'').match(/^Bodega\/([^#]+)/); return m ? m[1].trim() : null })()
              const numeroFactura = rc.numeroFactura || (() => { const m = (rc.notas||'').match(/#(\d+)/); return m ? m[1] : null })()
              const notaBodega = empresaOrigen
                ? `Bodega/${empresaOrigen}${numeroFactura ? ` F_${numeroFactura}` : ''}`
                : numeroFactura ? `F_${numeroFactura}` : rc.notas || null
              const horaEnviado = rc.ordenCreadaEl
                ? new Date(rc.ordenCreadaEl).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' })
                : null
              const direccion = rc.cliente?.direccion || null
              const telefono = rc.cliente?.telefono || null
              const observacion = rc.observacion || null
              return (
                <div key={rc.id} className="px-4 py-2.5 cursor-pointer active:opacity-70" onClick={() => rutaIniciada && setAdelantarRc(rc)}>
                  {/* L1 — hora enviado + nombre */}
                  <div className="flex items-center gap-2 mb-0.5">
                    {horaEnviado && <span className="text-emerald-400 text-xs font-semibold flex-shrink-0">{horaEnviado}</span>}
                    <p className="text-white font-bold text-sm truncate flex-1">{nombre}</p>
                  </div>
                  {/* L2 — dirección */}
                  {direccion && <p className="text-zinc-400 text-sm truncate mb-0.5">{direccion}</p>}
                  {/* L3 — factura + teléfono */}
                  {(notaBodega || telefono) && (
                    <div className="flex items-center justify-between">
                      {notaBodega && <p className="text-zinc-300 text-xs truncate flex-1">{notaBodega}</p>}
                      {telefono && <span className="text-red-400 text-xs flex-shrink-0 ml-2">✆ {telefono}</span>}
                    </div>
                  )}
                  {observacion && <p className="text-zinc-500 text-xs mt-0.5 truncate">✍🏼 {observacion}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal adelantar orden a hoy */}
      {adelantarRc && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full p-5 space-y-4">
            <p className="text-white font-semibold text-base">¿Agregar a la ruta de hoy?</p>
            <div className="bg-zinc-800 rounded-xl p-3 space-y-1">
              <p className="text-white text-sm font-semibold truncate">{adelantarRc.cliente?.nombre || adelantarRc.nombre || '—'}</p>
              {(adelantarRc.cliente?.direccion) && <p className="text-zinc-400 text-xs truncate">{adelantarRc.cliente.direccion}</p>}
              {(() => { const emp = adelantarRc.empresaOrigen || (adelantarRc.notas||'').match(/^Bodega\/([^#]+)/)?.[1]?.trim(); const num = adelantarRc.numeroFactura || (adelantarRc.notas||'').match(/#(\d+)/)?.[1]; const nota = emp ? `Bodega/${emp}${num ? ` F_${num}` : ''}` : num ? `F_${num}` : null; return nota ? <p className="text-zinc-400 text-xs truncate">{nota}</p> : null })()}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setAdelantarRc(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-semibold">
                Cancelar
              </button>
              <button onClick={async () => {
                if (!rutaMañana) return
                await fetch(`/api/rutas/${rutaMañana.id}/adelantar`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rutaClienteIds: [adelantarRc.id] })
                })
                setAdelantarRc(null)
                cargarRuta()
              }} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
                Sí, agregar a hoy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar cerrar ruta */}
      {confirmCerrar && (() => {
        const pendientesCount = clientesOrdenados.filter(c => c.ordenEstado !== 'entregado' && !ordenesEntregadas.has(c.ordenDespachoId)).length
        const entregadosCount = clientesOrdenados.length - pendientesCount
        return (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full p-5 space-y-4">
              <p className="text-white font-semibold text-base">¿Cerrar ruta de hoy?</p>
              <div className="bg-zinc-800 rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">✓ Entregadas</span>
                  <span className="text-emerald-400 font-semibold">{entregadosCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">⏳ Pendientes → mañana</span>
                  <span className="text-amber-400 font-semibold">{pendientesCount}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmCerrar(false)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-semibold">
                  Cancelar
                </button>
                <button onClick={cerrarRuta}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold">
                  Cerrar ruta
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal entrega */}
      <ModalVisita
        key={clienteModal?.id || 'sin-cliente'}
        open={!!clienteModal}
        onClose={() => setClienteModal(null)}
        facturaPreset={clienteModal?.numeroFactura || undefined}
        empresaOrigen={clienteModal?.empresaOrigen || undefined}
        onRegistrado={() => {
          const oid = clienteModal?.ordenDespachoId
          if (oid) setOrdenesEntregadas(prev => new Set([...prev, oid]))
          setClienteModal(null)
          cargarRuta()
        }}
        clienteInicial={clienteModal}
        tipoForzado="entrega"
        distanciaLejos={distanciaLejos}
        puedeCapturarGps={puedeCapturarGps}
        titulo="📦 Registrar entrega"
        extraData={clienteModal?.ordenDespachoId ? { ordenDespachoId: clienteModal.ordenDespachoId } : {}}
      />
      {/* Card Rutas */}
      <Link href="/rutas-entregas"
        className='card-glass' style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)', borderRadius:16, display:'block', padding:'12px 16px'}}>
        <div className="flex items-center justify-between">
          <span className="text-white font-semibold">📋 Mis Rutas</span>
          <span className="text-zinc-400 text-sm">→</span>
        </div>
      </Link>
    </div>
  )
}
