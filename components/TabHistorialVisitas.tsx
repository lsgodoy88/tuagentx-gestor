'use client'
import { useState, useEffect, useRef } from 'react'
import { distanciaMetros } from '@/lib/gps'
import dynamic from 'next/dynamic'

const MapaHistorialCliente = dynamic(() => import('@/components/MapaHistorialCliente'), { ssr: false })

const TIPO_ICON: Record<string,string> = { venta:'💰', cobro:'💵', recaudo:'💵', entrega:'📦' }
const VIS_LIMIT = 15

interface Props {
  apiUrl: string
  mostrarEmpleado: boolean
  mostrarImpulsadoras?: boolean
  canEditClientes?: boolean
}

export default function TabHistorialVisitas({ apiUrl, mostrarEmpleado, mostrarImpulsadoras, canEditClientes = false }: Props) {
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
  const [visImpulsadoras, setVisImpulsadoras] = useState<any[]>([])
  const [visSelectedGps, setVisSelectedGps] = useState<{lat:number,lng:number}|null>(null)
  const [mapaClienteKey, setMapaClienteKey] = useState<string|null>(null)
  const visSugRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (mostrarEmpleado) {
      fetch('/api/empleados').then(r => r.json()).then(d => {
        setVisEmpleados(Array.isArray(d) ? d : d?.empleados || [])
      })
    }
    if (mostrarImpulsadoras) {
      // /api/impulsadora ya filtra por vendedorId=user.id para rol vendedor
      fetch('/api/impulsadora').then(r => r.json()).then((rutas: any[]) => {
        if (!Array.isArray(rutas)) return
        // Extraer impulsadoras únicas de todas las rutas
        const map = new Map<string, any>()
        rutas.forEach(r => {
          r.empleados?.forEach((re: any) => {
            const emp = re.empleado
            if (emp && emp.rol === 'impulsadora' && !map.has(emp.id)) {
              map.set(emp.id, emp)
            }
          })
        })
        setVisImpulsadoras(Array.from(map.values()))
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

  const mostrarSelectorEmpleado = mostrarEmpleado || (mostrarImpulsadoras && visImpulsadoras.length > 0)

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex gap-2 items-center min-w-0">
        {/* Buscador cliente */}
        <div className="relative min-w-0 flex-1">
          <input value={visClienteFiltro} onChange={e => {
            setVisClienteFiltro(e.target.value)
            clearTimeout(visSugRef.current)
            visSugRef.current = setTimeout(() => buscarVisitas(1, e.target.value), 400)
          }}
            placeholder="Buscar cliente..."
            autoComplete="off"
            onKeyDown={e => e.key === 'Enter' && buscarVisitas()}
            className={`min-w-0 w-full bg-[#0d1220] text-white rounded-lg px-3 py-2 text-sm focus:outline-none ${visClienteFiltro ? 'border border-red-500' : 'border border-[#1e2a3d]'}`} />
          {visClienteFiltro && (
            <button onClick={() => { setVisClienteFiltro(''); setVisSugerencias([]); buscarVisitas(1, '') }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-base leading-none">×</button>
          )}
        </div>

        {/* Selector empleado (admin) o impulsadoras (vendedor) */}
        {mostrarSelectorEmpleado && (
          <select
            value={visEmpleadoFiltro}
            onChange={e => { const v = e.target.value; setVisEmpleadoFiltro(v); buscarVisitas(1, undefined, v) }}
            className={`flex-shrink-0 bg-[#0d1220] text-white rounded-lg px-2 py-2 text-sm focus:outline-none cursor-pointer ${visEmpleadoFiltro ? 'border border-red-500' : 'border border-[#1e2a3d]'}`}
            style={{width:130}}>
            {mostrarEmpleado ? (
              <>
                <option value="">Empleados</option>
                {visEmpleados.filter((e: any) => e.activo).map((e: any) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </>
            ) : (
              <>
                <option value="">Mis visitas</option>
                {visImpulsadoras.map((imp: any) => (
                  <option key={imp.id} value={imp.id}>{imp.nombre}</option>
                ))}
              </>
            )}
          </select>
        )}

        {/* Fecha */}
        <div className="relative flex-shrink-0">
          <input type="date" value={visFechaFiltro} onChange={e => { setVisFechaFiltro(e.target.value); buscarVisitas(1) }}
            className="absolute opacity-0 pointer-events-none" style={{top:0,left:0,width:1,height:1}} id="vis-fecha-input" />
          <button onClick={() => (document.getElementById('vis-fecha-input') as HTMLInputElement)?.showPicker?.()}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{background:'#0d1220', border: visFechaFiltro ? '1px solid #ef4444' : '1px solid #1e2a3d', color:'white', cursor:'pointer'}}>
            📅
          </button>
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
          <div className={mapaClienteKey ? "flex-1 min-w-0 space-y-2 overflow-y-auto" : "space-y-2"} style={mapaClienteKey ? {height:520} : {}}>
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
                      <MapaHistorialCliente visitas={gVisitas} selected={visSelectedGps} canEditClientes={canEditClientes} />
                    </div>
                  )}

                  {/* Visitas */}
                  {(gVisitas as any[]).map((v: any, i: number) => {
                    const fecha = new Date(v.createdAt).toLocaleDateString('es-CO',{day:'numeric',month:'short',timeZone:'America/Bogota'})
                    const hora = new Date(v.createdAt).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})
                    const cliLat = v.cliente?.lat; const cliLng = v.cliente?.lng
                    const dist = (v.lat && v.lng && cliLat && cliLng) ? distanciaMetros(v.lat, v.lng, cliLat, cliLng) : null
                    const distBadge = dist === null ? null : dist <= 20 ? { label: 'En el cliente', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' } : dist < 1000 ? { label: `a ${Math.round(dist)}m`, color: '#d97706', bg: 'rgba(217,119,6,0.12)' } : { label: `a ${(dist/1000).toFixed(1)}km`, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' }
                    return (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-2" style={{borderBottom: i < gVisitas.length-1 ? '1px solid #1e2a3d' : 'none'}}>
                        <span className="text-sm flex-shrink-0">{TIPO_ICON[v.tipo]||'📍'}</span>
                        <span className="text-zinc-300 text-xs capitalize flex-shrink-0" style={{minWidth:56}}>{v.tipo}</span>
                        {(mostrarEmpleado || mostrarImpulsadoras) && <span className="text-zinc-400 text-xs flex-shrink-0 hidden md:inline">{v.empleado?.nombre}</span>}
                        {(mostrarEmpleado || mostrarImpulsadoras) && <span className="text-zinc-600 text-xs flex-shrink-0 hidden md:inline">·</span>}
                        <span className="text-zinc-400 text-xs flex-shrink-0">{fecha} · {hora}</span>
                        <span className="flex-1"/>
                        {distBadge && <span style={{fontSize:12,fontWeight:600,color:distBadge.color,background:distBadge.bg,borderRadius:6,padding:'2px 6px',flexShrink:0,whiteSpace:'nowrap'}}>{distBadge.label}</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Mapa PC */}
          {mapaClienteKey && visitas.some((v: any) => v.lat) && (
            <div className="hidden md:block flex-shrink-0" style={{width:420,height:520,position:'sticky',top:16}}>
              <MapaHistorialCliente
                visitas={mapaClienteKey ? groups[mapaClienteKey] || [] : visitas}
                selected={visSelectedGps}
                canEditClientes={canEditClientes}
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
