'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { CountUp, LiveDot } from '@/components/FX'
const MapaVivo = dynamic(() => import('@/app/(app)/mapa/MapaVivo'), { ssr: false })
const COLORES = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']
const ROLES_EXCLUIDOS = ['bodega', 'admin', 'empresa', 'supervisor', 'superadmin']

function FirmaInline({ firma }: { firma: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  async function ver() {
    if (url) { setUrl(null); return }
    setCargando(true)
    const res = await fetch('/api/firma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firma }) }).then(r => r.json())
    if (res.url) setUrl(res.url)
    setCargando(false)
  }
  return (
    <div>
      <button onClick={ver} className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-lg">
        {cargando ? 'Cargando...' : url ? 'Ocultar firma' : 'Ver firma'}
      </button>
      {url && <div className="bg-white rounded-lg p-2 mt-2"><img src={url} alt="Firma" className="w-full rounded" /></div>}
    </div>
  )
}


interface SelectorEmpleadoProps {
  empleados: any[]
  empleadoId: string
  onChange: (id: string) => void
}

function SelectorEmpleado({ empleados, empleadoId, onChange }: SelectorEmpleadoProps) {
  const [open, setOpen] = useState(true)
  const filtrados = empleados.filter((e: any) => !ROLES_EXCLUIDOS.includes(e.rol))
  const idx = filtrados.findIndex((e: any) => e.id === empleadoId)
  const label = idx >= 0 ? filtrados[idx].nombre.split(' ').filter(Boolean).slice(0,2).join(' ') : 'Todos los vendedores'
  return (
    <div style={{position:'relative',flexShrink:0}}>
      <button onClick={() => setOpen(o => !o)}
        style={{display:'flex',alignItems:'center',gap:6,background:'#0d1220',border:'1px solid #1e2a3d',borderRadius:10,padding:'7px 12px',color:'white',fontSize:13,fontWeight:600,cursor:'pointer',maxWidth:180,overflow:'hidden'}}>
        {idx >= 0 && <span style={{width:8,height:8,borderRadius:'50%',background:COLORES[idx % COLORES.length],display:'inline-block',flexShrink:0}} />}
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{label}</span>
        <span style={{color:'#64748b',fontSize:10}}>{open?'▲':'▼'}</span>
      </button>
      {open && <div style={{position:'fixed',inset:0,zIndex:999}} onClick={() => setOpen(false)} />}
      {open && (
        <div style={{position:'absolute',top:'calc(100% + 4px)',right:0,zIndex:1000,background:'#0d1220',border:'1px solid #1e2a3d',borderRadius:10,overflow:'hidden',minWidth:200,boxShadow:'0 8px 24px rgba(0,0,0,0.6)'}}>
          {empleadoId && <button onClick={() => { onChange(''); setOpen(false) }}
            style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',background:'none',border:'none',borderBottom:'1px solid #131c2e',color:'white',fontSize:13,cursor:'pointer',textAlign:'left'}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:'#64748b',display:'inline-block',flexShrink:0}} />
            Todos los vendedores
          </button>}
          {filtrados.filter((e: any) => e.id !== empleadoId).map((e: any, i: number) => (
            <button key={e.id} onClick={() => { onChange(e.id); setOpen(false) }}
              style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',background:e.id===empleadoId?'rgba(59,130,246,0.1)':'none',border:'none',borderBottom:'1px solid #131c2e',color:'white',fontSize:13,cursor:'pointer',textAlign:'left'}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:COLORES[i % COLORES.length],display:'inline-block',flexShrink:0}} />
              {(e.nombre||'').split(' ').filter(Boolean).slice(0,2).join(' ')} · {e.rol}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MapaEnVivo({ embebido = false }: { embebido?: boolean }) {
  const [datos, setDatos] = useState<any>({ visitas: [], empleados: [] })
  const [fecha, setFecha] = useState(new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0])
  const { data: session } = useSession()
  const rol = (session?.user as any)?.role || ''
  const esEmpleado = !rol || ['vendedor', 'entregas'].includes(rol)
  const [empleadoId, setEmpleadoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [visitaSeleccionada, setVisitaSeleccionada] = useState<any>(null)
  const searchParams = useSearchParams()
  const rutaId = embebido ? null : searchParams.get('rutaId')

  useEffect(() => { loadData() }, [fecha, empleadoId, rutaId])

  async function loadData() {
    setLoading(true)
    const params = new URLSearchParams(rutaId ? {} : { fecha })
    if (empleadoId) params.append('empleadoId', empleadoId)
    if (rutaId) params.append('rutaId', rutaId)
    const res = await fetch(`/api/mapa?${params}`)
    const data = await res.json()
    setDatos(data)
    setLoading(false)
  }

  const colorEmpleado = (id: string) => {
    const idx = datos.empleados.findIndex((e: any) => e.id === id)
    return COLORES[idx % COLORES.length] || COLORES[0]
  }

  return (
    <div className="space-y-3">
      {!embebido && (
        <div>
          <div className="flex items-center gap-2">
            {rutaId && (
              <Link href="/rutas" className="text-zinc-400 hover:text-white text-lg">←</Link>
            )}
            <h1 className="text-lg font-bold text-white flex-1">
              {rutaId ? `🗺️ ${datos.rutaNombre || 'Ruta'}` : 'Mapa en vivo'}
            </h1>
          </div>
          {!rutaId && (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-zinc-400 text-sm flex-1 flex items-center gap-2"><CountUp end={datos.visitas.length} /> visitas con GPS {datos.visitas.length > 0 && <LiveDot color="emerald" />}</p>
              {!esEmpleado && <SelectorEmpleado empleados={datos.empleados} empleadoId={empleadoId} onChange={setEmpleadoId} />}
              <div className="relative flex-shrink-0">
                <button onClick={() => (document.getElementById("mapa-fecha") as HTMLInputElement)?.showPicker?.()}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-sm">
                  📅
                </button>
                <input id="mapa-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  className="absolute opacity-0 pointer-events-none top-0 left-0 w-0 h-0" />
              </div>
            </div>
          )}
          {rutaId && <p className="text-zinc-400 text-sm mt-1 flex items-center gap-2"><CountUp end={datos.visitas.length} /> visitas con GPS {datos.visitas.length > 0 && <LiveDot color="emerald" />}</p>}
        </div>
      )}

      {embebido && (
        <div className="flex items-center gap-2">
          <p className="text-zinc-400 text-sm flex-1 flex items-center gap-2"><CountUp end={datos.visitas.length} /> visitas con GPS {datos.visitas.length > 0 && <LiveDot color="emerald" />}</p>
          {!esEmpleado && <SelectorEmpleado empleados={datos.empleados} empleadoId={empleadoId} onChange={setEmpleadoId} />}
          <div className="relative flex-shrink-0">
            <button onClick={() => (document.getElementById("mapa-fecha-tab") as HTMLInputElement)?.showPicker?.()}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-sm">
              📅
            </button>
            <input id="mapa-fecha-tab" type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="absolute opacity-0 pointer-events-none top-0 left-0 w-0 h-0" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{minHeight:'320px'}}>
        <div className="lg:col-span-2 border border-zinc-800 rounded-2xl overflow-hidden" style={{background:"#0d1220",height:'clamp(400px, 85vw, 560px)'}}>
          {loading ? (
            <div className="h-full p-4 space-y-3"><div className="shimmer h-full rounded-xl" /></div>
          ) : datos.visitas.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-2">
              <span className="text-4xl">🗺️</span>
              <p>Sin visitas con GPS en esta fecha</p>
            </div>
          ) : (
            <MapaVivo
              visitas={datos.visitas}
              colorEmpleado={colorEmpleado}
              onVisitaClick={setVisitaSeleccionada}
            />
          )}
        </div>

        <div className="border border-zinc-800 rounded-2xl p-3 overflow-y-auto" style={{background:"#0d1220", maxHeight: window && window.innerWidth < 1024 ? "none" : "500px"}}>
          <p className="text-zinc-600 text-[10px] font-bold tracking-widest mb-2 px-1">TIMELINE</p>
          {datos.visitas.length === 0 ? (
            <p className="text-zinc-600 text-sm px-1">Sin visitas</p>
          ) : (
            <div className="space-y-1">
              {datos.visitas.map((v: any, i: number) => {
                const isOpen = visitaSeleccionada?.id === v.id
                const tipoIcon: Record<string, string> = { visita: '🤝', recaudo: '💵', venta: '🧾', entrega: '📦' }
                const icon = tipoIcon[v.tipo] ?? '🤝'
                const hora = new Date(v.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
                const dir = [v.cliente?.direccion, v.cliente?.ciudad].filter(Boolean).join(', ')
                const mapsUrl = v.lat && v.lng ? `https://www.google.com/maps?q=${v.lat},${v.lng}` : (v.cliente?.maps || null)
                return (
                  <div key={v.id}
                    className={`border rounded-xl overflow-hidden transition-colors fade-up stagger-${Math.min(i+1,8)} ${isOpen ? 'border-zinc-600' : 'border-zinc-800 hover:border-zinc-700'}`} style={{background:"#0d1220"}}>
                    {/* Línea 1 — siempre visible */}
                    <button onClick={() => setVisitaSeleccionada(isOpen ? null : v)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left">
                      {!esEmpleado && (
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorEmpleado(v.empleadoId) }} />
                      )}
                      <span className="text-sm flex-shrink-0">{icon}</span>
                      <span className="text-white text-xs font-medium flex-1 truncate">{v.clienteNombreLibre || v.cliente?.nombre || v.cliente?.nombreComercial}</span>
                      <span className="text-zinc-500 text-[11px] flex-shrink-0 tabular-nums">{hora}</span>
                    </button>
                    {/* Línea 2 — solo desplegada */}
                    {isOpen && dir && (
                      <div className="flex items-center gap-2 px-3 pb-2">
                        <span className="text-zinc-500 text-[11px] flex-1 truncate">{dir}</span>
                        {mapsUrl && (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 text-[11px] font-semibold text-zinc-400 border border-zinc-600 rounded-md px-2 py-0.5 hover:text-white hover:border-zinc-500 transition-colors">
                            ↗ Maps
                          </a>
                        )}
                      </div>
                    )}
                    {isOpen && !dir && mapsUrl && (
                      <div className="px-3 pb-2">
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-zinc-400 border border-zinc-600 rounded-md px-2 py-0.5 hover:text-white hover:border-zinc-500 transition-colors">
                          ↗ Maps
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>


    </div>
  )
}
