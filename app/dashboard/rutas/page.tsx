'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { DIAS } from '@/lib/constants'
import { checkPermiso } from '@/lib/permisos'

function hoySufijo() {
  const now = new Date(Date.now() - 5 * 60 * 60 * 1000)
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function esDeHoy(ruta: any) {
  if (!ruta.fecha) return false
  const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
  return ruta.fecha.split('T')[0] === hoy
}

export default function RutasPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const esSupervisor = user?.role === 'supervisor'
  const esEmpresa = user?.role === 'empresa'
  const puedeAsignar = !user || esEmpresa || checkPermiso(session, 'asignarRutas')

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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Rutas</h1>
        <div className="flex items-center gap-2">
          <div className="relative flex items-center gap-1">
            {filtroFecha ? (
              <>
                <span className="text-zinc-400 text-xs">{filtroFecha}</span>
                <button onClick={() => { setFiltroFecha(''); setPageRutas(1) }}
                  className="text-zinc-400 hover:text-white text-sm bg-zinc-800 px-2 py-1.5 rounded-lg">×</button>
              </>
            ) : null}
            <label className="cursor-pointer text-zinc-400 hover:text-white text-2xl bg-zinc-800 px-2.5 py-1.5 rounded-lg">
              📅
              <input type="date" value={filtroFecha}
                onChange={e => { setFiltroFecha(e.target.value); setPageRutas(1) }}
                className="absolute opacity-0 w-0 h-0" />
            </label>
          </div>
          {puedeAsignar && !esSupervisor && (
            <>
            <button onClick={generarRutaHoy} disabled={generando} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm whitespace-nowrap">
              {generando ? "⏳" : "🔄"} {generando ? "Generando..." : "Generar hoy"}
            </button>
            <button onClick={() => setModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm whitespace-nowrap">
              + Ruta
            </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {rutasPagina.map((r: any) => {
          const esVinculada = r.empresaVinculadaId != null
          const totalClientes = r.clientes.length
          const rezagos = r.clientes.filter((rc: any) => rc.rezago).length
          const etiquetasUnicas = new Set(r.clientes.filter((rc: any) => rc.supervisorEtiqueta).map((rc: any) => rc.supervisorEtiqueta))
          const totalEmpresas = esVinculada ? 1 : 1 + etiquetasUnicas.size
          let pct = 0; let pendientes = 0
          if (r.cerrada && totalClientes > 0 && r.fecha) {
            const visitados = r.clientes.filter((rc: any) => (r.visitas || []).some((v: any) => v.clienteId === rc.clienteId)).length
            pct = Math.round(visitados / totalClientes * 100)
            pendientes = totalClientes - visitados
          }
          return (
          <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3">
            {/* Línea 1: nombre + fecha */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-white font-semibold truncate">{r.nombre}</p>
              {r.fecha && <p className="text-zinc-500 text-xs whitespace-nowrap">{nombreFecha(r.fecha)}</p>}
            </div>
            {/* Línea 2: stats + badge + botones — todo en una línea */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-zinc-400 text-xs">🏢{totalEmpresas}</span>
              <span className="text-zinc-400 text-xs">👤{totalClientes}</span>
              {!esVinculada && rezagos > 0 && <span className="text-amber-400 text-xs">↩️{rezagos}</span>}
              {r.cerrada && totalClientes > 0 && r.fecha && (
                pendientes === 0
                  ? <span className="text-xs font-semibold text-emerald-400">✓ 100%</span>
                  : <span className="text-xs font-semibold text-amber-400">✓ {pct}% ⚠️{pendientes}</span>
              )}
              <div className="flex-1" />
              <button onClick={() => setRutaDetalle(rutaDetalle?.id === r.id ? null : r)}
                className="text-zinc-400 hover:text-white text-sm bg-zinc-800 px-2.5 py-1.5 rounded-lg">
                {rutaDetalle?.id === r.id ? '▲' : '👁️'}
              </button>
              <Link href={`/dashboard/mapa?rutaId=${r.id}`}
                className="text-zinc-400 hover:text-white text-sm bg-zinc-800 px-2.5 py-1.5 rounded-lg">
                🗺️
              </Link>
              {esVinculada ? (
                <button onClick={() => abrirModalSimple(r)}
                  className="text-emerald-400 hover:text-emerald-300 text-sm bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
                  ➕
                </button>
              ) : puedeAsignar && !esSupervisor ? (
                <button onClick={() => abrirEditar(r)} className="text-zinc-400 hover:text-white text-sm bg-zinc-800 px-2.5 py-1.5 rounded-lg">✏️</button>
              ) : null}
            </div>
            {/* Panel de detalle */}
            {rutaDetalle?.id === r.id && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-zinc-400 text-xs font-semibold mb-2">EMPLEADOS</p>
                  <div className="space-y-1">
                    {r.empleados.map((re: any) => (
                      <div key={re.id} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                        <div className="w-6 h-6 bg-zinc-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {re.empleado.nombre[0].toUpperCase()}
                        </div>
                        <span className="text-white text-sm">{re.empleado.nombre}</span>
                        <span className="text-zinc-500 text-xs capitalize ml-auto">{re.empleado.rol}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-zinc-400 text-xs font-semibold mb-2">CLIENTES EN ORDEN</p>
                  <div className="space-y-2">
                    {r.clientes.map((rc: any, i: number) => {
                      const visitasCli = (r.visitas || []).filter((v: any) => v.clienteId === rc.clienteId)
                      const ejecutado = visitasCli.length > 0
                      return (
                        <div key={rc.id} className={"rounded-xl border " + (ejecutado ? "bg-zinc-800/60 border-zinc-700" : "bg-zinc-800 border-zinc-700")}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className={"text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0 " + (ejecutado ? "bg-emerald-500 text-black" : rc.rezago ? "bg-amber-500/20 text-amber-400" : "bg-zinc-600 text-zinc-300")}>{ejecutado ? "✓" : rc.rezago ? "↩" : i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">{rc.cliente.nombre}</p>
                              {rc.cliente.direccion && <p className="text-zinc-500 text-xs truncate">{rc.cliente.direccion}</p>}
                            </div>
                            {rc.supervisorEtiqueta && <span className="text-blue-400 text-xs">{rc.supervisorEtiqueta}</span>}
                            {rc.cliente.ubicacionReal && <span className="text-emerald-400 text-xs">GPS</span>}
                          </div>
                          {visitasCli.length > 0 && (
                            <div className="px-3 pb-2 space-y-1 border-t border-zinc-700 pt-2">
                              {visitasCli.map((v: any) => (
                                <button key={v.id} onClick={async () => {
                                    setFirmaUrl(null)
                                    setVisitaModal({...v, clienteNombre: rc.cliente.nombre})
                                    if (v.firma) {
                                      const res = await fetch('/api/firma', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ firma: v.firma }) }).then(r => r.json())
                                      if (res.url) setFirmaUrl(res.url)
                                    }
                                  }}
                                  className="w-full flex items-center gap-2 text-xs bg-zinc-700/50 hover:bg-zinc-700 rounded-lg px-2 py-1.5 transition-colors">
                                  <span>{v.tipo === 'venta' ? '💰' : v.tipo === 'cobro' ? '💵' : v.tipo === 'entrega' ? '📦' : '👁️'}</span>
                                  <span className="text-zinc-300 capitalize">{v.tipo}</span>
                                  {v.monto && <span className="text-emerald-400 font-semibold">${Number(v.monto).toLocaleString('es-CO')}</span>}
                                  <span className="text-zinc-500 ml-auto">{new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}</span>
                                  {v.firma && <span className="text-blue-400">✍️</span>}
                                  {v.lat && <span className="text-emerald-400">📍</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          )
        })}
        {rutasFiltradas.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <p className="text-3xl mb-2">🛣️</p>
            <p className="text-zinc-400">{filtroFecha ? 'Sin rutas para esa fecha' : 'No hay rutas creadas'}</p>
          </div>
        )}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-zinc-500 text-xs">Página {pageRutas} de {totalPaginas}</p>
            <div className="flex gap-2">
              <button onClick={() => setPageRutas(p => p - 1)} disabled={pageRutas === 1}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">← Ant</button>
              <button onClick={() => setPageRutas(p => p + 1)} disabled={pageRutas >= totalPaginas}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal nueva/editar ruta (solo no-supervisor) */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-4 px-4 pb-4" >
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
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
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
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
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
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
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
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-4 px-4 pb-4">
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
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
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
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-4 px-4 pb-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto pb-24 md:pb-6">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <input value={nombre} onChange={e => setNombre(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm font-semibold outline-none focus:border-emerald-500" />
                <button onClick={guardarEdicion} disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm px-4 py-2 rounded-xl whitespace-nowrap">
                  {loading ? '...' : 'Guardar'}
                </button>
                <button onClick={cerrarModalEditar} className="text-zinc-400 hover:text-white text-xl">×</button>
              </div>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-emerald-500" />
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
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
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
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-4 px-4 pb-4">
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
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
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
              <p className="text-zinc-400">Fecha: <span className="text-white">{new Date(new Date(visitaModal.createdAt).getTime() - 5*60*60*1000).toLocaleString('es-CO', {day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'})}</span></p>
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
