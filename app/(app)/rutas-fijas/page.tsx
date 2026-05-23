'use client'
import dynamic from 'next/dynamic'
import TabsNav from '@/components/TabsNav'
import SelectorMes from '@/components/SelectorMes'
const CumplimientoTabla = dynamic(() => import('@/components/CumplimientoTabla'), { ssr: false })
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { checkPermiso } from '@/lib/permisos'

import { DIAS } from '@/lib/constants'
import { SyncIcon } from '@/components/SyncIcon'
import { distanciaMetros } from '@/lib/gps'

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
  const [modalMeta, setModalMeta] = useState<{id: string, nombre: string, rutaFijaId?: string} | null>(null)
  const [inputMeta, setInputMeta] = useState('')
  const [promedio, setPromedio] = useState<any>(null)
  const [calculandoPromedio, setCalculandoPromedio] = useState(false)

  async function calcularPromedio(clienteId: string) {
    setCalculandoPromedio(true)
    setPromedio(null)
    try {
      const res = await fetch('/api/clientes/' + clienteId + '/promedio').then(r => r.json())
      setPromedio(res)
    } finally {
      setCalculandoPromedio(false)
    }
  }
  const [buscarCli, setBuscarCli] = useState('')
  const [pageCli, setPageCli] = useState(1)
  const [totalCli, setTotalCli] = useState(0)
  const [loading, setLoading] = useState(false)
  const [diaAbiertoEmp, setDiaAbiertoEmp] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<'historial'|'rutas'>('rutas')
  const [modalVerRuta, setModalVerRuta] = useState<{emp: any, dia: number, ruta: any}|null>(null)
  const [bottomSheet, setBottomSheet] = useState<{rc: any, rutaId: string}|null>(null)
  const [syncVentas, setSyncVentas] = useState<{usadosHoy:number,restantes:number,ultimoSync:string|null,puedeSync:boolean}|null>(null)
  const [sincronizandoVentas, setSincronizandoVentas] = useState(false)
  const [expandedCliente, setExpandedCliente] = useState<string|null>(null)
  const mesActual = new Date().toISOString().slice(0,7)
  const [ventasHoy, setVentasHoy] = useState<Record<string, number>>({})
  // clienteId -> { [mes: YYYY-MM]: { totalVenta, cantidadVisitas } }
  const [ventasMes, setVentasMes] = useState<Record<string, Record<string, {totalVenta: number, cantidadVisitas: number}>>>({})

  async function loadVentasHoy() {
    try {
      const fecha = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/visitas/admin?fecha=' + fecha + '&limit=500&tipo=venta')
      const data = await res.json()
      const porCliente: Record<string, number> = {}
      for (const v of (data.visitas || [])) {
        if (v.clienteId && v.monto > 0) {
          porCliente[v.clienteId] = (porCliente[v.clienteId] || 0) + Number(v.monto)
        }
      }
      setVentasHoy(porCliente)
    } catch {}
  }

  async function recargarSyncEstado() {
    const res = await fetch('/api/sync/ventas').then(r => r.json()).catch(() => null)
    if (res) setSyncVentas(res)
  }

  async function ejecutarSyncVentas() {
    if (!syncVentas?.puedeSync || sincronizandoVentas) return
    setSincronizandoVentas(true)
    try {
      const res = await fetch('/api/sync/ventas', { method: 'POST' })
      const data = await res.json()
      setSyncVentas(prev => prev ? { ...prev, usadosHoy: data.restantes !== undefined ? 2 - data.restantes : prev.usadosHoy, restantes: data.restantes ?? 0, ultimoSync: data.ultimoSync, puedeSync: (data.restantes ?? 0) > 0 } : null)
      // Recargar ventas mes — forzar nuevo objeto para trigger re-render
      setVentasMes({})
      const allClientes: any[] = []
      for (const rf of rutasFijas) for (const cli of (rf.clientes || [])) allClientes.push(cli)
      await loadVentasMes(allClientes)
      await loadVentasHoy()
      await recargarSyncEstado()
    } catch {}
    setSincronizandoVentas(false)
  }

  async function loadVentasMes(clientes: any[]) {
    try {
      const ids = clientes.map((c: any) => c.clienteId).filter(Boolean)
      if (ids.length === 0) return
      const res = await fetch('/api/impulsos/ventas-mes?clienteIds=' + ids.join(','))
      const data = await res.json()
      const mapa: Record<string, Record<string, {totalVenta: number, cantidadVisitas: number}>> = {}
      for (const v of (data.ventas || [])) {
        if (!mapa[v.clienteId]) mapa[v.clienteId] = {}
        mapa[v.clienteId][v.mes] = { totalVenta: v.totalVenta, cantidadVisitas: v.cantidadVisitas }
      }
      setVentasMes(mapa)
    } catch {}
  }
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

  useEffect(() => {
    if (!user?.id || !empleados.length) return
    // cumplimiento tab removed
  }, [user?.id, empleados.length, tab])
  useEffect(() => {
    if (tab === 'historial' && (esVendedor || esImpulsadora || esAdmin || esSupervisor)) loadHistorial()
  }, [tab, fechaHistorial, user])
  useEffect(() => {
    if (tab === 'rutas') loadVentasHoy()
  }, [tab])

  useEffect(() => {
    if (!user) return
    const rol = (user as any).role
    if (['empresa','supervisor','vendedor','impulsadora'].includes(rol)) {
      recargarSyncEstado()
    }
  }, [user])

  async function loadData() {
    const [empRes, cliRes, rfRes] = await Promise.all([
      fetch('/api/empleados').then(r => r.json()),
      fetch('/api/clientes?page=1&limit=10').then(r => r.json()),
      fetch('/api/rutas-fijas').then(r => r.json()),
    ])
    setEmpleados(Array.isArray(empRes) ? empRes : Array.isArray(empRes?.empleados) ? empRes.empleados : [])
    setClientes(cliRes?.clientes || [])
    setTotalCli(cliRes?.total || 0)
    const todasRutas = Array.isArray(rfRes) ? rfRes : []
    setRutasFijas(todasRutas)
    // Juntar todos los RutaFijaCliente únicos de todas las rutas
    const allClientes: any[] = []
    for (const rf of todasRutas) {
      for (const cli of (rf.clientes || [])) {
        allClientes.push(cli)
      }
    }
    loadVentasMes(allClientes)
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
      // Paralelo — todas las impulsadoras en un solo round-trip
      await Promise.all(impulsadoras.map(async (imp: any) => {
        const data = await fetch('/api/impulso?impulsadoraId=' + imp.id + '&fecha=' + fecha).then(r => r.json())
        resultados[imp.id] = { ...data, nombre: imp.nombre }
      }))
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
        const fv = v.fechaBogota ? v.fechaBogota.split('T')[0] : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
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

  function abrirDiaAcordeon(empId: string, diaNum: number) {
    setDiaAbiertoEmp(prev => ({ ...prev, [empId]: prev[empId] === diaNum ? -1 : diaNum }))
  }
  function esDiaAbierto(empId: string, diaNum: number) {
    const v = diaAbiertoEmp[empId]
    return v === undefined ? diaNum === 1 : v === diaNum
  }
  function rutasDeEmpleado(empId: string) {
    return rutasFijas.filter(r => r.empleados.some((re: any) => re.empleadoId === empId))
  }
  function abrirDia(emp: any, dia: number, rutaExistente?: any) {
    setEmpSeleccionado(emp)
    setDiaSemana(dia)
    setCliSeleccionados(rutaExistente ? rutaExistente.clientes.map((c: any) => c.clienteId) : [])
    const metasIniciales: Record<string, number> = {}
    if (rutaExistente) {
      rutaExistente.clientes.forEach((c: any) => { if (c.metaVenta) metasIniciales[c.clienteId] = c.metaVenta })
      // Asegurar que los clientes ya asignados estén en la lista para mostrar su nombre
      setClientes(prev => {
        const existentes = new Map(prev.map((x: any) => [x.id, x]))
        rutaExistente.clientes.forEach((rc: any) => {
          if (!existentes.has(rc.clienteId)) existentes.set(rc.clienteId, rc.cliente)
        })
        return Array.from(existentes.values())
      })
    }
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

  async function quitarClienteDia(rutaId: string, clienteId: string) {
    // Quitar un cliente específico de la ruta — reenviar sin ese cliente
    const ruta = rutasFijas.find(r => r.id === rutaId)
    if (!ruta) return
    const nuevosIds = ruta.clientes.filter((rc: any) => rc.clienteId !== clienteId).map((rc: any) => rc.clienteId)
    const nuevasMetas: Record<string, number> = {}
    ruta.clientes.filter((rc: any) => rc.clienteId !== clienteId).forEach((rc: any) => {
      if (rc.metaVenta) nuevasMetas[rc.clienteId] = rc.metaVenta
    })
    if (nuevosIds.length === 0) {
      await fetch('/api/rutas-fijas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rutaId }) })
    } else {
      await fetch('/api/rutas-fijas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diaSemana: ruta.diaSemana, empleadoIds: ruta.empleados.map((re: any) => re.empleadoId), clienteIds: nuevosIds, metas: nuevasMetas })
      })
    }
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
    <div className="space-y-3 max-w-7xl mx-auto">
<div className="flex gap-1 tab-pills rounded-xl p-1">
        <button onClick={() => setTab('rutas')} className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tab === 'rutas' ? 'tab-active' : 'text-white hover:text-white'}`}>Rutas fijas</button>
        <button onClick={() => setTab('historial')} className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tab === 'historial' ? 'tab-active' : 'text-white hover:text-white'}`}>Historial</button>
        {syncVentas && (
          <button onClick={ejecutarSyncVentas} disabled={sincronizandoVentas}
            className={`tab-btn flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-40 ${sincronizandoVentas ? 'btn-shimmer' : ''}`}>
            <SyncIcon spinning={sincronizandoVentas} className="w-3.5 h-3.5 text-blue-400" />
            {sincronizandoVentas ? '...' : 'Sync'}
          </button>
        )}
      </div>

      {tab === 'historial' && (
        <div className="space-y-4">
          <input type="date" value={fechaHistorial} onChange={e => setFechaHistorial(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          {(esAdmin || esSupervisor) && (
            <div className="flex items-center gap-2">
              <input type="month" value={mesPDF} onChange={e => setMesPDF(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
              <button
                onClick={() => window.open(`/pdf-impulso?fecha=${mesPDF}-01`, '_blank')}
                className="flex-shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2">
                📄 PDF
              </button>
            </div>
          )}
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
                            <div key={item.cliente.id} className="rounded-2xl p-4 space-y-2" style={{background:"#000000",border:"1px solid rgba(59,130,246,0.45)"}}>
                              <p className="text-white font-semibold">{item.cliente.nombre}</p>
                              {item.cliente.nombreComercial && <p className="text-zinc-400 text-sm">{item.cliente.nombreComercial}</p>}
                                {(() => {
                                  // Distancia directa: Visita.lat/lng vs Cliente.lat/lng
                                  const clienteLat = item.cliente.lat
                                  const clienteLng = item.cliente.lng
                                  const distEntrada = item.entrada?.lat && clienteLat
                                    ? Math.round(distanciaMetros(item.entrada.lat, item.entrada.lng, clienteLat, clienteLng))
                                    : null
                                  const distSalida = item.salida?.lat && clienteLat
                                    ? Math.round(distanciaMetros(item.salida.lat, item.salida.lng, clienteLat, clienteLng))
                                    : null
                                  const alertaEnEntrada = distEntrada !== null && distEntrada > 100
                                  const alertaEnSalida = distSalida !== null && distSalida > 100
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
                                          {alertaEnEntrada ? (
                                            <p className="text-orange-400 text-xs mt-1 px-1">⚠️ a {distEntrada} mts</p>
                                          ) : item.entrada?.lat && clienteLat ? (
                                            <p className="text-emerald-400 text-xs mt-1 px-1">✓ {distEntrada}m</p>
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
                                          {alertaEnSalida ? (
                                            <p className="text-orange-400 text-xs mt-1 px-1">⚠️ a {distSalida} mts</p>
                                          ) : item.salida?.lat && clienteLat ? (
                                            <p className="text-emerald-400 text-xs mt-1 px-1">✓ {distSalida}m</p>
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
            // Calcular qué clientes aparecen más de una vez en todas las rutas del empleado
            const rutasEmp2 = rutasFijas.filter((r: any) => r.empleados?.some((re: any) => re.empleadoId === emp.id))
            const _cliCount: Record<string, number> = {}
            rutasEmp2.forEach((r: any) => r.clientes.forEach((rc: any) => { _cliCount[rc.clienteId] = (_cliCount[rc.clienteId] || 0) + 1 }))
            const clientesRepetidos = new Set(Object.keys(_cliCount).filter(id => _cliCount[id] > 1))
            const clientesPrimerDia: Record<string, number> = {} // clienteId -> diaNum de primera aparición
            ;[1,2,3,4,5,6,0].forEach((dn) => {
              const rd = rutasEmp2.find((r: any) => r.diaSemana === dn)
              if (!rd) return
              rd.clientes.forEach((rc: any) => {
                if (!(rc.clienteId in clientesPrimerDia)) clientesPrimerDia[rc.clienteId] = dn
              })
            })
            const rutasEmp = rutasDeEmpleado(emp.id)
            return (
              <div key={emp.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                {(() => {
                    const metaPorCliente: Record<string, number> = {}
                    const ventaPorCliente: Record<string, number> = {}
                    rutasEmp.forEach((r: any) => r.clientes.forEach((rc: any) => {
                      if (!(rc.clienteId in metaPorCliente)) metaPorCliente[rc.clienteId] = rc.metaVenta || 0
                      if (!(rc.clienteId in ventaPorCliente)) ventaPorCliente[rc.clienteId] = ventasMes[rc.clienteId]?.[mesActual]?.totalVenta || ventasHoy[rc.clienteId] || 0
                    }))
                    const totalMeta = Object.values(metaPorCliente).reduce((a, b) => a + b, 0)
                    const totalVenta = Object.values(ventaPorCliente).reduce((a, b) => a + b, 0)
                    const pct = totalMeta > 0 ? Math.round((totalVenta / totalMeta) * 100) : null
                    const pctColor = pct === null ? '' : pct >= 100 ? 'text-emerald-400' : pct >= 70 ? 'text-yellow-400' : 'text-red-400'
                    const barColor = pct === null ? '' : pct >= 100 ? 'bg-blue-500' : pct >= 70 ? 'bg-cyan-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                    return (
                      <div className="p-4 border-b border-zinc-800 space-y-3">
                        {/* Nombre */}
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-zinc-700 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-sm">{emp.nombre[0]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold truncate">{emp.nombre}</p>
                            <p className="text-zinc-500 text-xs">{rutasEmp.length} {rutasEmp.length === 1 ? 'día configurado' : 'días configurados'}</p>
                          </div>
                          {pct !== null && (
                            <span className={`text-base font-bold flex-shrink-0 ${pctColor}`}>{pct}%</span>
                          )}
                        </div>
                        {/* Barra + cifras */}
                        {totalMeta > 0 && (
                          <div className="space-y-1.5">
                            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barColor}`}
                                style={{width: Math.min(pct || 0, 100) + '%'}} />
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500">Meta <span className="text-white font-semibold">${totalMeta.toLocaleString('es-CO')}</span></span>
                              <span className="text-zinc-500">Venta <span className={totalVenta > 0 ? `font-semibold ${pctColor}` : 'text-zinc-600'}>${totalVenta.toLocaleString('es-CO')}</span></span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                <div className="p-2 space-y-2">
                  {[1,2,3,4,5,6,0].map((diaNum) => {
                    const dia = DIAS[diaNum]
                    const rutaDia = rutasEmp.find(r => r.diaSemana === diaNum)
                    const esOculto = rutaDia ? !esDiaAbierto(emp.id, diaNum) : true
                    const metaTotal = rutaDia ? rutaDia.clientes.reduce((a: number, rc: any) => a + (rc.metaVenta || 0), 0) : 0
                                        const logradoTotal = rutaDia ? rutaDia.clientes.reduce((a: number, rc: any) => a + (ventasMes[rc.clienteId]?.[mesActual]?.totalVenta || ventasHoy[rc.clienteId] || 0), 0) : 0
                    const pctTotal = metaTotal > 0 ? Math.round((logradoTotal / metaTotal) * 100) : null
                    return (
                      <div key={diaNum} className={rutaDia ? 'bg-zinc-800/60 border border-blue-500/40 rounded-2xl overflow-hidden' : 'rounded-xl'}>
                        {/* Header del día — tap para colapsar */}
                        <div
                          className={"flex items-center gap-3 px-3 py-2.5 " + (rutaDia ? 'cursor-pointer hover:bg-zinc-700/30 transition-colors' : '')}
                          onClick={() => rutaDia && abrirDiaAcordeon(emp.id, diaNum)}>
                          {/* Día */}
                          <span className={"text-sm font-bold w-[72px] flex-shrink-0 " + (rutaDia ? 'text-white' : 'text-zinc-600')}>{dia}</span>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            {rutaDia ? (
                              <div className="flex items-center gap-2 flex-wrap">

                              </div>
                            ) : (
                              <span className="text-zinc-600 text-xs">Sin asignar</span>
                            )}
                          </div>
                          {/* Acciones */}
                          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            {rutaDia ? (
                              <>
                                {esImpulsadora && (
                                  <button onClick={(e) => { e.stopPropagation(); setModalVerRuta({emp, dia: diaNum, ruta: rutaDia}) }}
                                    className="text-zinc-400 text-xs bg-zinc-700/60 hover:bg-zinc-600 px-2.5 py-1 rounded-lg transition-colors">Ver</button>
                                )}
                                <span className="text-zinc-600 text-xs">{esOculto ? '▶' : '▼'}</span>
                              </>
                            ) : !esImpulsadora && puedeAsignar ? (
                              <button onClick={() => abrirDia(emp, diaNum)}
                                className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">+ Asignar</button>
                            ) : null}
                          </div>
                        </div>
                        {/* Barra progreso total del día */}
                        {rutaDia && metaTotal > 0 && logradoTotal > 0 && (
                          <div className="px-3 pb-2">
                            <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${pctTotal! >= 100 ? 'bg-blue-500' : pctTotal! >= 70 ? 'bg-cyan-500' : pctTotal! >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{width: Math.min(pctTotal! || 0, 100) + '%'}} />
                            </div>
                          </div>
                        )}
                        {/* Lista clientes */}
                        {rutaDia && !esOculto && (
                          <div className="px-2 pb-2 space-y-1">
                            {rutaDia.clientes.map((rc: any, i: number) => {
                              const ventaMesActual = ventasMes[rc.clienteId]?.[mesActual]?.totalVenta || 0
                              const logrado = ventaMesActual || ventasHoy[rc.clienteId] || 0
                              const pct = rc.metaVenta > 0 ? Math.round((logrado / rc.metaVenta) * 100) : null
                              const esRep = clientesRepetidos.has(rc.clienteId) && clientesPrimerDia[rc.clienteId] !== diaNum
                              const bCol = pct === null ? 'bg-zinc-600' : pct >= 100 ? 'bg-blue-500' : pct >= 70 ? 'bg-cyan-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                              return (
                                <div key={rc.id} className="rounded-xl px-3 py-2.5 space-y-1" style={{background:"#000000",border:"1px solid rgba(59,130,246,0.45)"}}>
                                  {/* Nombre + GPS — toque para expandir acciones */}
                                  <div className="flex items-center gap-2 cursor-pointer active:opacity-70"
                                    onClick={() => setExpandedCliente(expandedCliente === rc.id ? null : rc.id)}>
                                    <p className="text-white text-sm font-semibold flex-1 min-w-0 truncate">{rc.cliente.nombre}</p>
                                    {(rc.cliente.ubicacionReal || rc.cliente.latTmp) && <span className={`text-sm flex-shrink-0 ${rc.cliente.ubicacionReal ? "" : "opacity-50"}`}>📍</span>}
                                  </div>
                                  {/* Meta · Venta · % */}
                                  <div className="grid gap-x-2" style={{gridTemplateColumns: rc.metaVenta > 0 ? '1fr 1fr auto' : '1fr auto'}}>
                                    {rc.metaVenta > 0 && (
                                      <div className="min-w-0">
                                        <p className="text-zinc-500 text-xs">Meta</p>
                                        <p className={`text-white text-sm font-bold truncate ${esRep ? 'line-through decoration-zinc-500 text-zinc-500' : ''}`}>${rc.metaVenta.toLocaleString('es-CO')}</p>
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-zinc-500 text-xs">Venta</p>
                                      <p className={`text-sm font-bold truncate ${esRep ? 'line-through decoration-zinc-500 text-zinc-500' : (logrado > 0 ? 'text-emerald-400' : 'text-zinc-600')}`}>${logrado.toLocaleString('es-CO')}</p>
                                    </div>
                                    {pct !== null && (
                                      <div className="flex items-end pb-0.5">
                                        <span className={`text-sm font-bold ${esRep ? 'line-through decoration-zinc-500 text-zinc-500' : (pct >= 100 ? 'text-blue-400' : pct >= 70 ? 'text-cyan-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400')}`}>{pct}%</span>
                                      </div>
                                    )}
                                  </div>
                                  {/* Histórico 3 meses — colapsable */}
                                  {expandedCliente === rc.id && (() => {
                                    const cliMeses = ventasMes[rc.clienteId]
                                    if (!cliMeses || Object.keys(cliMeses).length === 0) return null
                                    const ahora = new Date(Date.now() - 5*60*60*1000)
                                    const meses3 = [0,1,2].map(i => {
                                      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
                                      return d.toISOString().slice(0,7)
                                    })
                                    const tieneDatos = meses3.some(m => cliMeses[m]?.totalVenta > 0)
                                    if (!tieneDatos) return null
                                    return (
                                      <div className="flex gap-3 flex-wrap pt-0.5">
                                        {meses3.map((mes, idx) => {
                                          const dato = cliMeses[mes]
                                          if (!dato || dato.totalVenta === 0) return null
                                          const label = idx === 0 ? 'Este mes' : idx === 1 ? 'Mes ant.' : 'Hace 2m'
                                          return (
                                            <div key={mes} className="text-xs text-zinc-500">
                                              {label} <span className={idx === 0 ? 'text-blue-400 font-semibold' : 'text-zinc-400'}>${dato.totalVenta.toLocaleString('es-CO', {maximumFractionDigits:0})}</span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )
                                  })()}
                                  {/* Acciones inline colapsables */}
                                  {expandedCliente === rc.id && (!esImpulsadora && puedeAsignar) && (
                                    <div className="flex gap-2 pt-1.5 border-t border-zinc-800/40 mt-1">
                                      <button
                                        onClick={() => { setModalMeta({ id: rc.clienteId, nombre: rc.cliente.nombre, rutaFijaId: rutaDia.id }); setInputMeta(rc.metaVenta ? String(rc.metaVenta) : ''); setPromedio(null); setExpandedCliente(null) }}
                                        className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-1 text-xs transition-colors flex items-center justify-center gap-1">
                                        <span className="text-[11px]">✏️</span> Editar meta
                                      </button>
                                      <button
                                        onClick={() => { abrirDia(emp, diaNum, rutaDia); setExpandedCliente(null) }}
                                        className="flex-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg py-1 text-xs transition-colors flex items-center justify-center gap-1 border border-blue-500/20">
                                        <span className="text-[11px]">＋</span> Agregar
                                      </button>
                                      <button
                                        onClick={() => { quitarClienteDia(rutaDia.id, rc.clienteId); setExpandedCliente(null) }}
                                        className="flex-1 bg-transparent hover:bg-red-500/10 text-red-400/70 hover:text-red-400 rounded-lg py-1 text-xs transition-colors flex items-center justify-center gap-1 border border-zinc-800 hover:border-red-500/20">
                                        <span className="text-[11px]">🗑️</span> Quitar
                                      </button>
                                    </div>
                                  )}
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
          })}
          {empleadosFiltrados.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
              <p className="text-zinc-400 text-sm">No hay impulsadoras configuradas</p>
            </div>
          )}
        </div>
      )}
      {modal && empSeleccionado && (
        <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-50 p-4 pt-[5vh]">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden flex flex-col" style={{maxHeight: "88vh"}}>
            <div className="px-5 pt-5 pb-3 border-b border-zinc-800 flex-shrink-0">
              <h3 className="text-white font-bold">{empSeleccionado.nombre} - {DIAS[diaSemana]}</h3>
              <p className="text-zinc-500 text-xs mt-0.5">{cliSeleccionados.length} clientes seleccionados</p>
<p className="text-zinc-600 text-[10px] mt-1">📎 tiene GPS confirmado</p>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {cliSeleccionados.length > 0 && (
                <div className="space-y-2">
                  <p className="text-zinc-400 text-xs font-semibold">SELECCIONADOS</p>
                  {[...cliSeleccionados].sort((a,b) => (metas[b]||0) - (metas[a]||0)).map((cid, idx) => {
                    const cli: any = clientes.find((x: any) => x.id === cid)
                      || rutasFijas.flatMap((r: any) => r.clientes || []).find((rc: any) => rc.clienteId === cid)?.cliente
                      || { id: cid, nombre: cid.startsWith('cm') || cid.length > 24 ? 'Cargando...' : cid }
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
                  className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
                <div className="space-y-1.5">
                  {clientes.filter((c: any) => !cliSeleccionados.includes(c.id)).map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 bg-zinc-800 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {(c.ubicacionReal || c.latTmp) && <span className={`text-xs flex-shrink-0 ${c.ubicacionReal ? "" : "opacity-50"}`}>📍</span>}
                          <p className="text-white text-sm truncate">{c.nombre}</p>
                        </div>
                        {c.nombreComercial && <p className="text-zinc-500 text-xs ml-5">{c.nombreComercial}</p>}
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
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="text-white font-bold">Meta mensual</h3>
              <p className="text-zinc-400 text-sm">{modalMeta.nombre}</p>
            </div>

            {/* Promedio */}
            {promedio ? (
              promedio.promedio ? (
                <div className="rounded-xl px-4 py-3 space-y-0.5" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}}>
                  <p className="text-zinc-400 text-xs">Promedio mensual (últimos {promedio.meses} {promedio.meses === 1 ? 'mes' : 'meses'})</p>
                  <p className="text-emerald-400 font-bold text-base">${promedio.promedio.toLocaleString('es-CO')}</p>
                  <p className="text-zinc-600 text-[10px]">{promedio.cantidadVisitas} visitas registradas</p>
                </div>
              ) : (
                <p className="text-zinc-500 text-xs">Sin historial de ventas en los últimos 3 meses</p>
              )
            ) : (
              <button onClick={() => calcularPromedio(modalMeta.id)} disabled={calculandoPromedio}
                className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 border border-zinc-700 text-zinc-300 text-sm py-2.5 rounded-xl transition-colors">
                {calculandoPromedio ? (
                  <><span className="animate-spin">⏳</span> Calculando...</>
                ) : (
                  <><span>📊</span> Calcular promedio</>
                )}
              </button>
            )}

            <input type="text" inputMode="numeric"
              value={inputMeta ? Number(inputMeta).toLocaleString('es-CO') : ''}
              onChange={e => setInputMeta(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Ej: 500.000"
              autoFocus
              className="w-full bg-zinc-800 border border-emerald-500 rounded-xl px-4 py-3 text-white text-lg outline-none" />
            <div className="flex gap-2">
              <button onClick={() => { setModalMeta(null); setInputMeta(''); setPromedio(null) }}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button disabled={!inputMeta || Number(inputMeta) <= 0}
                onClick={async () => {
                  const meta = Number(inputMeta)
                  setMetas(m => ({ ...m, [modalMeta.id]: meta }))
                  if (!cliSeleccionados.includes(modalMeta.id)) setCliSeleccionados(p => [...p, modalMeta.id])
                  await fetch('/api/clientes/' + modalMeta.id + '/meta', {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ metaVenta: meta })
                  }).catch(() => {})
                  // Si edita meta del dia especifico (chip o bottomSheet), persistir en RutaFijaCliente
                  if (modalMeta.rutaFijaId) {
                    await fetch('/api/rutas-fijas/meta-cliente', {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rutaFijaId: modalMeta.rutaFijaId, clienteId: modalMeta.id, metaVenta: meta })
                    }).catch(() => {})
                    await loadData()
                  }
                  setModalMeta(null)
                  setInputMeta('')
                  setPromedio(null)
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
                {cliSeleccionados.includes(modalMeta.id) ? 'Actualizar' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalGestion && gestionPunto && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Registrar gestion</h3>
              <button onClick={() => setModalGestion(false)} className="text-zinc-500 hover:text-white">x</button>
            </div>
            <div className="rounded-xl p-3" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}}>
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
              className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
            <textarea value={gestionNota} onChange={e => setGestionNota(e.target.value)}
              rows={2} placeholder="Nota opcional"
              className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none resize-none" style={{background:"rgba(30,32,48,0.98)",border:"1px solid rgba(59,130,246,0.20)"}} />
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

      {/* Bottom sheet acciones cliente */}
      {bottomSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setBottomSheet(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-5 space-y-3"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
            <p className="text-white font-semibold text-base">{bottomSheet.rc.cliente.nombre}</p>
            {bottomSheet.rc.metaVenta > 0 && (
              <p className="text-zinc-400 text-sm">Meta actual: <span className="text-white font-semibold">${bottomSheet.rc.metaVenta.toLocaleString('es-CO')}</span></p>
            )}
            <button
              onClick={() => {
                setModalMeta({ id: bottomSheet.rc.clienteId, nombre: bottomSheet.rc.cliente.nombre, rutaFijaId: bottomSheet.rutaId })
                setInputMeta(bottomSheet.rc.metaVenta ? String(bottomSheet.rc.metaVenta) : '')
                setPromedio(null)
                setBottomSheet(null)
              }}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl py-3 text-sm font-medium flex items-center gap-3 px-4 transition-colors">
              <span className="text-lg">✏️</span> Editar meta
            </button>
            <button
              onClick={() => {
                quitarClienteDia(bottomSheet.rutaId, bottomSheet.rc.clienteId)
                setBottomSheet(null)
              }}
              className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl py-3 text-sm font-medium flex items-center gap-3 px-4 transition-colors border border-red-500/20">
              <span className="text-lg">🗑️</span> Quitar de la ruta
            </button>
            <button onClick={() => setBottomSheet(null)}
              className="w-full text-zinc-500 py-2 text-sm">Cancelar</button>
          </div>
        </div>
      )}
      {/* Modal solo lectura para impulsadora */}
      {modalVerRuta && (
        <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-50 p-4 pt-[5vh]">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden flex flex-col" style={{maxHeight: "88vh"}}>
            <div className="px-5 pt-5 pb-3 border-b border-zinc-800 flex-shrink-0 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">{modalVerRuta.emp.nombre} — {DIAS[modalVerRuta.dia]}</h3>
                <p className="text-zinc-500 text-xs mt-0.5">{modalVerRuta.ruta.clientes.length} clientes</p>
              </div>
              <button onClick={() => setModalVerRuta(null)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {modalVerRuta.ruta.clientes.map((rc: any, i: number) => {
                                const logrado = ventasMes[rc.clienteId]?.[mesActual]?.totalVenta || ventasHoy[rc.clienteId] || 0
                const pct = rc.metaVenta > 0 ? Math.round((logrado / rc.metaVenta) * 100) : null
                return (
                  <div key={rc.id} className="bg-zinc-800 rounded-xl px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium flex-1 truncate">{rc.cliente.nombre}</p>
                      {(rc.cliente.ubicacionReal || rc.cliente.latTmp) && <span className={`text-[11px] ${rc.cliente.ubicacionReal ? "" : "opacity-50"}`}>📍</span>}
                    </div>
                    <div className="ml-6 flex items-center gap-3 flex-wrap text-xs">
                      {rc.metaVenta > 0 && (
                        <span className="text-zinc-400">Meta <span className="text-white font-semibold">${rc.metaVenta.toLocaleString('es-CO')}</span></span>
                      )}
                      <span className="text-zinc-400">Venta <span className={logrado > 0 ? 'text-emerald-400 font-semibold' : 'text-zinc-600 font-semibold'}>${logrado.toLocaleString('es-CO')}</span></span>
                      {pct !== null && (
                        <span className={`font-bold ${pct >= 100 ? 'text-emerald-400' : pct >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>{pct}%</span>
                      )}
                    </div>
                    {(() => {
                      const cliMeses = ventasMes[rc.clienteId]
                      if (!cliMeses || Object.keys(cliMeses).length === 0) return null
                      const ahora = new Date(Date.now() - 5*60*60*1000)
                      const meses3 = [0,1,2].map(i => {
                        const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
                        return d.toISOString().slice(0,7)
                      })
                      const tieneDatos = meses3.some(m => cliMeses[m]?.totalVenta > 0)
                      if (!tieneDatos) return null
                      return (
                        <div className="ml-6 flex gap-3 flex-wrap">
                          {meses3.map((mes, idx) => {
                            const dato = cliMeses[mes]
                            if (!dato || dato.totalVenta === 0) return null
                            const label = idx === 0 ? 'Este mes' : idx === 1 ? 'Mes ant.' : 'Hace 2m'
                            return (
                              <div key={mes} className="text-[11px] text-zinc-500">
                                {label} <span className={idx === 0 ? 'text-blue-400 font-semibold' : 'text-zinc-300'}>${dato.totalVenta.toLocaleString('es-CO', {maximumFractionDigits:0})}</span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex-shrink-0">
              <button onClick={() => setModalVerRuta(null)}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
