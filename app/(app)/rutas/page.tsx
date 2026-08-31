'use client'
import dynamic from 'next/dynamic'
const MapaEnVivo = dynamic(() => import('@/components/MapaEnVivo'), { ssr: false })
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { DIAS } from '@/lib/constants'
import { checkPermiso } from '@/lib/permisos'
const MapaHistorialCliente = dynamic(() => import('@/components/MapaHistorialCliente'), { ssr: false })
import TabHistorialVisitas from '@/components/TabHistorialVisitas'

// Fecha de hoy en Bogotá vía timeZone explícito — correcto sin importar el TZ
// del navegador/dispositivo (bug real: restar 5h manualmente sobre-corrige si el
// dispositivo ya interpreta Date en hora Bogotá nativa, detectado 24/06).
function hoySufijo() {
  const partes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) // "YYYY-MM-DD"
  const [yyyy, mm, dd] = partes.split('-')
  return `${dd}-${mm}-${yyyy}`
}

function esDeHoy(ruta: any) {
  if (!ruta.fecha) return false
  const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
  return ruta.fecha.split('T')[0] === hoy
}


function fmtHoraBogota(ts: string | null) {
  if (!ts) return null
  try { return new Date(ts).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'America/Bogota' }) } catch { return null }
}
function fmtFechaBogota(ts: string | null) {
  if (!ts) return null
  try { return new Date(ts).toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric', timeZone:'America/Bogota' }) } catch { return null }
}
function nombreFechaLargo(f: string) {
  const d = new Date(f.split('T')[0] + 'T12:00:00')
  return d.toLocaleDateString('es-CO', { day:'numeric', month:'long', year:'numeric' })
}
interface ClienteRow { rc: any; visita: any; asignadoA: string; horaEntrega: string|null; fechaAsignado: string|null }

function GrupoEntregas({ clave, label, clientes, color, onAnular }: { clave:string; label:string; clientes:ClienteRow[]; color?:string; onAnular?:(id:string)=>void }) {
  const [open, setOpen] = useState(false)
  const [anulando, setAnulando] = useState<string|null>(null)
  const [confirmando, setConfirmando] = useState<string|null>(null)
  const longRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  function startLong(rcId: string) { longRef.current = setTimeout(() => setConfirmando(rcId), 600) }
  function cancelLong() { if (longRef.current) { clearTimeout(longRef.current); longRef.current = null } }
  async function anularRc(rcId: string) {
    if (!onAnular) return
    setAnulando(rcId)
    const r = await fetch('/api/rutas/cliente', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rutaClienteId: rcId }) })
    setAnulando(null); setConfirmando(null)
    if (r.ok) onAnular(rcId)
  }
  return (
    <div style={{background:'#0d1220', border:`1px solid ${color || '#1e2a3d'}`, borderRadius:14, overflow:'hidden'}}>
      <button onClick={() => setOpen(o => !o)} style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'transparent', border:'none', cursor:'pointer'}}>
        <span style={{color:'white', fontWeight:700, fontSize:14}}>{label}</span>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <span style={{color: color || '#60a5fa', fontSize:12, fontWeight:600}}>{"\u{1F4E6}"} {clientes.length}</span>
          <span style={{color:'#64748b', fontSize:12}}>{open ? '\u25b2' : '\u25bc'}</span>
        </div>
      </button>
      {open && (
        <div style={{borderTop:`1px solid ${color || '#1e2a3d'}`}}>
          <div className="grid grid-cols-1 md:grid-cols-2">
          {clientes.map(({ rc, visita, asignadoA, horaEntrega, fechaAsignado }, i) => {
            const c = rc.cliente
            const ejecutado = !!visita
            const factM = (rc.notas || '').match(/#(\d+)/)
            const factura = factM ? factM[1] : null
            const esConfirmando = confirmando === rc.id
            return (
              <div key={rc.id || i}
                onTouchStart={() => { if (onAnular && !ejecutado) startLong(rc.id) }}
                onTouchEnd={cancelLong} onTouchMove={cancelLong}
                onClick={(e) => { if (esConfirmando && !(e.target as HTMLElement).closest('button')) setConfirmando(null) }}
                style={{ padding:'10px 14px', borderBottom:'1px solid #131c2e', background: esConfirmando ? 'rgba(220,38,38,0.12)' : i%2===0 ? '#0a0f1a' : '#080d18', display:'flex', alignItems:'flex-start', gap:10, position:'relative' }}>
                <span style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, background: ejecutado ? '#059669' : '#374151', color: ejecutado ? 'white' : '#9ca3af' }}>{ejecutado ? '\u2713' : i+1}</span>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                    <span style={{color:'white', fontSize:13, fontWeight:600, flex:1, minWidth:0}}>{c?.nombre || '\u2014'}</span>
                    {factura && <span style={{color:'white', fontSize:12, fontWeight:600, flexShrink:0}}>#{factura}</span>}
                  </div>
                  {c?.direccion && <p style={{color:'#64748b', fontSize:11, margin:'2px 0 0'}}>{c.direccion}{c.ciudad ? `, ${c.ciudad}` : ''}</p>}
                  <div style={{display:'flex', alignItems:'center', flexWrap:'wrap', gap:10, marginTop:4}}>
                    <span style={{color:'#94a3b8', fontSize:11}}>{"\u{1F464}"} {asignadoA}</span>
                    {fechaAsignado && <span style={{color:'#64748b', fontSize:11}}>{"\u{1F4C5}"} {fechaAsignado}</span>}
                    {ejecutado && horaEntrega && <span style={{color:'#34d399', fontSize:11}}>{"\u{1F550}"} {horaEntrega}</span>}
                  </div>
                </div>
                {esConfirmando && onAnular && (
                  <div style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', display:'flex', gap:6, zIndex:10}}>
                    <button onClick={() => anularRc(rc.id)} disabled={anulando === rc.id} style={{background:'#dc2626', color:'white', border:'none', borderRadius:8, padding:'5px 14px', fontSize:12, fontWeight:700, cursor:'pointer'}}>{anulando === rc.id ? '...' : 'Devolver a Bodega'}</button>
                    <button onClick={() => setConfirmando(null)} style={{background:'#374151', color:'white', border:'none', borderRadius:8, padding:'5px 12px', fontSize:12, cursor:'pointer'}}>{"\u00d7"}</button>
                  </div>
                )}
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}

function TabEntregasAdmin() {
  const [rutas, setRutas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setExpandidos(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    fetch('/api/rutas').then(r => r.json()).then((d: any) => {
      const todas = Array.isArray(d) ? d : []
      setRutas(todas.filter((r: any) => r.clientes?.length > 0).sort((a: any, b: any) => new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime()))
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl h-14 animate-pulse" />)}</div>

  const hoy = new Date().toISOString().split('T')[0]

  const buildClientes = (rutasList: any[]): ClienteRow[] =>
    rutasList.flatMap((r: any) => (r.clientes || []).map((rc: any) => {
      const visita = (r.visitas || []).find((v: any) => v.clienteId === rc.clienteId)
      const asignadoA = r.empleados?.map((re: any) => re.empleado?.nombre).filter(Boolean).join(', ') || '\u2014'
      return { rc, visita, asignadoA, horaEntrega: visita ? fmtHoraBogota(visita.fechaBogota || visita.createdAt) : null, fechaAsignado: rc.asignadoEn ? fmtFechaBogota(rc.asignadoEn) : null }
    }))

  const pendientes = rutas.filter(r => { const dia = (r.fecha || '').split('T')[0]; return !r.cerrada || dia >= hoy })
  const clientesPendientes = buildClientes(pendientes).filter(row => !row.visita)
  const historial = rutas.filter(r => { const dia = (r.fecha || '').split('T')[0]; return r.cerrada && dia < hoy })
  const porDia: Record<string, any[]> = {}
  historial.forEach(r => { const dia = (r.fecha || '').split('T')[0]; if (!porDia[dia]) porDia[dia] = []; porDia[dia].push(r) })
  const dias = Object.keys(porDia).sort((a, b) => b.localeCompare(a))

  const q = busqueda.trim().toLowerCase()
  const filtrar = (rows: ClienteRow[]) => !q ? rows : rows.filter(({ rc }) => rc.cliente?.nombre?.toLowerCase().includes(q) || (rc.notas || '').toLowerCase().includes(q))

  if (clientesPendientes.length === 0 && dias.length === 0) return <p className="text-zinc-500 text-sm text-center py-10">Sin historial de entregas</p>

  return (
    <div className="space-y-2">
      <div style={{display:'flex',alignItems:'center',background:'#1e243a',border:'1px solid #1e3a5f',borderRadius:10,padding:'0 12px',gap:8,marginBottom:12}}>
        <span style={{color:'#4b7cb5',fontSize:14,flexShrink:0}}>{"\u{1F50D}"}</span>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente u orden..." style={{flex:1,background:'transparent',border:'none',outline:'none',color:'white',fontSize:13,padding:'10px 0'}} />
        {busqueda && <button onClick={() => setBusqueda('')} style={{color:'#64748b',fontSize:16,background:'none',border:'none',cursor:'pointer'}}>{"\u00d7"}</button>}
      </div>

      {filtrar(clientesPendientes).length > 0 && (
        <GrupoEntregas clave="pendientes" label="Pendientes de entrega" clientes={filtrar(clientesPendientes)} color="#10b981"
          onAnular={(id) => setRutas(prev => prev.map(r => ({...r, clientes: (r.clientes || []).filter((rc: any) => rc.id !== id)})))} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {dias.map(dia => {
        const clientesDia = filtrar(buildClientes(porDia[dia]))
        if (q && clientesDia.length === 0) return null
        const isOpen = q ? true : expandidos.has(dia)
        return (
          <div key={dia} style={{background:'#0d1220', border:'1px solid #1e2a3d', borderRadius:14, overflow:'hidden'}}>
            <button onClick={() => toggle(dia)} style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', cursor:'pointer', background:'transparent', border:'none'}}>
              <span style={{color:'white', fontWeight:700, fontSize:14}}>{nombreFechaLargo(dia)}</span>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <span style={{color:'#60a5fa', fontSize:12, fontWeight:600}}>{"\u{1F4E6}"} {clientesDia.length}</span>
                <span style={{color:'#64748b', fontSize:12}}>{isOpen ? '\u25b2' : '\u25bc'}</span>
              </div>
            </button>
            {isOpen && (
              <div style={{borderTop:'1px solid #1e2a3d'}}>
                {clientesDia.map(({ rc, visita, asignadoA, horaEntrega, fechaAsignado }, i) => {
                  const c = rc.cliente
                  const ejecutado = !!visita
                  const factM = (rc.notas || '').match(/#(\d+)/)
                  const factura = factM ? factM[1] : null
                  return (
                    <div key={rc.id || i} style={{ padding:'10px 16px', borderBottom:'1px solid #131c2e', background: i%2===0 ? '#0a0f1a' : '#080d18', display:'flex', alignItems:'flex-start', gap:10 }}>
                      <span style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, background: ejecutado ? '#059669' : '#374151', color: ejecutado ? 'white' : '#9ca3af' }}>{ejecutado ? '\u2713' : i+1}</span>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                          <p style={{color:'white', fontSize:13, fontWeight:600, margin:0, flex:1, minWidth:0}}>{c?.nombre || '\u2014'}</p>
                          {factura && <span style={{color:'white', fontSize:12, fontWeight:600, flexShrink:0}}>#{factura}</span>}
                        </div>
                        {c?.direccion && <p style={{color:'#64748b', fontSize:11, margin:'2px 0 0'}}>{c.direccion}{c.ciudad ? `, ${c.ciudad}` : ''}</p>}
                        <div style={{display:'flex', alignItems:'center', flexWrap:'wrap', gap:10, marginTop:4}}>
                          <span style={{color:'#94a3b8', fontSize:11}}>{"\u{1F464}"} {asignadoA}</span>
                          {fechaAsignado && <span style={{color:'#64748b', fontSize:11}}>{"\u{1F4C5}"} {fechaAsignado}</span>}
                          {ejecutado && horaEntrega && <span style={{color:'#34d399', fontSize:11}}>{"\u{1F550}"} {horaEntrega}</span>}
                        </div>
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
    </div>
  )
}

export default function RutasPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const esSupervisor = user?.role === 'supervisor'
  const esEmpresa = user?.role === 'empresa'
  const puedeAsignar = !user || esEmpresa || checkPermiso(session, 'asignarRutas')

  // Tab principal
  const [tabPrincipal, setTabPrincipal] = useState<'mapa' | 'ruta' | 'historial'>('mapa')

  // Estados visitas
  const [visitas, setVisitas] = useState<any[]>([])
  const [visEmpleados, setVisEmpleados] = useState<any[]>([])
  const [visEmpleadoFiltro, setVisEmpleadoFiltro] = useState('')
  const [visFechaFiltro, setVisFechaFiltro] = useState('')
  const [visClienteFiltro, setVisClienteFiltro] = useState('')
  const [visLoading, setVisLoading] = useState(false)
  const [visDetalle, setVisDetalle] = useState<string | null>(null)
  const [visPage, setVisPage] = useState(1)
  const [visTotal, setVisTotal] = useState(0)
  const VIS_LIMIT = 15
  const [visSugerencias, setVisSugerencias] = useState<any[]>([])
  const [visShowSug, setVisShowSug] = useState(false)
  const visSugRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [visSelectedGps, setVisSelectedGps] = useState<{lat:number,lng:number}|null>(null)
  const visClientesUnicos = [...new Set(visitas.map((v:any) => v.clienteId).filter(Boolean))]
  const visClienteEspecifico = visClientesUnicos.length === 1 && visitas.length > 0

  async function buscarClientesVis(q: string) {
    if (q.length < 2) { setVisSugerencias([]); return }
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&limit=8`).then(r => r.json())
    setVisSugerencias(Array.isArray(res?.clientes) ? res.clientes : Array.isArray(res) ? res : [])
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
    const res = await fetch('/api/visitas/admin?' + params.toString()).then(r => r.json())
    if (res?.visitas) { setVisitas(res.visitas); setVisTotal(res.total || 0) }
    else { setVisitas(Array.isArray(res) ? res : []); setVisTotal(0) }
    setVisLoading(false)
  }

  useEffect(() => {
    if (tabPrincipal === 'historial' && visitas.length === 0) {
      fetch('/api/empleados').then(r => r.json()).then(d => setVisEmpleados(Array.isArray(d) ? d : d?.empleados || []))
      buscarVisitas()
    }
  }, [tabPrincipal])

  const [rutas, setRutas] = useState<any[]>([])
  const [empleados, setEmpleados] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [generando, setGenerando] = useState(false)
  async function generarRutaHoy() {
    setGenerando(true)
    try {
      const res = await fetch('/api/rutas/procesar-dia', { method: 'POST' })
      const d = await res.json()
      if (d.ok) { alert('Rutas generadas: ' + d.rutasCreadas); window.location.reload() }
      else alert(d.error || 'Error al generar')
    } catch (e) { alert('Error de conexión') }
    finally { setGenerando(false) }
  }
  const [paso, setPaso] = useState(1)

  function nombreFecha(f: string) {
    if (!f) return ''
    const fStr = typeof f === 'string' ? f.split('T')[0] : new Date(f).toISOString().split('T')[0]
    const d = new Date(fStr + 'T12:00:00')
    const dia = DIAS[d.getDay()]
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(2)
    return dia + ' ' + dd + '-' + mm + '-' + yy
  }

  function nombreAuto(emp: any, f: string) {
    if (!emp || !f) return ''
    const d = new Date(f + 'T12:00:00')
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return emp.nombre + '-' + dd + '-' + mm + '-' + yyyy
  }

  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [empSeleccionado, setEmpSeleccionado] = useState<any>(null)
  const [empSeleccionados, setEmpSeleccionados] = useState<string[]>([])
  const [cliSeleccionados, setCliSeleccionados] = useState<string[]>([])
  const [buscarCli, setBuscarCli] = useState('')
  const [pageCli, setPageCli] = useState(1)
  const [totalCli, setTotalCli] = useState(0)
  const [loadingCli, setLoadingCli] = useState(false)
  const LIMIT_CLI = 10
  const [loading, setLoading] = useState(false)
  const [rutaDetalle, setRutaDetalle] = useState<any>(null)
  const [visitaModal, setVisitaModal] = useState<any>(null)
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null)
  const [editando, setEditando] = useState<any>(null)

  // Filtro fecha + paginación
  const [filtroFecha, setFiltroFecha] = useState('')
  const [pageRutas, setPageRutas] = useState(1)
  const PAGE_SIZE = 7

  // Modal agregar clientes supervisor
  const [modalAgregar, setModalAgregar] = useState<any>(null) // ruta target
  const [clientesSup, setClientesSup] = useState<any[]>([])
  const [buscarSup, setBuscarSup] = useState('')
  const [pageSup, setPageSup] = useState(1)
  const [totalSup, setTotalSup] = useState(0)
  const [selSup, setSelSup] = useState<string[]>([])
  const [savingSup, setSavingSup] = useState(false)
  const LIMIT_SUP = 10
  const [tabSup, setTabSup] = useState<'mis-clientes' | 'vinculadas'>('mis-clientes')
  const [pedidosVinculados, setPedidosVinculados] = useState<any[]>([])
  const [selVinculadas, setSelVinculadas] = useState<string[]>([])
  const [loadingVinculadas, setLoadingVinculadas] = useState(false)
  const [modalSimpleRuta, setModalSimpleRuta] = useState<any>(null)

  const [modalEditar, setModalEditar] = useState(false)
  const [tabEditar, setTabEditar] = useState<'empleados' | 'mis-clientes' | 'vinculadas'>('empleados')

  const modalRef = useRef<HTMLDivElement>(null)
  const cliListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (modal) modalRef.current?.scrollTo(0, 0)
  }, [modal])

  useEffect(() => {
    cliListRef.current?.scrollTo(0, 0)
  }, [buscarCli])

  async function abrirEditar(r: any) {
    setNombre(r.nombre)
    setFecha(r.fecha ? r.fecha.split('T')[0] : '')
    setEmpSeleccionados(r.empleados.map((re: any) => re.empleadoId))
    setEditando(r)
    setTabEditar('empleados')
    setSelSup([])
    setBuscarSup('')
    setPageSup(1)
    setSelVinculadas([])
    setLoadingVinculadas(true)
    setModalEditar(true)
    const [_, vinRes] = await Promise.all([
      loadClientesSup('', 1),
      fetch('/api/empresas-vinculadas/pedidos-pendientes').then(r => r.json()),
    ])
    setPedidosVinculados(vinRes.pedidos || [])
    setLoadingVinculadas(false)
  }

  function cerrarModalEditar() {
    setModalEditar(false)
    setEditando(null)
    setNombre('')
    setFecha('')
    setEmpSeleccionados([])
    setSelSup([])
    setBuscarSup('')
    setSelVinculadas([])
  }

  async function guardarEdicion() {
    setLoading(true)
    await fetch('/api/rutas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editando.id, nombre, fecha, empleadoIds: empSeleccionados })
    })
    setLoading(false)
    cerrarModalEditar()
    loadData()
  }

  async function agregarClientesEditar() {
    if (!editando || selSup.length === 0) return
    setSavingSup(true)
    await fetch(`/api/rutas/${editando.id}/agregar-clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteIds: selSup })
    })
    setSavingSup(false)
    setSelSup([])
    loadData()
  }

  async function agregarVinculadosEditar() {
    if (!editando || selVinculadas.length === 0) return
    setSavingSup(true)
    await fetch(`/api/rutas/${editando.id}/agregar-vinculados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoIds: selVinculadas })
    })
    setSavingSup(false)
    setSelVinculadas([])
    loadData()
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [rutRes, empRes, cliRes] = await Promise.all([
      fetch('/api/rutas').then(r => r.json()),
      fetch('/api/empleados').then(r => r.json()),
      fetch('/api/clientes?page=1&limit=10').then(r => r.json()),
    ])
    setRutas(Array.isArray(rutRes) ? rutRes : [])
    setEmpleados(Array.isArray(empRes) ? empRes : Array.isArray(empRes?.empleados) ? empRes.empleados : [])
    setClientes(cliRes?.clientes || [])
    setTotalCli(cliRes?.total || 0)
  }

  function toggleEmp(id: string) {
    setEmpSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleCli(id: string) {
    setCliSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function crear() {
    setLoading(true)
    await fetch('/api/rutas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, fecha, empleadoIds: empSeleccionados, clienteIds: cliSeleccionados })
    })
    setLoading(false)
    resetModal()
    loadData()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar ruta?')) return
    await fetch('/api/rutas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    loadData()
  }

  function resetModal() {
    setEmpSeleccionado(null)
    setModal(false); setPaso(1); setNombre(''); setFecha('')
    setEmpSeleccionados([]); setCliSeleccionados([]); setBuscarCli('')
  }

  async function loadClientes(q: string, p: number) {
    setLoadingCli(true)
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&page=${p}&limit=${LIMIT_CLI}`)
    const data = await res.json()
    setClientes(data.clientes || [])
    setTotalCli(data.total || 0)
    setLoadingCli(false)
  }


  async function loadClientesSup(q: string, p: number) {
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&page=${p}&limit=${LIMIT_SUP}`)
    const data = await res.json()
    setClientesSup(data.clientes || [])
    setTotalSup(data.total || 0)
  }

  async function abrirModalSimple(ruta: any) {
    setModalSimpleRuta(ruta)
    setSelSup([])
    setBuscarSup('')
    setPageSup(1)
    await loadClientesSup('', 1)
  }

  async function abrirModalAgregar(ruta: any) {
    setModalAgregar(ruta)
    setSelSup([])
    setBuscarSup('')
    setPageSup(1)
    setTabSup('mis-clientes')
    setSelVinculadas([])
    setLoadingVinculadas(true)
    const [_, vinRes] = await Promise.all([
      loadClientesSup('', 1),
      fetch('/api/empresas-vinculadas/pedidos-pendientes').then(r => r.json()),
    ])
    setPedidosVinculados(vinRes.pedidos || [])
    setLoadingVinculadas(false)
  }

  async function agregarClientes() {
    if (!modalAgregar || selSup.length === 0) return
    setSavingSup(true)
    await fetch(`/api/rutas/${modalAgregar.id}/agregar-clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteIds: selSup })
    })
    setSavingSup(false)
    setModalAgregar(null)
    loadData()
  }

  async function agregarVinculados() {
    if (!modalAgregar || selVinculadas.length === 0) return
    setSavingSup(true)
    await fetch(`/api/rutas/${modalAgregar.id}/agregar-vinculados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoIds: selVinculadas })
    })
    setSavingSup(false)
    setModalAgregar(null)
    loadData()
  }

  const clientesFiltrados = clientes

  const rutasFiltradas = filtroFecha
    ? rutas.filter(r => r.fecha && r.fecha.split('T')[0] === filtroFecha)
    : rutas
  const totalPaginas = Math.max(1, Math.ceil(rutasFiltradas.length / PAGE_SIZE))
  const rutasPagina = rutasFiltradas.slice((pageRutas - 1) * PAGE_SIZE, pageRutas * PAGE_SIZE)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Tabs principales */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        <button onClick={() => setTabPrincipal('mapa')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'mapa' ? 'tab-active' : 'text-white hover:text-white'}`}>
          Mapa
        </button>
        <button onClick={() => setTabPrincipal('ruta')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'ruta' ? 'tab-active' : 'text-white hover:text-white'}`}>
          Entregas
        </button>
        <button onClick={() => setTabPrincipal('historial')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'historial' ? 'tab-active' : 'text-white hover:text-white'}`}>
          Historial
        </button>
      </div>

      {tabPrincipal === 'mapa' && <div style={{marginTop:-12}}><MapaEnVivo embebido /></div>}

      {tabPrincipal === 'historial' && (
        <TabHistorialVisitas apiUrl="/api/visitas/admin" mostrarEmpleado={true} />
      )}

      {tabPrincipal === 'ruta' && <TabEntregasAdmin />}
      {/* Modal nueva/editar ruta (solo no-supervisor) */}
      {modal && (
        <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-50 pt-4 px-4 pb-4" >
          <div ref={modalRef} className="bg-zinc-900 border border-zinc-800 rounded-t-2xl md:rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto pb-6">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold">Nueva ruta</h3>
                <span className="text-zinc-500 text-xs">{paso}/2</span>
              </div>
              <div className="flex gap-1">
                {[1,2].map(s => (
                  <div key={s} className={"h-1 flex-1 rounded-full " + (paso >= s ? "bg-emerald-500" : "bg-zinc-700")} />
                ))}
              </div>
            </div>
            <div className="p-6 space-y-4">
              {paso === 1 && (
                <div className="space-y-3">
                  <p className="text-white font-semibold">Seleccionar empleado</p>
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Fecha de la ruta</label>
                    <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); if (empSeleccionado) setNombre(nombreAuto(empSeleccionado, e.target.value)) }}
                      className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
                  </div>
                  <div className="space-y-2 overflow-y-auto flex-1">
                    {empleados.filter(e => e.activo && ['vendedor','entregas'].includes(e.rol)).map((e: any) => (
                      <button key={e.id} onClick={() => { setEmpSeleccionado(e); setEmpSeleccionados([e.id]); setNombre(nombreAuto(e, fecha)) }}
                        className={"w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all " + (empSeleccionado?.id === e.id ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800")}>
                        <div className="w-9 h-9 bg-zinc-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {e.nombre[0].toUpperCase()}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-white text-sm font-medium">{e.nombre}</p>
                          <p className="text-zinc-400 text-xs capitalize">{e.rol}</p>
                        </div>
                        {empSeleccionado?.id === e.id && <span className="text-emerald-400 text-lg">✓</span>}
                      </button>
                    ))}
                  </div>
                  {empSeleccionado && nombre && (
                    <div className="bg-zinc-800 rounded-xl px-4 py-2.5">
                      <p className="text-zinc-400 text-xs">Nombre de la ruta</p>
                      <p className="text-white text-sm font-semibold">{nombre}</p>
                    </div>
                  )}
                </div>
              )}
              {paso === 2 && (
                <div className="space-y-3">
                  <p className="text-white font-semibold">Seleccionar clientes</p>
                  <input value={buscarCli}
                    onChange={e => { setBuscarCli(e.target.value); setPageCli(1); loadClientes(e.target.value, 1) }}
                    placeholder="Buscar cliente..."
                    className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
                  <p className="text-zinc-500 text-xs">{cliSeleccionados.length} seleccionados</p>
                  <div ref={cliListRef} className="space-y-2 overflow-y-auto max-h-48">
                    {clientesFiltrados.map((c: any) => {
                      const orden = cliSeleccionados.indexOf(c.id)
                      return (
                        <button key={c.id} onClick={() => toggleCli(c.id)} 
                          className={"w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all " + (orden >= 0 ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800")}>
                          <div className="w-8 h-8 bg-zinc-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {orden >= 0 ? orden + 1 : '#'}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-white text-sm truncate">{c.nombre}</p>
                            {c.direccion && <p className="text-zinc-500 text-xs truncate">{c.direccion}</p>}
                          </div>
                          {c.ubicacionReal && <span className="text-emerald-400 text-xs">GPS</span>}
                        </button>
                      )
                    })}
                  {totalCli > LIMIT_CLI && (
                    <div className="flex items-center justify-between pt-2 sticky bottom-0 bg-zinc-900">
                      <p className="text-zinc-600 text-xs">{((pageCli-1)*LIMIT_CLI)+1}–{Math.min(pageCli*LIMIT_CLI,totalCli)} de {totalCli}</p>
                      <div className="flex gap-2">
                        <button onClick={() => { const p = pageCli-1; setPageCli(p); loadClientes(buscarCli, p) }} disabled={pageCli===1}
                          className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">← Ant</button>
                        <button onClick={() => { const p = pageCli+1; setPageCli(p); loadClientes(buscarCli, p) }} disabled={pageCli*LIMIT_CLI>=totalCli}
                          className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig →</button>
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => paso > 1 ? setPaso(p => p - 1) : resetModal()}
                  className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">
                  {paso > 1 ? 'Atrás' : 'Cancelar'}
                </button>
                {paso < 2 ? (
                  <button onClick={() => setPaso(p => p + 1)} disabled={paso === 1 && !empSeleccionado}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                    Siguiente →
                  </button>
                ) : (
                  <button onClick={crear} disabled={loading}
                    className={`flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl ${(loading) ? 'btn-shimmer' : ''}`}>
                    {loading ? 'Guardando...' : 'Crear ruta'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar clientes (supervisor) */}
      {modalAgregar && (
        <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-50 pt-4 px-4 pb-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto pb-24 md:pb-6">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">➕ Agregar clientes</h3>
                <p className="text-zinc-500 text-xs mt-0.5">{modalAgregar.nombre}</p>
              </div>
              <button onClick={() => setModalAgregar(null)} className="text-zinc-400 hover:text-white text-xl">×</button>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-zinc-800">
              <button
                onClick={() => setTabSup('mis-clientes')}
                className={"flex-1 py-2.5 text-sm font-medium transition-colors " + (tabSup === 'mis-clientes' ? "text-white border-b-2 border-emerald-500" : "text-zinc-500 hover:text-zinc-300")}>
                Mis clientes
              </button>
              <button
                onClick={() => setTabSup('vinculadas')}
                className={"flex-1 py-2.5 text-sm font-medium transition-colors " + (tabSup === 'vinculadas' ? "text-white border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300")}>
                📦 Vinculadas {pedidosVinculados.length > 0 && <span className="ml-1 bg-violet-500/20 text-violet-400 text-xs px-1.5 py-0.5 rounded-full">{pedidosVinculados.length}</span>}
              </button>
            </div>
            <div className="p-6 space-y-4">
              {tabSup === 'mis-clientes' && (
                <>
                  <input value={buscarSup}
                    onChange={e => { setBuscarSup(e.target.value); setPageSup(1); loadClientesSup(e.target.value, 1) }}
                    placeholder="Buscar cliente..."
                    className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
                  <p className="text-zinc-500 text-xs">{selSup.length} seleccionados</p>
                  <div className="space-y-2">
                    {clientesSup.map((c: any) => {
                      const sel = selSup.includes(c.id)
                      return (
                        <button key={c.id} onClick={() => setSelSup(prev => sel ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                          className={"w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all " + (sel ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800")}>
                          <div className="w-8 h-8 bg-zinc-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {sel ? '✓' : c.nombre[0].toUpperCase()}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-white text-sm truncate">{c.nombre}</p>
                            {c.direccion && <p className="text-zinc-500 text-xs truncate">{c.direccion}</p>}
                          </div>
                          {c.ubicacionReal && <span className="text-emerald-400 text-xs">GPS</span>}
                        </button>
                      )
                    })}
                    {totalSup > LIMIT_SUP && (
                      <div className="flex items-center justify-between pt-2">
                        <p className="text-zinc-600 text-xs">{((pageSup-1)*LIMIT_SUP)+1}–{Math.min(pageSup*LIMIT_SUP,totalSup)} de {totalSup}</p>
                        <div className="flex gap-2">
                          <button onClick={() => { const p = pageSup-1; setPageSup(p); loadClientesSup(buscarSup, p) }} disabled={pageSup===1}
                            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">← Ant</button>
                          <button onClick={() => { const p = pageSup+1; setPageSup(p); loadClientesSup(buscarSup, p) }} disabled={pageSup*LIMIT_SUP>=totalSup}
                            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig →</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setModalAgregar(null)} className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
                    <button onClick={agregarClientes} disabled={savingSup || selSup.length === 0}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                      {savingSup ? 'Agregando...' : `Agregar ${selSup.length > 0 ? selSup.length : ''}`}
                    </button>
                  </div>
                </>
              )}
              {tabSup === 'vinculadas' && (
                <>
                  <p className="text-zinc-500 text-xs">{selVinculadas.length} seleccionados</p>
                  {loadingVinculadas ? (
                    <p className="text-zinc-500 text-sm text-center py-6">Cargando...</p>
                  ) : pedidosVinculados.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-2xl mb-2">📦</p>
                      <p className="text-zinc-500 text-sm">No hay pedidos vinculados pendientes</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pedidosVinculados.map((p: any) => {
                        const sel = selVinculadas.includes(p.id)
                        const primerCliente = p.clientes?.[0]?.cliente
                        return (
                          <button key={p.id} onClick={() => setSelVinculadas(prev => sel ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                            className={"w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all " + (sel ? "border-violet-500 bg-violet-500/10" : "border-zinc-700 bg-zinc-800")}>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.empresaVinculada?.color || '#8b5cf6' }} />
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-white text-sm truncate">{primerCliente?.nombre || p.nombre}</p>
                              {primerCliente?.direccion && <p className="text-zinc-500 text-xs truncate">{primerCliente.direccion}</p>}
                              <p className="text-zinc-600 text-xs truncate">{p.empresaVinculada?.nombre}</p>
                            </div>
                            {sel && <span className="text-violet-400 text-sm">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setModalAgregar(null)} className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
                    <button onClick={agregarVinculados} disabled={savingSup || selVinculadas.length === 0}
                      className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                      {savingSup ? 'Asignando...' : `Asignar ${selVinculadas.length > 0 ? selVinculadas.length : ''}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal editar ruta */}
      {modalEditar && editando && (
        <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-50 pt-4 px-4 pb-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto pb-24 md:pb-6">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <input value={nombre} onChange={e => setNombre(e.target.value)}
                  className="flex-1  rounded-xl px-3 py-2 text-white text-sm font-semibold outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
                <button onClick={guardarEdicion} disabled={loading}
                  className={`bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm px-4 py-2 rounded-xl whitespace-nowrap ${(loading) ? 'btn-shimmer' : ''}`}>
                  {loading ? '...' : 'Guardar'}
                </button>
                <button onClick={cerrarModalEditar} className="text-zinc-400 hover:text-white text-xl">×</button>
              </div>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full  rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
            </div>
            <div className="flex border-b border-zinc-800">
              <button onClick={() => setTabEditar('empleados')}
                className={"flex-1 py-2.5 text-sm font-medium transition-colors " + (tabEditar === 'empleados' ? "text-white border-b-2 border-emerald-500" : "text-zinc-500 hover:text-zinc-300")}>
                Empleados
              </button>
              <button onClick={() => setTabEditar('mis-clientes')}
                className={"flex-1 py-2.5 text-sm font-medium transition-colors " + (tabEditar === 'mis-clientes' ? "text-white border-b-2 border-emerald-500" : "text-zinc-500 hover:text-zinc-300")}>
                Mis clientes
              </button>
              <button onClick={() => setTabEditar('vinculadas')}
                className={"flex-1 py-2.5 text-sm font-medium transition-colors " + (tabEditar === 'vinculadas' ? "text-white border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300")}>
                📦 Vinculadas {pedidosVinculados.length > 0 && <span className="ml-1 bg-violet-500/20 text-violet-400 text-xs px-1.5 py-0.5 rounded-full">{pedidosVinculados.length}</span>}
              </button>
            </div>
            <div className="p-6 space-y-4">
              {tabEditar === 'empleados' && (
                <div className="space-y-2">
                  <p className="text-zinc-400 text-xs font-semibold">{empSeleccionados.length} empleado{empSeleccionados.length !== 1 ? 's' : ''} asignado{empSeleccionados.length !== 1 ? 's' : ''}</p>
                  {empleados.filter(e => e.activo && ['vendedor','entregas'].includes(e.rol)).map((e: any) => {
                    const sel = empSeleccionados.includes(e.id)
                    return (
                      <button key={e.id} onClick={() => toggleEmp(e.id)}
                        className={"w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all " + (sel ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800")}>
                        <div className="w-8 h-8 bg-zinc-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {sel ? '✓' : e.nombre[0].toUpperCase()}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-white text-sm">{e.nombre}</p>
                          <p className="text-zinc-400 text-xs capitalize">{e.rol}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              {tabEditar === 'mis-clientes' && (
                <>
                  <input value={buscarSup}
                    onChange={e => { setBuscarSup(e.target.value); setPageSup(1); loadClientesSup(e.target.value, 1) }}
                    placeholder="Buscar cliente..."
                    className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
                  <p className="text-zinc-500 text-xs">{selSup.length} seleccionados</p>
                  <div className="space-y-2">
                    {clientesSup.map((c: any) => {
                      const sel = selSup.includes(c.id)
                      return (
                        <button key={c.id} onClick={() => setSelSup(prev => sel ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                          className={"w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all " + (sel ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800")}>
                          <div className="w-8 h-8 bg-zinc-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {sel ? '✓' : c.nombre[0].toUpperCase()}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-white text-sm truncate">{c.nombre}</p>
                            {c.direccion && <p className="text-zinc-500 text-xs truncate">{c.direccion}</p>}
                          </div>
                          {c.ubicacionReal && <span className="text-emerald-400 text-xs">GPS</span>}
                        </button>
                      )
                    })}
                    {totalSup > LIMIT_SUP && (
                      <div className="flex items-center justify-between pt-2">
                        <p className="text-zinc-600 text-xs">{((pageSup-1)*LIMIT_SUP)+1}–{Math.min(pageSup*LIMIT_SUP,totalSup)} de {totalSup}</p>
                        <div className="flex gap-2">
                          <button onClick={() => { const p = pageSup-1; setPageSup(p); loadClientesSup(buscarSup, p) }} disabled={pageSup===1}
                            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">← Ant</button>
                          <button onClick={() => { const p = pageSup+1; setPageSup(p); loadClientesSup(buscarSup, p) }} disabled={pageSup*LIMIT_SUP>=totalSup}
                            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig →</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={agregarClientesEditar} disabled={savingSup || selSup.length === 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                    {savingSup ? 'Agregando...' : `Agregar ${selSup.length > 0 ? selSup.length : ''}`}
                  </button>
                </>
              )}
              {tabEditar === 'vinculadas' && (
                <>
                  <p className="text-zinc-500 text-xs">{selVinculadas.length} seleccionados</p>
                  {loadingVinculadas ? (
                    <p className="text-zinc-500 text-sm text-center py-6">Cargando...</p>
                  ) : pedidosVinculados.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-2xl mb-2">📦</p>
                      <p className="text-zinc-500 text-sm">No hay pedidos vinculados pendientes</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pedidosVinculados.map((p: any) => {
                        const sel = selVinculadas.includes(p.id)
                        const primerCliente = p.clientes?.[0]?.cliente
                        return (
                          <button key={p.id} onClick={() => setSelVinculadas(prev => sel ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                            className={"w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all " + (sel ? "border-violet-500 bg-violet-500/10" : "border-zinc-700 bg-zinc-800")}>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.empresaVinculada?.color || '#8b5cf6' }} />
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-white text-sm truncate">{primerCliente?.nombre || p.nombre}</p>
                              {primerCliente?.direccion && <p className="text-zinc-500 text-xs truncate">{primerCliente.direccion}</p>}
                              <p className="text-zinc-600 text-xs truncate">{p.empresaVinculada?.nombre}</p>
                            </div>
                            {sel && <span className="text-violet-400 text-sm">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <button onClick={agregarVinculadosEditar} disabled={savingSup || selVinculadas.length === 0}
                    className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                    {savingSup ? 'Asignando...' : `Asignar ${selVinculadas.length > 0 ? selVinculadas.length : ''}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal simple — agregar cliente a ruta vinculada */}
      {modalSimpleRuta && (
        <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-50 pt-4 px-4 pb-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto pb-6">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">➕ Agregar cliente</h3>
                <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[200px]">{modalSimpleRuta.nombre}</p>
              </div>
              <button onClick={() => { setModalSimpleRuta(null); setSelSup([]); setBuscarSup('') }} className="text-zinc-400 hover:text-white text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <input value={buscarSup}
                onChange={e => { setBuscarSup(e.target.value); setPageSup(1); loadClientesSup(e.target.value, 1) }}
                placeholder="Buscar cliente..."
                className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
              <p className="text-zinc-500 text-xs">{selSup.length} seleccionados</p>
              <div className="space-y-2">
                {clientesSup.map((c: any) => {
                  const sel = selSup.includes(c.id)
                  return (
                    <button key={c.id} onClick={() => setSelSup(prev => sel ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                      className={"w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all " + (sel ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800")}>
                      <div className="w-8 h-8 bg-zinc-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {sel ? '✓' : c.nombre[0].toUpperCase()}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-white text-sm truncate">{c.nombre}</p>
                        {c.direccion && <p className="text-zinc-500 text-xs truncate">{c.direccion}</p>}
                      </div>
                    </button>
                  )
                })}
                {totalSup > LIMIT_SUP && (
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-zinc-600 text-xs">{((pageSup-1)*LIMIT_SUP)+1}–{Math.min(pageSup*LIMIT_SUP,totalSup)} de {totalSup}</p>
                    <div className="flex gap-2">
                      <button onClick={() => { const p = pageSup-1; setPageSup(p); loadClientesSup(buscarSup, p) }} disabled={pageSup===1}
                        className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">← Ant</button>
                      <button onClick={() => { const p = pageSup+1; setPageSup(p); loadClientesSup(buscarSup, p) }} disabled={pageSup*LIMIT_SUP>=totalSup}
                        className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig →</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setModalSimpleRuta(null); setSelSup([]); setBuscarSup('') }}
                  className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
                <button onClick={async () => {
                  if (selSup.length === 0) return
                  setSavingSup(true)
                  await fetch(`/api/rutas/${modalSimpleRuta.id}/agregar-clientes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clienteIds: selSup })
                  })
                  setSavingSup(false)
                  setModalSimpleRuta(null)
                  setSelSup([])
                  setBuscarSup('')
                  loadData()
                }} disabled={savingSup || selSup.length === 0}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                  {savingSup ? 'Agregando...' : `Agregar${selSup.length > 0 ? ` ${selSup.length}` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {visitaModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white font-bold">Comprobante de entrega</p>
              <button onClick={() => { setVisitaModal(null); setFirmaUrl(null) }} className="text-zinc-400 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-1 text-sm border-b border-zinc-700 pb-3">
              <p className="text-zinc-400">Cliente: <span className="text-white">{visitaModal.clienteNombre || ''}</span></p>
              <p className="text-zinc-400">Factura: <span className="text-blue-400 font-semibold">{visitaModal.factura || 'Sin factura'}</span></p>
              {visitaModal.monto && <p className="text-zinc-400">Monto: <span className="text-emerald-400 font-semibold">${Number(visitaModal.monto).toLocaleString('es-CO')}</span></p>}
              {visitaModal.nota && <p className="text-zinc-400">Nota: <span className="text-white">{visitaModal.nota}</span></p>}
              <p className="text-zinc-400">Fecha: <span className="text-white">{new Date(visitaModal.createdAt).toLocaleString('es-CO', {day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone: 'America/Bogota'})}</span></p>
            </div>
            {visitaModal.firma && (
              <div className="bg-white rounded-xl p-2">
                {firmaUrl
                  ? <img src={firmaUrl} alt="Firma" className="w-full rounded-lg" />
                  : <div className="flex items-center justify-center h-20 text-zinc-400 text-sm">Cargando firma...</div>
                }
              </div>
            )}
            {visitaModal.lat && (
              <a href={`https://www.google.com/maps?q=${visitaModal.lat},${visitaModal.lng}`} target="_blank"
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl px-4 py-3 text-emerald-400 text-sm">
                📍 Ver ubicación en Maps
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
