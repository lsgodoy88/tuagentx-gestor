'use client'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { fetchApi } from '@/lib/fetchApi'
import dynamic from 'next/dynamic'
const ModalVisita = dynamic(() => import('@/components/ModalVisita'), { ssr: false })
const MapaEnVivo  = dynamic(() => import('@/components/MapaEnVivo'),  { ssr: false })
const MapaHistorialCliente = dynamic(() => import('@/components/MapaHistorialCliente'), { ssr: false })
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
  const [historialCursor, setHistorialCursor] = useState<string|null>(null)
  const [historialHasMore, setHistorialHasMore] = useState(false)
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [buscarHistorial, setBuscarHistorial] = useState('')
  const [fechaHistorial, setFechaHistorial] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [tab, setTab] = useState<'mapa' | 'nueva' | 'historial'>('mapa')
  const searchParams = useSearchParams()

  // Activar tab historial y prellenar búsqueda desde URL — esperar sesión
  const [urlParamsApplied, setUrlParamsApplied] = useState(false)
  const [selectedGps, setSelectedGps] = useState<{lat:number,lng:number}|null>(null)
  const clientesUnicos = [...new Set(historial.map(v => v.clienteId).filter(Boolean))]
  const clienteEspecifico = clientesUnicos.length === 1 && historial.length > 0
  const [sugerencias, setSugerencias] = useState<any[]>([])
  const [showSug, setShowSug] = useState(false)
  const sugRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!session || urlParamsApplied) return
    const tabParam = searchParams.get('tab')
    const qParam = searchParams.get('q')
    if (tabParam === 'historial') {
      setTab('historial')
      if (qParam) {
        setBuscarHistorial(qParam)
        loadHistorial(qParam, '', null)
      }
      setUrlParamsApplied(true)
    }
  }, [session])

  // Firma viewer
  const [firmaVer, setFirmaVer] = useState<any>(null)
  const [firmaUrlGenerada, setFirmaUrlGenerada] = useState<string | null>(null)
  const [detalleCliente, setDetalleCliente] = useState<string | null>(null)
  const [visitaModal, setVisitaModal] = useState<any>(null)
  const [ordenesAsignadas, setOrdenesAsignadas] = useState<any[]>([])
  const [clienteModal, setClienteModal] = useState<any>(null)

  useEffect(() => {
    loadHoy()
    if (isEntregas) {
      fetch('/api/bodega/despachos?estado=en_entrega').then(r => r.json()).then(d => {
        setOrdenesAsignadas(d.despachos?.filter((o: any) => o.estado === 'en_entrega') || [])
      }).catch(() => {})
    }
  }, [])

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

  async function buscarClientes(q: string) {
    if (q.length < 2) { setSugerencias([]); return }
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&limit=8`).then(r => r.json())
    setSugerencias(Array.isArray(res?.clientes) ? res.clientes : Array.isArray(res) ? res : [])
  }

  async function loadHistorial(q: string, fecha: string, cursor: string | null = null) {
    if (!cursor) setLoadingHistorial(true); else setLoadingMore(true)
    const params = new URLSearchParams({ limit: '15' })
    if (q) params.set('q', q)
    if (fecha) params.set('fecha', fecha)
    if (cursor) params.set('cursor', cursor)
    const data = await fetch('/api/visitas/todas?' + params).then(r => r.json())
    const nuevas = data.visitas ?? []
    setHistorial(!cursor ? nuevas : prev => [...prev, ...nuevas])
    setHistorialCursor(data.nextCursor ?? null)
    setHistorialHasMore(data.hasMore ?? false)
    setHistorialTotal(!cursor ? nuevas.length : prev => prev + nuevas.length)
    if (!cursor) setLoadingHistorial(false); else setLoadingMore(false)
  }

  // Cargar historial al abrir tab
  useEffect(() => {
    if (tab === 'historial' && historial.length === 0 && !searchParams.get('q')) {
      loadHistorial('', '', null)
    }
  }, [tab])

  const hoyStr = new Date(Date.now() - 5*60*60*1000).toISOString().split('T')[0]
  const visitasLibres = visitasHoy.filter(v => v.esLibre)

  const TIPO_ICON: Record<string, string> = { venta: '💰', cobro: '💵', recaudo: '💵', entrega: '📦' }
  const TIPO_COLOR: Record<string, string> = { venta: '#34d399', cobro: '#34d399', recaudo: '#34d399', entrega: '#60a5fa' }

  function CardVisita({ v }: { v: any }) {
    const fecha = new Date(v.createdAt).toLocaleDateString('es-CO', {day:'numeric', month:'short', timeZone: 'America/Bogota'})
    const hora  = new Date(v.createdAt).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', timeZone: 'America/Bogota'})
    const mapsUrl = v.lat ? `https://www.google.com/maps?q=${v.lat},${v.lng}` : v.cliente?.maps || null
    return (
      <div className="rounded-2xl overflow-hidden" style={{background:"#1e243a", border:"1px solid #1e3a5f"}}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <p className="text-white text-sm font-medium flex-1 min-w-0 truncate">{v.cliente?.nombre || 'Sin cliente'}</p>
          {v.cliente?.direccion && <p className="text-zinc-500 text-xs hidden md:block truncate max-w-[160px]">{v.cliente.direccion}</p>}
          {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-zinc-500 text-xs hover:text-emerald-400 flex-shrink-0">🗺️</a>}
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <span className="text-sm flex-shrink-0">{TIPO_ICON[v.tipo] || '👁️'}</span>
          <span className="text-zinc-300 text-xs capitalize flex-shrink-0">{v.tipo}</span>
          <span className="text-zinc-600 text-xs flex-shrink-0">·</span>
          <span className="text-zinc-400 text-xs flex-shrink-0">{fecha} · {hora}</span>
          {v.monto ? <span className="text-emerald-400 text-xs font-medium ml-auto flex-shrink-0">${Number(v.monto).toLocaleString('es-CO')}</span> : null}
        </div>
      </div>
    )
  }

  function HistorialGroup({ clienteId, visitas }: { clienteId: string, visitas: any[] }) {
    const cli = visitas[0]?.cliente
    const conGps = visitas.find(v => v.lat)
    const mapsUrl = conGps ? `https://www.google.com/maps?q=${conGps.lat},${conGps.lng}` : cli?.maps || null
    return (
      <div className="rounded-2xl overflow-hidden" style={{background:"#1e243a", border:"1px solid #1e3a5f"}}>
        {/* Encabezado cliente — una línea */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
          <span className="text-white text-sm font-medium flex-1 min-w-0 truncate">{cli?.nombre || 'Sin cliente'}</span>
          {cli?.direccion && <span className="text-zinc-500 text-xs hidden md:block truncate max-w-[200px] flex-shrink-0">{cli.direccion}</span>}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer"
              className="flex-shrink-0 text-zinc-400 hover:text-emerald-400 text-xs flex items-center gap-1 transition-colors"
              style={{whiteSpace:'nowrap'}}>
              🗺️ <span className="hidden md:inline">Maps</span>
            </a>
          )}
        </div>
        {/* Visitas — una línea por visita */}
        {visitas.map((v, i) => {
          const fecha = new Date(v.createdAt).toLocaleDateString('es-CO', {day:'numeric', month:'short', timeZone: 'America/Bogota'})
          const hora  = new Date(v.createdAt).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', timeZone: 'America/Bogota'})
          return (
            <div key={v.id} className="flex items-center gap-3 px-4 py-2" style={{borderBottom: i < visitas.length-1 ? '1px solid #1e2a3d' : 'none'}}>
              <span className="text-sm flex-shrink-0">{TIPO_ICON[v.tipo] || '👁️'}</span>
              <span className="text-zinc-300 text-xs capitalize flex-shrink-0" style={{minWidth:56}}>{v.tipo}</span>
              <span className="text-zinc-500 text-xs flex-shrink-0 hidden md:block">·</span>
              <span className="text-zinc-400 text-xs flex-shrink-0">{fecha} · {hora}</span>
              <span className="flex-1" />
              {v.monto ? <span className="text-emerald-400 text-xs font-medium flex-shrink-0">${Number(v.monto).toLocaleString('es-CO')}</span> : null}
              {v.lat && <button onClick={()=>setSelectedGps({lat:v.lat!,lng:v.lng!})} className="text-zinc-500 hover:text-emerald-400 flex-shrink-0 ml-1 border-none bg-transparent cursor-pointer" style={{fontSize:14,padding:0}} title="Ver en mapa">📍</button>}
            </div>
          )
        })}
      </div>
    )
  }

  function SkeletonCard() {
    return <div className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-2xl h-16" />
  }

  return (
    <div className="max-w-2xl md:max-w-none mx-auto space-y-6 pb-24 md:pb-0">
      <div className="flex gap-2 items-center">
        {/* Tabs */}
        <div className="flex gap-1 tab-pills rounded-xl p-1 flex-1">
          <button onClick={() => setTab('mapa')}
            className={"flex-1 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === 'mapa' ? "tab-active" : "text-white hover:text-white")}>
            🗺️ Mapa
          </button>
          <button onClick={() => setTab('nueva')}
            className={"flex-1 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === 'nueva' ? "tab-active" : "text-white hover:text-white")}>
            {isEntregas ? '📦 Nueva' : '📍 Nueva'}
          </button>
          <button onClick={() => setTab('historial')}
            className={"flex-1 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === 'historial' ? "tab-active" : "text-white hover:text-white")}>
            📋 Historial
          </button>
        </div>
        {/* Controles historial desktop — inline con tabs */}
        {tab === 'historial' && (
          <div className="hidden md:flex gap-2 items-center flex-shrink-0">
            {/* Buscador con autocomplete */}
            <div style={{position:'relative',display:'flex',alignItems:'center',background:'#1e243a',border:'1px solid #1e3a5f',borderRadius:10,padding:'0 10px',gap:6}}>
              <span style={{color:'#4b7cb5',fontSize:14,flexShrink:0}}>🔍</span>
              <input value={buscarHistorial} onChange={e => {
                const q = e.target.value
                setBuscarHistorial(q)
                setFechaHistorial('')
                clearTimeout(debounceRef.current)
                clearTimeout(sugRef.current)
                sugRef.current = setTimeout(() => { buscarClientes(q); setShowSug(true) }, 300)
              }}
                placeholder="Buscar cliente..."
                autoComplete="off"
                onFocus={() => { if (buscarHistorial.length >= 2) setShowSug(true) }}
                onBlur={() => setTimeout(() => setShowSug(false), 200)}
                style={{background:'none',border:'none',color:'white',fontSize:12,outline:'none',width:180,padding:'7px 0'}} />
              {buscarHistorial && <button onClick={()=>{setBuscarHistorial('');setSugerencias([]);loadHistorial('','',null)}} style={{background:'none',border:'none',color:'#6b7280',cursor:'pointer',fontSize:14,padding:0,flexShrink:0}}>×</button>}
              {showSug && sugerencias.length > 0 && (
                <div style={{position:'absolute',top:'100%',left:0,zIndex:50,background:'#1e243a',border:'1px solid #1e3a5f',borderRadius:10,minWidth:260,marginTop:4,overflow:'hidden'}}>
                  {sugerencias.map((cl:any) => (
                    <button key={cl.id} onMouseDown={() => {
                      setShowSug(false); setSugerencias([])
                      setBuscarHistorial(cl.nit || cl.nombre)
                      loadHistorial(cl.nit || cl.nombre, '', null)
                    }} style={{width:'100%',textAlign:'left',padding:'8px 14px',background:'none',border:'none',borderBottom:'1px solid #1e3a5f',color:'white',fontSize:12,cursor:'pointer'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='#0f2540')}
                      onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                      <span style={{fontWeight:500}}>{cl.nombre}</span>
                      {cl.nit && <span style={{color:'#6b7280',marginLeft:6}}>{cl.nit}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Dropdown empleados */}
            <select onChange={e => { setBuscarHistorial(''); loadHistorial('', fechaHistorial, null) }}
              style={{background:'#1e243a',border:'1px solid #1e3a5f',borderRadius:10,padding:'7px 10px',color:'white',fontSize:12,outline:'none',cursor:'pointer'}}>
              <option value="">Todos los empleados</option>
            </select>
            {/* Calendario */}
            <div className="relative flex-shrink-0">
              <input type="date" value={fechaHistorial} onChange={e => {
                const f = e.target.value
                setFechaHistorial(f)
                setBuscarHistorial('')
                clearTimeout(debounceRef.current)
                loadHistorial('', f, null)
              }} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
              <div style={{display:'flex',alignItems:'center',gap:4,padding:'7px 10px',borderRadius:10,fontSize:12,border:'1px solid',cursor:'pointer',
                background: fechaHistorial ? '#09091e' : '#1e243a',
                borderColor: fechaHistorial ? '#2563eb' : '#1e3a5f',
                color: fechaHistorial ? 'white' : 'rgba(255,255,255,0.5)'}}>
                📅{fechaHistorial ? ' '+new Date(fechaHistorial + 'T12:00:00Z').toLocaleDateString('es-CO', {day:'numeric', month:'short', timeZone: 'America/Bogota'}) : ''}
                {fechaHistorial && <button onClick={e => { e.stopPropagation(); setFechaHistorial(''); loadHistorial('', '', null) }} style={{background:'none',border:'none',color:'rgba(255,255,255,0.7)',cursor:'pointer',fontSize:14,lineHeight:1,padding:0,marginLeft:2}}>×</button>}
              </div>
            </div>
          </div>
        )}
      </div>

      {tab === 'mapa' && <div style={{marginTop:-12}}><MapaEnVivo embebido /></div>}

      {tab === 'nueva' && (
        <div className="space-y-4">
          {turno && puedeRegistrar ? (
            isEntregas ? (
              <div className="space-y-2">
                {ordenesAsignadas.length === 0 && (
                  <div className="border border-zinc-800 rounded-2xl p-4 text-center" style={{background:"#1e243a"}}>
                    <p className="text-zinc-400 text-sm">No tienes órdenes asignadas pendientes de entrega</p>
                  </div>
                )}
                {ordenesAsignadas.map((o: any) => (
                  <div key={o.id} className="border border-zinc-800 rounded-2xl px-4 py-3 flex items-center justify-between gap-3" style={{background:"#1e243a"}}>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-semibold truncate">#{o.numeroFactura || o.numeroOrden} · {o.clienteNombre}</p>
                      {o.ciudad && <p className="text-zinc-400 text-xs">{o.ciudad}</p>}
                    </div>
                    <button onClick={() => {
                      setClienteModal({ id: o.clienteId, nombre: o.clienteNombre, ordenDespachoId: o.id, ordenNumero: o.numeroOrden })
                    }} className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
                      Entregar
                    </button>
                  </div>
                ))}
              </div>
            ) : (
            <button onClick={() => setModal(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl text-lg transition-colors">
              + Registrar visita libre
            </button>
            )
          ) : turno && !puedeRegistrar ? (
            <div className="border border-zinc-800 rounded-2xl p-4 text-center" style={{background:"#1e243a"}}>
              <p className="text-zinc-400 text-sm">Sin permiso para registrar visitas</p>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-2xl p-4 text-center" style={{background:"#1e243a"}}>
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
          {/* Filtros mobile — en desktop van junto a los tabs */}
          <div className="flex gap-2 md:hidden">
            <input value={buscarHistorial} onChange={e => {
              const q = e.target.value
              setBuscarHistorial(q)
              setFechaHistorial('')
              clearTimeout(debounceRef.current)
              debounceRef.current = setTimeout(() => loadHistorial(q, '', null), 500)
            }}
              placeholder="Buscar cliente..."
              style={{ flex:1, background:'#1e243a', border:'1px solid #1e3a5f', borderRadius:10, padding:'10px 14px', color:'white', fontSize:13, outline:'none' }} />
            <div className="relative flex-shrink-0">
              <input type="date" value={fechaHistorial} onChange={e => {
                const f = e.target.value
                setFechaHistorial(f)
                setBuscarHistorial('')
                clearTimeout(debounceRef.current)
                loadHistorial('', f, null)
              }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full" />
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 12px', borderRadius:10, fontSize:13, fontWeight:600, border:'1px solid', cursor:'pointer',
                background: fechaHistorial ? '#09091e' : '#0c0c1c',
                borderColor: fechaHistorial ? '#2563eb' : '#1e3a5f',
                color: fechaHistorial ? 'white' : 'rgba(255,255,255,0.5)',
              }}>
                📅 {fechaHistorial ? new Date(fechaHistorial + 'T12:00:00Z').toLocaleDateString('es-CO', {day:'numeric', month:'short', timeZone: 'America/Bogota'}) : 'Fecha'}
                {fechaHistorial && <button onClick={e => { e.stopPropagation(); setFechaHistorial(''); loadHistorial('', '', null) }} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:14, lineHeight:1, padding:0, marginLeft:2 }}>×</button>}
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
            <div className={clienteEspecifico ? "hidden md:flex gap-4 items-start" : ""}>
              <div className={clienteEspecifico ? "flex-1 min-w-0 space-y-2" : "space-y-2"}>
              {(() => {
                const groups: Record<string, any[]> = {}
                historial.forEach(v => {
                  const key = v.clienteId || 'sin-cliente'
                  if (!groups[key]) groups[key] = []
                  groups[key].push(v)
                })
                return Object.entries(groups).map(([key, visitas]) => (
                  <HistorialGroup key={key} clienteId={key} visitas={visitas} />
                ))
              })()}
              {historialHasMore && (
                <div style={{textAlign:"center"}}><button onClick={() => loadHistorial(buscarHistorial, fechaHistorial, historialCursor)} disabled={loadingMore}
                  style={{background:"#1e2a3d",border:"1px solid #1e3a5f",borderRadius:10,padding:"6px 18px",color:"white",fontSize:13,cursor:"pointer"}}>
                  {loadingMore ? 'Cargando...' : 'Cargar más'}</button></div>
              )}
              </div>
              {clienteEspecifico && historial.some(v => v.lat) && (
                <div className="hidden md:block flex-shrink-0" style={{width:420,height:520,position:'sticky',top:16}}>
                  <MapaHistorialCliente visitas={historial} selected={selectedGps} />
                </div>
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

      {/* Modal entrega por orden asignada */}
      {clienteModal && (
        <ModalVisita
          key={clienteModal.id}
          open={!!clienteModal}
          onClose={() => setClienteModal(null)}
          onRegistrado={() => {
            setClienteModal(null)
            loadHoy()
            fetch('/api/bodega/despachos?estado=en_entrega').then(r => r.json()).then(d => {
              setOrdenesAsignadas(d.despachos?.filter((o: any) => o.estado === 'en_entrega') || [])
            }).catch(() => {})
          }}
          clienteInicial={clienteModal}
          tipoForzado="entrega"
          puedeCapturarGps={puedeCapturarGps}
          titulo="📦 Registrar entrega"
          extraData={{ ordenDespachoId: clienteModal.ordenDespachoId }}
          facturaPreset={clienteModal.ordenNumero}
        />
      )}

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
