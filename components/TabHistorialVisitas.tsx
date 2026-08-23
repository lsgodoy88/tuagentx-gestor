'use client'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

const MapaHistorialCliente = dynamic(() => import('@/components/MapaHistorialCliente'), { ssr: false })

const TIPO_ICON: Record<string,string> = { venta:'💰', cobro:'💵', recaudo:'💵', entrega:'📦' }
const VIS_LIMIT = 15

interface Props {
  apiUrl: string          // '/api/visitas/admin' o '/api/visitas/todas'
  mostrarEmpleado: boolean // admin ve filtro de empleado, vendedor no
}

export default function TabHistorialVisitas({ apiUrl, mostrarEmpleado }: Props) {
  const [visitas, setVisitas] = useState<any[]>([])
  const [visTotal, setVisTotal] = useState(0)
  const [visPage, setVisPage] = useState(1)
  const [visLoading, setVisLoading] = useState(false)
  const [visClienteFiltro, setVisClienteFiltro] = useState('')
  const [visEmpleadoFiltro, setVisEmpleadoFiltro] = useState('')
  const [visFechaFiltro, setVisFechaFiltro] = useState('')
  const [visSugerencias, setVisSugerencias] = useState<any[]>([])
  const [visShowSug, setVisShowSug] = useState(false)
  const [visEmpleados, setVisEmpleados] = useState<any[]>([])
  const [visSelectedGps, setVisSelectedGps] = useState<{lat:number,lng:number}|null>(null)
  const [mapaClienteKey, setMapaClienteKey] = useState<string|null>(null)
  const visSugRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (mostrarEmpleado) {
      fetch('/api/empleados').then(r => r.json()).then(d => {
        setVisEmpleados(Array.isArray(d) ? d : d?.empleados || [])
      })
    }
    buscarVisitas(1)
  }, [])

  async function buscarClientesVis(q: string) {
    if (q.length < 2) return setVisSugerencias([])
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&limit=8`).then(r => r.json())
    setVisSugerencias(Array.isArray(res?.clientes) ? res.clientes : [])
  }

  async function buscarVisitas(p?: number, qOverride?: string, empOverride?: string) {
    const pg = p ?? visPage
    const qVal = qOverride !== undefined ? qOverride : visClienteFiltro
    const empVal = empOverride !== undefined ? empOverride : visEmpleadoFiltro
    setVisLoading(true)
    const params = new URLSearchParams()
    if (empVal) params.set('empleadoId', empVal)
    if (visFechaFiltro) params.set('fecha', visFechaFiltro)
    if (qVal) params.set('q', qVal)
    params.set('page', String(pg))
    params.set('limit', String(VIS_LIMIT))
    const res = await fetch(`${apiUrl}?${params}`).then(r => r.json())
    if (res?.visitas) { setVisitas(res.visitas); setVisTotal(res.total || 0) }
    else { setVisitas(Array.isArray(res) ? res : []); setVisTotal(0) }
    setVisPage(pg)
    setVisLoading(false)
  }


  // Agrupar por cliente
  const groups: Record<string, any[]> = {}
  visitas.forEach((v: any) => {
    const key = v.clienteId || 'sin-cliente'
    if (!groups[key]) groups[key] = []
    groups[key].push(v)
  })

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex gap-2 items-center flex-wrap">
        {/* Buscador cliente */}
        <div style={{position:'relative',display:'flex',alignItems:'center',background:'#1e243a',border:'1px solid #1e3a5f',borderRadius:10,padding:'0 10px',gap:6,flex:1,minWidth:160}}>
          <span style={{color:'#4b7cb5',fontSize:14,flexShrink:0}}>🔍</span>
          <input value={visClienteFiltro} onChange={e => {
            setVisClienteFiltro(e.target.value)
            clearTimeout(visSugRef.current)
            visSugRef.current = setTimeout(() => buscarVisitas(1, e.target.value), 400)
          }}
            placeholder="Buscar cliente..."
            autoComplete="off"
            onKeyDown={e => e.key === 'Enter' && buscarVisitas()}
            style={{background:'none',border:'none',color:'white',fontSize:12,outline:'none',flex:1,padding:'7px 0'}} />
          {visClienteFiltro && <button onClick={() => { setVisClienteFiltro(''); setVisSugerencias([]); buscarVisitas(1, '') }} style={{background:'none',border:'none',color:'#6b7280',cursor:'pointer',fontSize:14,padding:0,flexShrink:0}}>×</button>}

        </div>

        {/* Filtro empleado — solo admin */}
        {mostrarEmpleado && (
          <select value={visEmpleadoFiltro} onChange={e => { const v = e.target.value; setVisEmpleadoFiltro(v); buscarVisitas(1, undefined, v) }}
            className={visEmpleadoFiltro ? 'select-active' : ''}
            style={{background:'#0d1220',border:'1px solid #1e2a3d',borderRadius:10,padding:'7px 10px',color:'white',fontSize:12,outline:'none',cursor:'pointer',flexShrink:0,maxWidth:160}}>
            <option value="">Todos los empleados</option>
            {visEmpleados.filter((e: any) => e.activo).map((e: any) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        )}

        {/* Fecha */}
        <div className="relative flex-shrink-0">
          <input type="date" value={visFechaFiltro} onChange={e => { setVisFechaFiltro(e.target.value); buscarVisitas(1) }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full" />
          <div style={{display:'flex',alignItems:'center',gap:4,padding:'7px 10px',borderRadius:10,fontSize:12,border:'1px solid',cursor:'pointer',whiteSpace:'nowrap',
            background:'#0d1220',
            borderColor: visFechaFiltro ? '#ef4444' : '#1e2a3d',
            color:'white'}}>
            📅
          </div>
        </div>
      </div>


      {visLoading ? (
        <div className="space-y-2">{Array.from({length:4}).map((_,i) => <div key={i} className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-2xl h-16"/>)}</div>
      ) : visitas.length === 0 ? (
        !visEmpleadoFiltro ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-zinc-400 text-sm">Sin visitas para los filtros seleccionados</p>
          </div>
        ) : null
      ) : (
        <div className={mapaClienteKey ? "md:flex gap-4 items-start" : ""}>
          <div className={mapaClienteKey ? "flex-1 min-w-0 space-y-2" : "space-y-2"}>
            {Object.entries(groups).map(([key, gVisitas]) => {
              const cli = (gVisitas[0] as any)?.cliente
              const conGps = (gVisitas as any[]).find(v => v.lat)
              const isMapaAbierto = mapaClienteKey === key

              return (
                <div key={key} className="rounded-2xl overflow-hidden" style={{background:'#0d1220',border:'1px solid #1e2a3d'}}>
                  {/* Header cliente */}
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
                    <span className="text-white text-xs font-medium min-w-0 truncate" style={{flex:1}}>{cli?.nombre || 'Sin cliente'}</span>
                    {cli?.ciudad && <span className="text-zinc-400 text-xs flex-shrink-0">{cli.ciudad}</span>}
                    {conGps && (
                      <button
                        onClick={() => setMapaClienteKey(isMapaAbierto ? null : key)}
                        className="flex-shrink-0 text-zinc-400 hover:text-emerald-400 text-xs transition-colors"
                        title="Ver mapa de visitas"
                      >🗺️</button>
                    )}
                  </div>

                  {/* Mapa inline móvil */}
                  {isMapaAbierto && (
                    <div className="md:hidden" style={{height:260,borderBottom:'1px solid #1e2a3d'}}>
                      <MapaHistorialCliente visitas={gVisitas} selected={visSelectedGps} />
                    </div>
                  )}

                  {/* Visitas */}
                  {(gVisitas as any[]).map((v: any, i: number) => {
                    const fecha = new Date(v.createdAt).toLocaleDateString('es-CO',{day:'numeric',month:'short',timeZone:'America/Bogota'})
                    const hora = new Date(v.createdAt).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})
                    return (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-2" style={{borderBottom: i < gVisitas.length-1 ? '1px solid #1e2a3d' : 'none'}}>
                        <span className="text-sm flex-shrink-0">{TIPO_ICON[v.tipo]||'👁️'}</span>
                        <span className="text-zinc-300 text-xs capitalize flex-shrink-0" style={{minWidth:56}}>{v.tipo}</span>
                        {mostrarEmpleado && <span className="text-zinc-400 text-xs flex-shrink-0 hidden md:inline">{v.empleado?.nombre}</span>}
                        {mostrarEmpleado && <span className="text-zinc-600 text-xs flex-shrink-0 hidden md:inline">·</span>}
                        <span className="text-zinc-400 text-xs flex-shrink-0">{fecha} · {hora}</span>
                        <span className="flex-1"/>

                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Mapa PC — cliente específico o cliente con mapa abierto */}
          {mapaClienteKey && visitas.some((v: any) => v.lat) && (
            <div className="hidden md:block flex-shrink-0" style={{width:420,height:520,position:'sticky',top:16}}>
              <MapaHistorialCliente
                visitas={mapaClienteKey ? groups[mapaClienteKey] || [] : visitas}
                selected={visSelectedGps}
              />
            </div>
          )}
        </div>
      )}

      {/* Paginación */}
      {visTotal > VIS_LIMIT && (
        <div className="flex items-center justify-between">
          <span className="text-zinc-500 text-xs">{(visPage-1)*VIS_LIMIT+1}–{Math.min(visPage*VIS_LIMIT, visTotal)} de {visTotal}</span>
          <div className="flex gap-2">
            <button disabled={visPage===1} onClick={() => { const np = visPage-1; setVisPage(np); buscarVisitas(np); setMapaClienteKey(null) }}
              className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40">← Ant</button>
            <button disabled={visPage*VIS_LIMIT>=visTotal} onClick={() => { const np = visPage+1; setVisPage(np); buscarVisitas(np); setMapaClienteKey(null) }}
              className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40">Sig →</button>
          </div>
        </div>
      )}
    </div>
  )
}
