'use client'
import TabsNav from '@/components/TabsNav'
import SelectorMes from '@/components/SelectorMes'
import CumplimientoTabla from '@/components/CumplimientoTabla'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { checkPermiso } from '@/lib/permisos'

import { DIAS } from '@/lib/constants'

export default function RutasFijasPage() {
  const { data: session } = useSession()
  const user = (session?.user as any)
  const router = useRouter()
  const [empleados, setEmpleados] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [rutasFijas, setRutasFijas] = useState<any[]>([])
  const [empSeleccionado, setEmpSeleccionado] = useState<any>(null)
  const [modal, setModal] = useState(false)
  const [diaSemana, setDiaSemana] = useState(1)
  const [cliSeleccionados, setCliSeleccionados] = useState<string[]>([])
  const [metas, setMetas] = useState<Record<string, number>>({})
  const [modalMeta, setModalMeta] = useState<{id: string, nombre: string} | null>(null)
  const [inputMeta, setInputMeta] = useState('')
  const [buscarCli, setBuscarCli] = useState('')
  const [pageCli, setPageCli] = useState(1)
  const [totalCli, setTotalCli] = useState(0)
  const [loading, setLoading] = useState(false)
  const [ocultos, setOcultos] = useState<string[]>([])
  const [tab, setTab] = useState<'cumplimiento'|'historial'|'rutas'>('rutas')
  const [cumplimiento, setCumplimiento] = useState<Record<string, any>>({})
  const [loadingCumplimiento, setLoadingCumplimiento] = useState(false)
  const [mesPDF, setMesPDF] = useState(new Date().toISOString().slice(0, 7))
  const [impSeleccionada, setImpSeleccionada] = useState<string|null>(null)
  const [modalGestion, setModalGestion] = useState(false)
  const [gestionPunto, setGestionPunto] = useState<any>(null)
  const [gestionTipo, setGestionTipo] = useState('venta')
  const [gestionMonto, setGestionMonto] = useState('')
  const [gestionNota, setGestionNota] = useState('')
  const [guardandoGestion, setGuardandoGestion] = useState(false)
  const [fechaHistorial, setFechaHistorial] = useState(new Date().toISOString().split('T')[0])
  const [historialData, setHistorialData] = useState<any>({ visitas: [], impulsadoras: [], alertas: [] })
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const LIMIT_CLI = 10
  const esImpulsadora = user?.role === 'impulsadora'
  const esVendedor = user?.role === 'vendedor'
  const esAdmin = user?.role === 'empresa'
  const esSupervisor = user?.role === 'supervisor'
  const puedeAsignar = esAdmin || !esSupervisor || checkPermiso(session, 'asignarRutas')

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (esVendedor && user?.id) setTab('cumplimiento') }, [user?.id])
  useEffect(() => { if (esImpulsadora && user?.id) setTab('cumplimiento') }, [user?.id])
  useEffect(() => { if ((esAdmin || esSupervisor) && user?.id) setTab('cumplimiento') }, [user?.id])
  useEffect(() => {
    if (!user?.id || !empleados.length) return
    if (tab === 'cumplimiento' && (esVendedor || esImpulsadora || esAdmin || esSupervisor)) loadCumplimiento()
  }, [user?.id, empleados.length, tab])
  useEffect(() => {
    if (tab === 'historial' && (esVendedor || esImpulsadora || esAdmin || esSupervisor)) loadHistorial()
  }, [tab, fechaHistorial, user])

  async function loadData() {
    const [empRes, cliRes, rfRes] = await Promise.all([
      fetch('/api/empleados').then(r => r.json()),
      fetch('/api/clientes?page=1&limit=10').then(r => r.json()),
      fetch('/api/rutas-fijas').then(r => r.json()),
    ])
    setEmpleados(Array.isArray(empRes) ? empRes : Array.isArray(empRes?.empleados) ? empRes.empleados : [])
    setClientes(cliRes?.clientes || [])
    setTotalCli(cliRes?.total || 0)
    setRutasFijas(Array.isArray(rfRes) ? rfRes : [])
  }

  async function loadCumplimiento() {
    if (!esVendedor && !esImpulsadora && !esAdmin && !esSupervisor) return
    setLoadingCumplimiento(true)
    const fecha = new Date().toISOString().split('T')[0]
    const resultados: Record<string, any> = {}
    if (esImpulsadora) {
      const res = await fetch('/api/impulso?impulsadoraId=' + user?.id + '&fecha=' + fecha)
      const data = await res.json()
      resultados[user?.id] = { ...data, nombre: user?.name }
    } else {
      const impulsadoras = empleados.filter((e: any) => e.rol === 'impulsadora' && e.activo && (esAdmin || esSupervisor ? true : e.vendedorId === user?.id))
      for (const imp of impulsadoras) {
        const res = await fetch('/api/impulso?impulsadoraId=' + imp.id + '&fecha=' + fecha)
        const data = await res.json()
        resultados[imp.id] = { ...data, nombre: imp.nombre }
      }
    }
    setCumplimiento(resultados)
    setLoadingCumplimiento(false)
  }

  async function registrarGestion() {
    if (!gestionPunto || !impSeleccionada || !gestionMonto) return
    setGuardandoGestion(true)
    await fetch('/api/impulso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ impulsadoraId: impSeleccionada, clienteId: gestionPunto.clienteId, tipo: gestionTipo, monto: gestionMonto, nota: gestionNota })
    })
    setGuardandoGestion(false)
    setModalGestion(false)
    setGestionPunto(null)
    setGestionMonto('')
    setGestionNota('')
    loadCumplimiento()
  }

  async function loadHistorial() {
    setLoadingHistorial(true)
    if (esImpulsadora) {
      const res = await fetch('/api/visitas/todas')
      const visitas = await res.json()
      const filtradas = (Array.isArray(visitas) ? visitas : []).filter((v: any) => {
        const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(v.createdAt).toLocaleDateString('en-CA')
        return fv === fechaHistorial && (v.tipo === 'entrada' || v.tipo === 'salida')
      })
      setHistorialData({ visitas: filtradas, impulsadoras: [{ id: user?.id, nombre: user?.name || 'Yo' }] })
    } else {
      const res = await fetch('/api/visitas/impulsos?fecha=' + fechaHistorial)
      const data = await res.json()
      setHistorialData(data)
    }
    setLoadingHistorial(false)
  }

  function toggleOculto(id: string) {
    setOcultos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function rutasDeEmpleado(empId: string) {
    return rutasFijas.filter(r => r.empleados.some((re: any) => re.empleadoId === empId))
  }
  function abrirDia(emp: any, dia: number, rutaExistente?: any) {
    setEmpSeleccionado(emp)
    setDiaSemana(dia)
    setCliSeleccionados(rutaExistente ? rutaExistente.clientes.map((c: any) => c.clienteId) : [])
    const metasIniciales: Record<string, number> = {}
    if (rutaExistente) rutaExistente.clientes.forEach((c: any) => { if (c.metaVenta) metasIniciales[c.clienteId] = c.metaVenta })
    setMetas(metasIniciales)
    setBuscarCli('')
    setModal(true)
  }
  async function guardar() {
    setLoading(true)
    await fetch('/api/rutas-fijas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diaSemana, empleadoIds: [empSeleccionado.id], clienteIds: cliSeleccionados, metas })
    })
    setLoading(false)
    setModal(false)
    setCliSeleccionados([])
    setBuscarCli('')
    setMetas({})
    loadData()
  }
  async function eliminarDia(rutaId: string) {
    if (!confirm('Quitar esta ruta fija?')) return
    await fetch('/api/rutas-fijas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rutaId }) })
    loadData()
  }
  async function loadClientes(q: string, p: number) {
    const res = await fetch('/api/clientes?q=' + encodeURIComponent(q) + '&page=' + p + '&limit=' + LIMIT_CLI)
    const data = await res.json()
    setClientes(data.clientes || [])
    setTotalCli(data.total || 0)
  }
  const empleadosFiltrados = empleados.filter(e =>
    e.activo && e.rol === 'impulsadora' &&
    (!esImpulsadora || e.id === user?.id) &&
    (!esVendedor || e.vendedorId === user?.id)
  )
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{esVendedor ? 'Mis impulsos' : 'Rutas Fijas'}</h1>
        <p className="text-zinc-400 text-sm mt-1">{esImpulsadora ? 'Tu ruta semanal' : esVendedor ? 'Metas y rutas de tus impulsadoras' : (esAdmin || esSupervisor) ? 'Seguimiento de impulsadoras' : 'Plantillas semanales'}</p>
      </div>

      {(esVendedor || esImpulsadora || esAdmin || esSupervisor) && (
        <TabsNav
          active={tab}
          onChange={(id) => setTab(id as any)}
          tabs={[
            ...((esVendedor || esImpulsadora || esAdmin || esSupervisor) ? [{ id: 'cumplimiento', label: 'Metas', activeColor: 'bg-blue-600' }] : []),
            { id: 'historial', label: 'Historial', activeColor: 'bg-blue-600' },
            { id: 'rutas', label: 'Rutas fijas', activeColor: 'bg-blue-600' },
          ]}
        />
      )}

      {(esVendedor || esImpulsadora || esAdmin || esSupervisor) && tab === 'cumplimiento' && (
        <div className="space-y-4">
          {loadingCumplimiento ? (
            <div className="text-zinc-400 text-center py-8">Cargando...</div>
          ) : Object.keys(cumplimiento).length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
              <p className="text-3xl mb-2">🎯</p>
              <p className="text-zinc-400 text-sm">No hay impulsadoras asignadas</p>
            </div>
          ) : Object.entries(cumplimiento).map(([impId, data]: any) => (
            <CumplimientoTabla
              key={impId}
              impId={impId}
              data={data}
              esImpulsadora={esImpulsadora}
              onVenta={(id, punto) => {
                setImpSeleccionada(id)
                setGestionPunto(punto)
                setGestionTipo('venta')
                setGestionMonto('')
                setGestionNota('')
                setModalGestion(true)
              }}
            />
          ))}
          {Object.keys(cumplimiento).length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
              <SelectorMes value={mesPDF} onChange={setMesPDF} />
              <button
                onClick={() => window.open('/pdf-impulso?fecha=' + mesPDF + '-01', '_blank')}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2"
              >
                📄 Descargar PDF
              </button>
            </div>
          )}
        </div>
      )}
      {(esVendedor || esImpulsadora || esAdmin || esSupervisor) && tab === 'historial' && (
        <div className="space-y-4">
          <input type="date" value={fechaHistorial} onChange={e => setFechaHistorial(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          {loadingHistorial ? (
            <div className="text-zinc-400 text-center py-8">Cargando...</div>
          ) : (
            <div className="space-y-4">
              {(historialData.impulsadoras || []).map((imp: any) => {
                const visitasImp = (historialData.visitas || []).filter((v: any) => v.empleadoId === imp.id)
                const clientesMap: any = {}
                for (const v of visitasImp) {
                  if (!clientesMap[v.clienteId]) clientesMap[v.clienteId] = { cliente: v.cliente, entrada: null, salida: null }
                  if (v.tipo === 'entrada') clientesMap[v.clienteId].entrada = v
                  if (v.tipo === 'salida') clientesMap[v.clienteId].salida = v
                }
                const puntos = Object.values(clientesMap)
                return (
                  <div key={imp.id}>
                    {!esImpulsadora && (
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center text-white font-bold text-sm">{imp.nombre[0]}</div>
                        <div>
                          <p className="text-white font-semibold text-sm">{imp.nombre}</p>
                          <p className="text-zinc-500 text-xs">{puntos.length} puntos visitados</p>
                        </div>
                      </div>
                    )}
                    {puntos.length === 0 ? (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
                        <p className="text-zinc-400 text-sm">Sin registros para esta fecha</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {puntos.map((item: any) => {
                          const tiempoMin = item.entrada && item.salida
                            ? Math.round((new Date(item.salida.createdAt).getTime() - new Date(item.entrada.createdAt).getTime()) / 60000)
                            : null
                          return (
                            <div key={item.cliente.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
                              <p className="text-white font-semibold">{item.cliente.nombre}</p>
                              {item.cliente.nombreComercial && <p className="text-zinc-400 text-sm">{item.cliente.nombreComercial}</p>}
                                {(() => {
                                  const alertasCliente = (historialData.alertas || []).filter((a: any) => a.empleadoId === imp.id && a.detalle?.includes(item.cliente.nombre))
                                  const distMatch = alertasCliente[0]?.detalle?.match(/a ([0-9.]+)m del/)
                                  const distancia = distMatch ? Math.round(Number(distMatch[1])) : null
                                  const alertaTs = alertasCliente[0]?.createdAt ? new Date(alertasCliente[0].createdAt).getTime() : null
                                  const entradaTs = item.entrada?.createdAt ? new Date(item.entrada.createdAt).getTime() : null
                                  const salidaTs = item.salida?.createdAt ? new Date(item.salida.createdAt).getTime() : null
                                  const alertaEnEntrada = alertaTs && entradaTs && salidaTs
                                    ? Math.abs(alertaTs - entradaTs) <= Math.abs(alertaTs - salidaTs)
                                    : alertaTs && entradaTs ? true : false
                                  const alertaEnSalida = alertaTs && !alertaEnEntrada
                                  return (
                                    <>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <div className={"rounded-xl p-2.5 relative " + (item.entrada ? "bg-blue-500/10 border border-blue-500/20" : "bg-zinc-800")}>
                                            <p className="text-zinc-400 text-xs">Entrada</p>
                                            {item.entrada ? <p className="text-blue-400 font-semibold text-sm">{new Date(item.entrada.createdAt).toLocaleTimeString("es-CO", {hour:"2-digit", minute:"2-digit"})}</p> : <p className="text-zinc-600 text-sm">-</p>}
                                            {item.entrada?.lat && (
                                              <a href={"https://www.google.com/maps?q=" + item.entrada.lat + "," + item.entrada.lng} target="_blank" className="absolute top-2 right-2 text-base leading-none">📍</a>
                                            )}
                                          </div>
                                          {alertasCliente.length > 0 && alertaEnEntrada ? (
                                            <p className="text-orange-400 text-xs mt-1 px-1">⚠️ {distancia ? "a " + distancia + " mts" : "fuera de rango"}</p>
                                          ) : item.entrada?.lat && !alertaEnSalida ? (
                                            <p className="text-blue-400 text-xs mt-1 px-1">✓ ok</p>
                                          ) : null}
                                        </div>
                                        <div>
                                          <div className={"rounded-xl p-2.5 relative " + (item.salida ? "bg-orange-500/10 border border-orange-500/20" : "bg-zinc-800")}>
                                            <p className="text-zinc-400 text-xs">Salida</p>
                                            {item.salida ? <p className="text-orange-400 font-semibold text-sm">{new Date(item.salida.createdAt).toLocaleTimeString("es-CO", {hour:"2-digit", minute:"2-digit"})}</p> : <p className="text-zinc-600 text-sm">-</p>}
                                            {item.salida?.lat && (
                                              <a href={"https://www.google.com/maps?q=" + item.salida.lat + "," + item.salida.lng} target="_blank" className="absolute top-2 right-2 text-base leading-none">📍</a>
                                            )}
                                          </div>
                                          {alertasCliente.length > 0 && alertaEnSalida ? (
                                            <p className="text-orange-400 text-xs mt-1 px-1">⚠️ {distancia ? "a " + distancia + " mts" : "fuera de rango"}</p>
                                          ) : item.salida?.lat && !alertaEnEntrada ? (
                                            <p className="text-blue-400 text-xs mt-1 px-1">✓ ok</p>
                                          ) : null}
                                        </div>
                                      </div>
                                      {tiempoMin !== null && <p className="text-zinc-500 text-xs text-center">{tiempoMin} min en punto</p>}
                                    </>
                                  )
                                })()}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {(historialData.impulsadoras || []).length === 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
                  <p className="text-zinc-400 text-sm">Sin registros</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'rutas' && (
        <div className="space-y-4">
          {empleadosFiltrados.map((emp: any) => {
            const rutasEmp = rutasDeEmpleado(emp.id)
            return (
              <div key={emp.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                {!esImpulsadora && (
                  <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
                    <div className="w-9 h-9 bg-zinc-700 rounded-full flex items-center justify-center text-white font-bold">{emp.nombre[0]}</div>
                    <div className="flex-1">
                      <p className="text-white font-semibold">{emp.nombre}</p>
                      <p className="text-zinc-500 text-xs">{rutasEmp.length} dias configurados</p>
                    </div>
                  </div>
                )}
                <div className="p-3 space-y-2">
                  {DIAS.map((dia, idx) => {
                    if (dia === '_') return null
                      const diaNum = idx
                    const rutaDia = rutasEmp.find(r => r.diaSemana === diaNum)
                    const esOculto = rutaDia ? ocultos.includes(rutaDia.id) : false
                    return (
                      <div key={diaNum} className={"rounded-xl border " + (rutaDia ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-900 border-zinc-800')}>
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <span className={"text-sm font-medium w-20 flex-shrink-0 " + (rutaDia ? 'text-blue-400' : 'text-zinc-500')}>{dia}</span>
                          <div className="flex-1 min-w-0">
                            {rutaDia ? (
                              <p className="text-zinc-400 text-xs">{rutaDia.clientes.length} clientes</p>
                            ) : (
                              <p className="text-zinc-600 text-xs">Sin asignar</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {rutaDia ? (
                              <>
                                <button onClick={() => toggleOculto(rutaDia.id)} className="text-zinc-400 text-xs bg-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-600">{esOculto ? 'Ver' : 'Ocultar'}</button>
                                {!esImpulsadora && puedeAsignar && (
                                  <>
                                    <button onClick={() => abrirDia(emp, diaNum, rutaDia)} className="text-zinc-400 text-xs bg-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-600">Editar</button>
                                    <button onClick={() => eliminarDia(rutaDia.id)} className="text-zinc-600 hover:text-red-400 text-xs px-1">x</button>
                                  </>
                                )}
                              </>
                            ) : !esImpulsadora && puedeAsignar ? (
                              <button onClick={() => abrirDia(emp, diaNum)} className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-lg">+ Asignar</button>
                            ) : null}
                          </div>
                        </div>
                        {rutaDia && !esOculto && (
                          <div className="px-3 pb-3 space-y-1">
                            {rutaDia.clientes.map((rc: any, i: number) => (
                              <div key={rc.id} className="flex items-center gap-2 bg-zinc-900 rounded-lg px-2 py-1.5">
                                <span className="text-zinc-500 text-xs w-4">{i+1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-xs truncate">{rc.cliente.nombre}</p>
                                </div>
                                {rc.metaVenta > 0 && <span className="text-yellow-400 text-xs">${rc.metaVenta.toLocaleString('es-CO')}</span>}
                                {rc.cliente.ubicacionReal && <span className="text-blue-400 text-xs">GPS</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {empleadosFiltrados.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
              <p className="text-zinc-400 text-sm">No hay impulsadoras configuradas</p>
            </div>
          )}
        </div>
      )}
      {modal && empSeleccionado && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 pt-5 pb-3 border-b border-zinc-800 flex-shrink-0">
              <h3 className="text-white font-bold">{empSeleccionado.nombre} - {DIAS[diaSemana]}</h3>
              <p className="text-zinc-500 text-xs mt-0.5">{cliSeleccionados.length} clientes seleccionados</p>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {cliSeleccionados.length > 0 && (
                <div className="space-y-2">
                  <p className="text-zinc-400 text-xs font-semibold">SELECCIONADOS</p>
                  {[...cliSeleccionados].sort((a,b) => (metas[b]||0) - (metas[a]||0)).map((cid, idx) => {
                    const cli: any = clientes.find((x: any) => x.id === cid) || { id: cid, nombre: cid }
                    const meta = metas[cid]
                    return (
                      <div key={cid} className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5">
                        <span className="text-zinc-500 text-xs w-4 flex-shrink-0">{idx+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">{cli.nombre}</p>
                          {cli.nombreComercial && <p className="text-zinc-500 text-xs">{cli.nombreComercial}</p>}
                        </div>
                        {meta > 0 ? (
                          <button onClick={() => { setModalMeta({id: cid, nombre: cli.nombre}); setInputMeta(String(meta)) }}
                            className="text-yellow-400 text-xs bg-yellow-500/10 px-2 py-1 rounded-lg flex-shrink-0">
                            ${Number(meta).toLocaleString('es-CO')}
                          </button>
                        ) : (
                          <button onClick={() => { setModalMeta({id: cid, nombre: cli.nombre}); setInputMeta('') }}
                            className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-lg flex-shrink-0">
                            Sin meta
                          </button>
                        )}
                        <button onClick={() => { setCliSeleccionados(p => p.filter(x => x !== cid)); setMetas(m => { const n={...m}; delete n[cid]; return n }) }}
                          className="text-zinc-600 hover:text-red-400 text-sm flex-shrink-0">x</button>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-zinc-400 text-xs font-semibold">AGREGAR CLIENTES</p>
                <input value={buscarCli}
                  onChange={e => { setBuscarCli(e.target.value); setPageCli(1); loadClientes(e.target.value, 1) }}
                  placeholder="Buscar..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
                <div className="space-y-1.5">
                  {clientes.filter((c: any) => c.ubicacionReal && !cliSeleccionados.includes(c.id)).map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 bg-zinc-800 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{c.nombre}</p>
                        {c.nombreComercial && <p className="text-zinc-500 text-xs">{c.nombreComercial}</p>}
                      </div>
                      <button onClick={() => {
                          // Buscar meta existente en cualquier ruta de este empleado
                          let metaExistente = 0
                          if (empSeleccionado) {
                            const rutasEmp = rutasFijas.filter(r => r.empleados.some((re: any) => re.empleadoId === empSeleccionado.id))
                            for (const r of rutasEmp) {
                              const rc = r.clientes.find((rc: any) => rc.clienteId === c.id)
                              if (rc?.metaVenta) { metaExistente = rc.metaVenta; break }
                            }
                          }
                          if (metaExistente > 0) {
                            setMetas(m => ({ ...m, [c.id]: metaExistente }))
                            setCliSeleccionados(p => [...p, c.id])
                          } else {
                            setModalMeta({id: c.id, nombre: c.nombre}); setInputMeta('')
                          }
                        }}
                        className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg flex-shrink-0">
                        + Agregar
                      </button>
                    </div>
                  ))}
                  {totalCli > LIMIT_CLI && (
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-zinc-600 text-xs">{((pageCli-1)*LIMIT_CLI)+1}-{Math.min(pageCli*LIMIT_CLI,totalCli)} de {totalCli}</p>
                      <div className="flex gap-2">
                        <button onClick={() => { const p=pageCli-1; setPageCli(p); loadClientes(buscarCli,p) }} disabled={pageCli===1} className="bg-zinc-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Ant</button>
                        <button onClick={() => { const p=pageCli+1; setPageCli(p); loadClientes(buscarCli,p) }} disabled={pageCli*LIMIT_CLI>=totalCli} className="bg-zinc-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-zinc-800 flex-shrink-0">
              <button onClick={() => { setModal(false); setCliSeleccionados([]); setBuscarCli(''); setMetas({}) }}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={guardar}
                disabled={loading || cliSeleccionados.length === 0 || cliSeleccionados.some(id => !metas[id] || metas[id] <= 0)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                {loading ? 'Guardando...' : cliSeleccionados.some(id => !metas[id] || metas[id] <= 0) ? 'Faltan metas' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMeta && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="text-white font-bold">Meta mensual</h3>
              <p className="text-zinc-400 text-sm">{modalMeta.nombre}</p>
            </div>
            <input type="text" inputMode="numeric" value={inputMeta}
              onChange={e => setInputMeta(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Ej: 500000"
              autoFocus
              className="w-full bg-zinc-800 border border-emerald-500 rounded-xl px-4 py-3 text-white text-lg outline-none" />
            {inputMeta && <p className="text-blue-400 text-xs">${Number(inputMeta).toLocaleString('es-CO')}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setModalMeta(null); setInputMeta('') }}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button disabled={!inputMeta || Number(inputMeta) <= 0}
                onClick={() => {
                  const meta = Number(inputMeta)
                  setMetas(m => ({ ...m, [modalMeta.id]: meta }))
                  if (!cliSeleccionados.includes(modalMeta.id)) setCliSeleccionados(p => [...p, modalMeta.id])
                  setModalMeta(null)
                  setInputMeta('')
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                {cliSeleccionados.includes(modalMeta.id) ? 'Actualizar' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalGestion && gestionPunto && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Registrar gestion</h3>
              <button onClick={() => setModalGestion(false)} className="text-zinc-500 hover:text-white">x</button>
            </div>
            <div className="bg-zinc-800 rounded-xl p-3">
              <p className="text-white font-medium">{gestionPunto.nombre}</p>
              {gestionPunto.meta > 0 && <p className="text-zinc-500 text-xs mt-1">Meta: ${gestionPunto.meta.toLocaleString('es-CO')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['venta','cobro'].map(t => (
                <button key={t} onClick={() => setGestionTipo(t)}
                  className={"py-2.5 rounded-xl text-sm font-semibold border " + (gestionTipo === t ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400")}>
                  {t === 'venta' ? 'Venta' : 'Cobro'}
                </button>
              ))}
            </div>
            <input type="text" inputMode="numeric" value={gestionMonto}
              onChange={e => setGestionMonto(e.target.value.replace(/[^0-9]/g,''))}
              placeholder="Monto $"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
            <textarea value={gestionNota} onChange={e => setGestionNota(e.target.value)}
              rows={2} placeholder="Nota opcional"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={() => setModalGestion(false)} className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={registrarGestion} disabled={guardandoGestion || !gestionMonto}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-sm py-3 rounded-xl">
                {guardandoGestion ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
