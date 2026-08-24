'use client'
import dynamic from 'next/dynamic'
import TabsNav from '@/components/TabsNav'
import SelectorMes from '@/components/SelectorMes'
const CumplimientoTabla = dynamic(() => import('@/components/CumplimientoTabla'), { ssr: false })
import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { checkPermiso } from '@/lib/permisos'
import TuAgentXOverlay from '@/components/TuAgentXOverlay'

import { DIAS } from '@/lib/constants'
import { distanciaMetros } from '@/lib/gps'

// Día de la semana en Bogotá, correcto sin importar el TZ del navegador/dispositivo.
// NUNCA usar new Date(Date.now() - 5h).getDay() — .getDay() interpreta con el TZ del
// entorno, y si el dispositivo ya está en hora Bogotá nativa, esa resta sobre-corrige
// y retrocede un día entero (bug real detectado 24/06).
// Convierte "HH:mm" (24h, formato interno guardado en BD) a {hora12, minuto, meridiano} para mostrar en UI
function de24aPartes12(hhmm: string): { hora: string; minuto: string; meridiano: 'AM' | 'PM' } {
  if (!hhmm) return { hora: '', minuto: '', meridiano: 'AM' }
  const [h, m] = hhmm.split(':').map(Number)
  const meridiano: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM'
  let hora12 = h % 12
  if (hora12 === 0) hora12 = 12
  return { hora: String(hora12), minuto: String(m).padStart(2, '0'), meridiano }
}

// Formatea "HH:mm" (24h, formato guardado en BD) a texto legible 12h con AM/PM, ej. "9:00 AM"
function fmtHora12(hhmm: string): string {
  if (!hhmm) return ''
  const p = de24aPartes12(hhmm)
  return `${p.hora}:${p.minuto} ${p.meridiano}`
}

// Convierte hora12 (1-12) + minuto + meridiano a "HH:mm" 24h para guardar
function partes12a24(hora12: string, minuto: string, meridiano: 'AM' | 'PM'): string {
  let h = parseInt(hora12, 10)
  if (isNaN(h) || h < 1 || h > 12) return ''
  const m = parseInt(minuto, 10) || 0
  if (meridiano === 'AM') { if (h === 12) h = 0 } else { if (h !== 12) h += 12 }
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

function diaSemanaHoyBogota(): number {
  const nombreDia = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Bogota' })
  const idx = DIAS.findIndex(d => d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
    ({ Sunday:'domingo', Monday:'lunes', Tuesday:'martes', Wednesday:'miercoles', Thursday:'jueves', Friday:'viernes', Saturday:'sabado' } as any)[nombreDia])
  return idx >= 0 ? idx : new Date().getDay()
}

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
  const [horas, setHoras] = useState<Record<string, string>>({})
  const [horaInputTmp, setHoraInputTmp] = useState<{ hora: string; minuto: string; meridiano: 'AM' | 'PM' }>({ hora: '', minuto: '', meridiano: 'AM' })
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
  const [diasAbiertosEmp, setDiasAbiertosEmp] = useState<Record<string, Set<number>>>({})
  const [tab, setTab] = useState<'rutas'|'reporte'|'sugeridos'|'rotacion'|'eventos'>('reporte')
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
  const LIMIT_CLI = 10
  const esImpulsadora = user?.role === 'impulsadora'
  const esVendedor = user?.role === 'vendedor'
  const esAdmin = user?.role === 'empresa'
  const esSupervisor = user?.role === 'supervisor'
  const puedeAsignar = esAdmin || !esSupervisor || checkPermiso(session, 'asignarRutas')
  const puedeEditarImpulsos = esAdmin || !esSupervisor || checkPermiso(session, 'editarImpulsos')

  useEffect(() => { loadData() }, [])

  // Sincroniza el input temporal de hora (12h, partes separadas) cada vez que se abre el modal de meta
  useEffect(() => {
    if (modalMeta) {
      setHoraInputTmp(de24aPartes12(horas[modalMeta.id] || ''))
    }
  }, [modalMeta])

  useEffect(() => {
    if (!user?.id || !empleados.length) return
    // cumplimiento tab removed
  }, [user?.id, empleados.length, tab])
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
      fetch('/api/impulsadora').then(r => r.json()),
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

  function abrirDiaAcordeon(empId: string, diaNum: number) {
    setDiasAbiertosEmp(prev => {
      const hoyBogota = diaSemanaHoyBogota()
      // Si nunca se ha tocado nada para este empleado, partir del estado implícito (solo hoy abierto)
      const setActual = new Set(prev[empId] || [hoyBogota])
      if (setActual.has(diaNum)) setActual.delete(diaNum)
      else setActual.add(diaNum)
      return { ...prev, [empId]: setActual }
    })
  }
  function esDiaAbierto(empId: string, diaNum: number) {
    const setActual = diasAbiertosEmp[empId]
    const hoyBogota = diaSemanaHoyBogota() // 0=domingo..6=sabado, coincide con diaSemana
    if (setActual === undefined) return diaNum === hoyBogota
    return setActual.has(diaNum)
  }
  function rutasDeEmpleado(empId: string) {
    return rutasFijas.filter(r => r.empleados.some((re: any) => re.empleadoId === empId))
  }
  function abrirDia(emp: any, dia: number, rutaExistente?: any) {
    setEmpSeleccionado(emp)
    setDiaSemana(dia)
    setCliSeleccionados(rutaExistente ? rutaExistente.clientes.map((c: any) => c.clienteId) : [])
    const metasIniciales: Record<string, number> = {}
    const horasIniciales: Record<string, string> = {}
    if (rutaExistente) {
      rutaExistente.clientes.forEach((c: any) => {
        if (c.metaVenta) metasIniciales[c.clienteId] = c.metaVenta
        if (c.horaEntrada) horasIniciales[c.clienteId] = c.horaEntrada
      })
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
    setHoras(horasIniciales)
    setBuscarCli('')
    setModal(true)
  }
  async function guardar() {
    setLoading(true)
    await fetch('/api/impulsadora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diaSemana, empleadoIds: [empSeleccionado.id], clienteIds: cliSeleccionados, metas, horas })
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
    await fetch('/api/impulsadora', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rutaId }) })
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
      await fetch('/api/impulsadora', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rutaId }) })
    } else {
      await fetch('/api/impulsadora', {
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
  function cambiarTab(t: typeof tab) { if (t !== tab) setTab(t) }

  return (
    <div className="space-y-3 max-w-7xl mx-auto">
<div className="tab-pills rounded-xl p-1" style={{display:'flex',gap:4,overflowX:'auto',scrollbarWidth:'none'}}>
          <button onClick={() => cambiarTab('reporte')} className={`py-2 px-4 text-sm font-semibold transition-colors text-center whitespace-nowrap ${tab === 'reporte' ? 'tab-active' : 'text-white hover:text-white'}`}>Reporte</button>
          <button onClick={() => cambiarTab('rutas')} className={`py-2 px-4 text-sm font-semibold transition-colors text-center whitespace-nowrap ${tab === 'rutas' ? 'tab-active' : 'text-white hover:text-white'}`}>Rutero</button>
          {esVendedor && <button onClick={() => cambiarTab('sugeridos')} className={`py-2 px-4 text-sm font-semibold transition-colors text-center whitespace-nowrap ${tab === 'sugeridos' ? 'tab-active' : 'text-white hover:text-white'}`}>Sugeridos</button>}
          {(esVendedor || esAdmin || esSupervisor) && <button onClick={() => cambiarTab('rotacion')} className={`py-2 px-4 text-sm font-semibold transition-colors text-center whitespace-nowrap ${tab === 'rotacion' ? 'tab-active' : 'text-white hover:text-white'}`}>Rotación</button>}
          {(esVendedor || esAdmin || esSupervisor) && <button onClick={() => cambiarTab('eventos')} className={`py-2 px-4 text-sm font-semibold transition-colors text-center whitespace-nowrap ${tab === 'eventos' ? 'tab-active' : 'text-white hover:text-white'}`}>Eventos</button>}
        </div>

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
              <div key={emp.id} className="rounded-2xl overflow-hidden" style={{background:"rgba(30,36,58,0.99)",border:"1px solid rgba(59,130,246,0.35)"}}>
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
                      <div className="p-4 border-b border-zinc-800 space-y-2">
                        {/* Nombre + barra inline */}
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-zinc-700 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-sm">{emp.nombre[0]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold truncate">{emp.nombre}</p>
                            {totalMeta > 0 ? (
                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                                <div className={`h-full rounded-full transition-all ${barColor}`}
                                  style={{width: Math.min(pct || 0, 100) + '%'}} />
                              </div>
                            ) : (
                              <p className="text-zinc-500 text-xs">{rutasEmp.length} {rutasEmp.length === 1 ? 'día configurado' : 'días configurados'}</p>
                            )}
                          </div>
                          {pct !== null && (
                            <span className={`text-base font-bold flex-shrink-0 ${pctColor}`}>{pct}%</span>
                          )}
                        </div>
                        {/* Cifras */}
                        {totalMeta > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Meta <span className="text-white font-bold">${totalMeta.toLocaleString('es-CO')}</span></span>
                            <span className="text-zinc-500">Venta <span className={totalVenta > 0 ? `font-bold ${pctColor}` : 'text-zinc-600'}>${totalVenta.toLocaleString('es-CO')}</span></span>
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
                    const metaTotal = rutaDia ? (() => {
                      const seen = new Set<string>()
                      return rutaDia.clientes.reduce((a: number, rc: any) => {
                        if (seen.has(rc.clienteId)) return a
                        seen.add(rc.clienteId)
                        return a + (rc.metaVenta || 0)
                      }, 0)
                    })() : 0
                    const logradoTotal = rutaDia ? (() => {
                      const seen = new Set<string>()
                      return rutaDia.clientes.reduce((a: number, rc: any) => {
                        if (seen.has(rc.clienteId)) return a
                        seen.add(rc.clienteId)
                        return a + (ventasMes[rc.clienteId]?.[mesActual]?.totalVenta || ventasHoy[rc.clienteId] || 0)
                      }, 0)
                    })() : 0
                    const pctTotal = metaTotal > 0 ? Math.round((logradoTotal / metaTotal) * 100) : null
                    return (
                      <div key={diaNum} className="border border-blue-500/40 rounded-xl overflow-hidden" style={{background:'#060a24'}}>
                        {/* Header del día — tap para colapsar */}
                        <div
                          className={"flex items-center gap-3 px-3 py-2.5 " + (rutaDia ? 'cursor-pointer hover:bg-zinc-700/30 transition-colors' : '')}
                          onClick={() => rutaDia && abrirDiaAcordeon(emp.id, diaNum)}>
                          {/* Día */}
                          <span className={"text-sm font-bold w-[72px] flex-shrink-0 " + (rutaDia ? 'text-white' : 'text-zinc-600')}>{dia}</span>
                          {/* Barra progreso — inline junto al día */}
                          {rutaDia && metaTotal > 0 ? (
                            <div className="flex-1 min-w-0 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${pctTotal! >= 100 ? 'bg-blue-500' : pctTotal! >= 70 ? 'bg-cyan-500' : pctTotal! >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{width: Math.min(pctTotal! || 0, 100) + '%'}} />
                            </div>
                          ) : (
                            <div className="flex-1" />
                          )}
                          {/* Acciones */}
                          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            {rutaDia ? (
                              <>
                                {esImpulsadora && (
                                  <button onClick={(e) => { e.stopPropagation(); setModalVerRuta({emp, dia: diaNum, ruta: rutaDia}) }}
                                    className="text-zinc-400 text-xs bg-zinc-700/60 hover:bg-zinc-600 px-2.5 py-1 rounded-lg transition-colors">Ver</button>
                                )}
                                {!esImpulsadora && puedeAsignar && puedeEditarImpulsos && (
                                  <button onClick={(e) => { e.stopPropagation(); abrirDia(emp, diaNum, rutaDia) }}
                                    title="Editar día"
                                    className="text-zinc-400 hover:text-white text-xs px-1.5 py-1 rounded-lg transition-colors">✏️</button>
                                )}
                              </>
                            ) : !esImpulsadora && puedeAsignar && puedeEditarImpulsos ? (
                              <button onClick={() => abrirDia(emp, diaNum)}
                                className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">+ Asignar</button>
                            ) : null}
                          </div>
                        </div>
                        {/* Lista clientes */}
                        {rutaDia && !esOculto && (
                          <div className="px-2 pb-2 space-y-1">
                            {rutaDia.clientes.map((rc: any, i: number) => {
                              const ventaMesActual = ventasMes[rc.clienteId]?.[mesActual]?.totalVenta || 0
                              const logrado = ventaMesActual || ventasHoy[rc.clienteId] || 0
                              const pct = rc.metaVenta > 0 ? Math.round((logrado / rc.metaVenta) * 100) : null
                              // Duplicado si: ya apareció en otro día O ya apareció antes en este mismo día
                              const aparicionesEnEsteDia = rutaDia.clientes.slice(0, i).filter((x: any) => x.clienteId === rc.clienteId).length
                              const esRep = aparicionesEnEsteDia > 0 || (clientesRepetidos.has(rc.clienteId) && clientesPrimerDia[rc.clienteId] !== diaNum)
                              const bCol = pct === null ? 'bg-zinc-600' : pct >= 100 ? 'bg-blue-500' : pct >= 70 ? 'bg-cyan-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                              return (
                                <div key={rc.id} className="rounded-xl px-3 py-2.5 space-y-1" style={{background:"#060a24",border:"1px solid rgba(59,130,246,0.35)"}}>
                                  {/* Nombre + GPS — toque para expandir acciones */}
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 cursor-pointer active:opacity-70 flex-1 min-w-0"
                                      onClick={() => setExpandedCliente(expandedCliente === rc.id ? null : rc.id)}>
                                      <p className="text-white text-xs font-semibold flex-1 min-w-0 truncate">{rc.cliente.nombre}</p>
                                      {rc.horaEntrada && <span className="text-amber-400 text-[11px] font-semibold flex-shrink-0">🕐 {fmtHora12(rc.horaEntrada)}</span>}
                                    </div>
                                    {(rc.cliente.ubicacionReal || rc.cliente.latTmp) && rc.cliente.lat && rc.cliente.lng && <a href={`https://www.google.com/maps?q=${rc.cliente.lat},${rc.cliente.lng}`} target="_blank" rel="noopener noreferrer" className={`text-sm flex-shrink-0 ${rc.cliente.ubicacionReal ? "" : "opacity-50"}`}>📍</a>}
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
                                    // "YYYY-MM" de hoy en Bogotá vía timeZone explícito, inmune al TZ del navegador
                                    const [anioAhora, mesAhora] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).split('-').map(Number)
                                    const meses3 = [0,1,2].map(i => {
                                      const d = new Date(anioAhora, mesAhora - 1 - i, 1)
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
<p className="text-zinc-600 text-[10px] mt-1">📍 tiene GPS confirmado</p>
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
                      <div key={cid} className="bg-zinc-800 rounded-xl px-3 py-2.5 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs w-4 flex-shrink-0">{idx+1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{cli.nombre}</p>
                            {cli.nombreComercial && <p className="text-zinc-500 text-xs">{cli.nombreComercial}</p>}
                          </div>
                          {puedeEditarImpulsos && <button onClick={() => { setModalMeta({id: cid, nombre: cli.nombre}); setInputMeta(meta > 0 ? String(meta) : '') }}
                            title="Editar meta y hora"
                            className="text-zinc-400 hover:text-white text-sm flex-shrink-0 px-1">✏️</button>}
                          {puedeEditarImpulsos && <button onClick={() => { setCliSeleccionados(p => p.filter(x => x !== cid)); setMetas(m => { const n={...m}; delete n[cid]; return n }); setHoras(h => { const n={...h}; delete n[cid]; return n }) }}
                            title="Quitar cliente"
                            className="text-zinc-500 hover:text-red-400 text-sm flex-shrink-0 px-1">🗑️</button>}
                        </div>
                        {(meta > 0 || horas[cid]) && (
                          <div className="flex items-center gap-3 pl-6">
                            {meta > 0 && <span className="text-yellow-400 text-xs">${Number(meta).toLocaleString('es-CO')}</span>}
                            {horas[cid] && <span className="text-amber-400 text-xs">🕐 {fmtHora12(horas[cid])}</span>}
                          </div>
                        )}
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
                  className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
                <div className="space-y-1.5">
                  {clientes.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 bg-zinc-800 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {(c.ubicacionReal || c.latTmp) && c.lat && c.lng && <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer" className={`text-xs flex-shrink-0 ${c.ubicacionReal ? "" : "opacity-50"}`} onClick={e => e.stopPropagation()}>📍</a>}
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
        <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-[60] p-4" style={{paddingTop:'8vh'}}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="text-white font-bold">Meta mensual</h3>
              <p className="text-zinc-400 text-sm">{modalMeta.nombre}</p>
            </div>

            {/* Promedio */}
            {promedio ? (
              promedio.promedio ? (
                <div className="rounded-xl px-4 py-3 space-y-0.5" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}}>
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

            <div className="flex items-stretch gap-2">
              <div className="w-1/2 min-w-0">
                <p className="text-zinc-400 text-xs mb-1">Meta</p>
                <input type="text" inputMode="numeric"
                  value={inputMeta ? Number(inputMeta).toLocaleString('es-CO') : ''}
                  onChange={e => setInputMeta(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Ej: 500.000"
                  autoFocus
                  className="w-full h-12 bg-zinc-800 border border-emerald-500 rounded-xl px-3 text-white text-base outline-none" />
              </div>
              <div className="w-1/2 min-w-0">
                <p className="text-zinc-400 text-xs mb-1">Hora</p>
                {(() => {
                  const sincronizar = (hora: string, minuto: string, meridiano: 'AM' | 'PM') => {
                    const nueva = partes12a24(hora, minuto, meridiano)
                    if (nueva) setHoras(h => ({ ...h, [modalMeta.id]: nueva }))
                  }
                  return (
                    <div className="flex items-stretch gap-1 w-full">
                      <div className="flex items-center justify-center gap-0.5 h-12 bg-zinc-800 border border-zinc-700 rounded-xl px-1.5 flex-1 min-w-0 focus-within:border-blue-500">
                        <input type="text" inputMode="numeric" placeholder="--" maxLength={2}
                          value={horaInputTmp.hora}
                          onChange={e => {
                            const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                            setHoraInputTmp(t => ({ ...t, hora: v }))
                          }}
                          onBlur={e => {
                            let v = parseInt(e.target.value, 10)
                            if (isNaN(v) || v < 1) v = 1
                            if (v > 12) v = 12
                            const horaStr = String(v)
                            setHoraInputTmp(t => ({ ...t, hora: horaStr }))
                            sincronizar(horaStr, horaInputTmp.minuto || '00', horaInputTmp.meridiano)
                          }}
                          className="w-7 text-center bg-transparent text-white text-base font-semibold outline-none" />
                        <span className="text-zinc-500 text-base font-semibold">:</span>
                        <input type="text" inputMode="numeric" placeholder="--" maxLength={2}
                          value={horaInputTmp.minuto}
                          onChange={e => {
                            const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                            setHoraInputTmp(t => ({ ...t, minuto: v }))
                          }}
                          onBlur={e => {
                            let v = parseInt(e.target.value, 10)
                            if (isNaN(v) || v < 0) v = 0
                            if (v > 59) v = 59
                            const minutoStr = String(v).padStart(2, '0')
                            setHoraInputTmp(t => ({ ...t, minuto: minutoStr }))
                            sincronizar(horaInputTmp.hora || '12', minutoStr, horaInputTmp.meridiano)
                          }}
                          className="w-7 text-center bg-transparent text-white text-base font-semibold outline-none" />
                      </div>
                      <div className="flex flex-col h-12 rounded-xl border border-zinc-700 overflow-hidden flex-shrink-0">
                        {(['AM', 'PM'] as const).map(mer => (
                          <button key={mer} type="button"
                            onClick={() => {
                              setHoraInputTmp(t => ({ ...t, meridiano: mer }))
                              sincronizar(horaInputTmp.hora || '12', horaInputTmp.minuto || '00', mer)
                            }}
                            className={"flex-1 px-2 text-[10px] font-semibold leading-tight transition-colors flex items-center justify-center " + (horaInputTmp.meridiano === mer && horas[modalMeta.id] ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300")}>
                            {mer}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setModalMeta(null); setInputMeta(''); setPromedio(null) }}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button disabled={(!inputMeta || Number(inputMeta) <= 0) && !horas[modalMeta.id]}
                onClick={async () => {
                  const tieneMeta = !!inputMeta && Number(inputMeta) > 0
                  const meta = tieneMeta ? Number(inputMeta) : 0
                  const hora = horas[modalMeta.id] || ''
                  setMetas(m => ({ ...m, [modalMeta.id]: meta }))
                  if (!cliSeleccionados.includes(modalMeta.id)) setCliSeleccionados(p => [...p, modalMeta.id])
                  if (tieneMeta) {
                    await fetch('/api/clientes/' + modalMeta.id + '/meta', {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ metaVenta: meta })
                    }).catch(() => {})
                  }
                  // Si edita meta/hora del dia especifico (chip o bottomSheet), persistir en RutaFijaCliente
                  if (modalMeta.rutaFijaId) {
                    await fetch('/api/impulsadora/meta-cliente', {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rutaFijaId: modalMeta.rutaFijaId, clienteId: modalMeta.id, metaVenta: meta, horaEntrada: hora })
                    }).catch(() => {})
                    await loadData()
                  }
                  // Si es seleccion nueva (sin rutaFijaId aun), la hora viaja en el POST masivo de "Guardar"
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
            <div className="rounded-xl p-3" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}}>
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
              className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
            <textarea value={gestionNota} onChange={e => setGestionNota(e.target.value)}
              rows={2} placeholder="Nota opcional"
              className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none resize-none" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
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
            {puedeEditarImpulsos && <button
              onClick={() => {
                setModalMeta({ id: bottomSheet.rc.clienteId, nombre: bottomSheet.rc.cliente.nombre, rutaFijaId: bottomSheet.rutaId })
                setInputMeta(bottomSheet.rc.metaVenta ? String(bottomSheet.rc.metaVenta) : '')
                setPromedio(null)
                setBottomSheet(null)
              }}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl py-3 text-sm font-medium flex items-center gap-3 px-4 transition-colors">
              <span className="text-lg">✏️</span> Editar meta
            </button>}
            {puedeEditarImpulsos && <button
              onClick={() => {
                quitarClienteDia(bottomSheet.rutaId, bottomSheet.rc.clienteId)
                setBottomSheet(null)
              }}
              className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl py-3 text-sm font-medium flex items-center gap-3 px-4 transition-colors border border-red-500/20">
              <span className="text-lg">🗑️</span> Quitar de la ruta
            </button>}
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
                      {(rc.cliente.ubicacionReal || rc.cliente.latTmp) && rc.cliente.lat && rc.cliente.lng && <a href={`https://www.google.com/maps?q=${rc.cliente.lat},${rc.cliente.lng}`} target="_blank" rel="noopener noreferrer" className={`text-[11px] ${rc.cliente.ubicacionReal ? "" : "opacity-50"}`} onClick={e => e.stopPropagation()}>📍</a>}
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
                      // "YYYY-MM" de hoy en Bogotá vía timeZone explícito, inmune al TZ del navegador
                      const [anioAhora, mesAhora] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).split('-').map(Number)
                      const meses3 = [0,1,2].map(i => {
                        const d = new Date(anioAhora, mesAhora - 1 - i, 1)
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

      {tab === 'reporte' && <ReporteImpulsoTab />}
      {tab === 'sugeridos' && <GestionInventarioTab />}
      {tab === 'rotacion' && <RotacionTab />}
      {tab === 'eventos' && <EventosTab />}
    </div>
  )
}

function ReporteImpulsoTab() {
  const mesActual = new Date().toISOString().slice(0, 7)
  const [mesDesde, setMesDesde] = useState(mesActual)
  const [mesHasta, setMesHasta] = useState(mesActual)
  const [openDesde, setOpenDesde] = useState(false)
  const [openHasta, setOpenHasta] = useState(false)

  const meses = Array.from({length: 12}, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const valor = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('es-CO', {month:'long', year:'numeric', timeZone:'UTC'})
      .replace(' de ', ' ').replace(/^./, c => c.toUpperCase())
    return { valor, label }
  })

  // Meses válidos para "Hasta": desde mesDesde hasta máx 3 meses después (4 total)
  const mesesHasta = meses.filter(m => {
    if (m.valor < mesDesde) return false
    const [da, dm] = mesDesde.split('-').map(Number)
    const [ha, hm] = m.valor.split('-').map(Number)
    const diff = (ha - da) * 12 + (hm - dm)
    return diff <= 3
  })

  // Si mesHasta quedó fuera del rango válido, corregir
  useEffect(() => {
    if (!mesesHasta.find(m => m.valor === mesHasta)) {
      setMesHasta(mesesHasta[0]?.valor ?? mesDesde)
    }
  }, [mesDesde])

  const labelDesde = meses.find(m => m.valor === mesDesde)?.label ?? mesDesde
  const labelHasta = mesesHasta.find(m => m.valor === mesHasta)?.label ?? mesHasta
  const esRango = mesDesde !== mesHasta

  const abrirPDF = () => {
    const url = esRango
      ? `/pdf-impulso?fecha=${mesDesde}-01&hasta=${mesHasta}`
      : `/pdf-impulso?fecha=${mesDesde}-01`
    window.open(url, '_blank')
  }

  const dropdownStyle = (open: boolean): React.CSSProperties => ({
    position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:50,
    background:'#1e2030', border:'1px solid #1a3557', borderRadius:12,
    overflow:'hidden', minWidth:180, boxShadow:'0 8px 24px rgba(0,0,0,0.5)',
    display: open ? 'block' : 'none',
  })

  const btnMesStyle: React.CSSProperties = {
    display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
    background:'#1e2030', border:'1px solid #1a3557',
    borderRadius:12, padding:'8px 14px', color:'white',
    fontSize:14, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap',
    width:'100%',
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-zinc-400 text-sm">Metas y ventas de todas las impulsadoras</p>
        <div style={{display:'flex', alignItems:'center', gap:8, width:'100%'}}>
          {/* Desde */}
          <div style={{position:'relative', flex:1}}>
            <button onClick={() => { setOpenDesde(o => !o); setOpenHasta(false) }} style={btnMesStyle}>
              {labelDesde}
              <span style={{color:'#64748b', fontSize:11}}>{openDesde ? '▲' : '▼'}</span>
            </button>
            <div style={dropdownStyle(openDesde)}>
              {meses.map(m => (
                <button key={m.valor} onClick={() => { setMesDesde(m.valor); setOpenDesde(false) }}
                  style={{
                    display:'block', width:'100%', textAlign:'left',
                    padding:'9px 16px', fontSize:13, cursor:'pointer',
                    background: m.valor === mesDesde ? '#1d4ed8' : 'transparent',
                    color: m.valor === mesDesde ? 'white' : '#cbd5e1',
                    fontWeight: m.valor === mesDesde ? 700 : 400,
                    borderBottom:'1px solid #131c2e',
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hasta */}
          <div style={{position:'relative', flex:1}}>
            <button onClick={() => { setOpenHasta(o => !o); setOpenDesde(false) }} style={btnMesStyle}>
              {labelHasta}
              <span style={{color:'#64748b', fontSize:11}}>{openHasta ? '▲' : '▼'}</span>
            </button>
            <div style={dropdownStyle(openHasta)}>
              {mesesHasta.map(m => (
                <button key={m.valor} onClick={() => { setMesHasta(m.valor); setOpenHasta(false) }}
                  style={{
                    display:'block', width:'100%', textAlign:'left',
                    padding:'9px 16px', fontSize:13, cursor:'pointer',
                    background: m.valor === mesHasta ? '#1d4ed8' : 'transparent',
                    color: m.valor === mesHasta ? 'white' : '#cbd5e1',
                    fontWeight: m.valor === mesHasta ? 700 : 400,
                    borderBottom:'1px solid #131c2e',
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{alignSelf:'flex-end'}}>
            <button onClick={abrirPDF}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap">
              📄 PDF
            </button>
          </div>
        </div>
      </div>

      <ReporteImpulsoTabla mes={mesDesde} />
    </div>
  )
}

function ReporteImpulsoTabla({ mes }: { mes: string }) {
  const [datos, setDatos] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [tabDia, setTabDia] = useState<Record<string, number>>({})

  useEffect(() => {
    setLoading(true)
    fetch('/api/impulso/pdf?fecha=' + mes + '-01')
      .then(r => r.json())
      .then(d => { setDatos(d); setLoading(false) })
  }, [mes])

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
  const pctColor = (pct: number | null): React.CSSProperties =>
    pct === null ? {color:'#71717a'} : pct >= 80 ? {color:'#34d399'} : pct >= 50 ? {color:'#fbbf24'} : {color:'#f87171'}

  const BORDER = '1px solid #1e2a3d'
  const BORDER_DAY = '2px solid #1e3a5f'

  if (loading) return (
    <div className="p-4 space-y-4">
      <div className="shimmer h-10 w-2/3 rounded-xl mx-auto" />
      {Array.from({length: 4}).map((_,i) => <div key={i} className="shimmer rounded-2xl h-24" />)}
    </div>
  )
  if (!datos) return null

  return (
    <div className="space-y-6 w-full">
      <div className={`grid gap-4 ${datos.impulsadoras?.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}>
        {datos.impulsadoras?.map((imp: any) => {
          const diasConPuntos = (imp.semana || []).filter((d: any) => d.puntos?.length > 0)
          const diaActivo = tabDia[imp.id] ?? 0

          return (
            <div key={imp.id} style={{background:'#0d1220', border:'1px solid #1e2a3d', borderRadius:16, overflow:'hidden'}}>
              {/* Header impulsadora */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:BORDER,background:'#0a0f1a'}}>
                <span style={{color:'white',fontWeight:700,fontSize:15}}>{imp.nombre}</span>
                <span style={{fontSize:13,fontWeight:700,...pctColor(imp.pctTotal)}}>
                  {fmt(imp.totalMes)} / {fmt(imp.totalMeta)}
                  {imp.pctTotal !== null && <span style={{marginLeft:6}}>{imp.pctTotal}%</span>}
                </span>
              </div>

              {/* MÓVIL: misma tabla pc, scroll horizontal */}
              <div className="block md:hidden overflow-x-auto">
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:480}}>
                  <thead>
                    <tr style={{background:'#080d18'}}>
                      <th style={{...thSt, width:80, borderRight:BORDER_DAY}}>Día</th>
                      <th style={{...thSt, textAlign:'left'}}>Cliente</th>
                      <th style={{...thSt, textAlign:'right', width:120}}>Meta</th>
                      <th style={{...thSt, textAlign:'right', width:120}}>Ventas</th>
                      <th style={{...thSt, textAlign:'right', width:55}}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diasConPuntos.map((dia: any, dIdx: number) => {
                      const puntos = dia.puntos || []
                      return puntos.map((p: any, i: number) => (
                        <tr key={`${dIdx}-${i}`} style={{borderBottom:BORDER, background: dIdx%2===0?'#0d1220':'#0a0f1a'}}>
                          {i === 0 && (
                            <td rowSpan={puntos.length} style={{
                              padding:'8px 8px', textAlign:'center', verticalAlign:'middle',
                              fontWeight:700, fontSize:11, color:'#93c5fd', textTransform:'uppercase',
                              borderRight:BORDER_DAY,
                              borderBottom: dIdx < diasConPuntos.length-1 ? BORDER_DAY : BORDER,
                              whiteSpace:'nowrap', letterSpacing:'0.04em',
                              background: dIdx%2===0?'#0b1628':'#08101e',
                            }}>
                              {dia.nombre}
                            </td>
                          )}
                          <td style={{padding:'7px 10px', borderRight:BORDER}}>
                            <span style={{color:'white',fontWeight:500,display:'block'}}>{p.nombre}</span>
                            {p.nombreComercial && <span style={{color:'#64748b',fontSize:11,display:'block',marginTop:1}}>{p.nombreComercial}</span>}
                          </td>
                          <td style={{padding:'7px 10px', textAlign:'right', color:'#f59e0b', fontWeight:600, borderRight:BORDER, whiteSpace:'nowrap'}}>
                            {p.meta > 0 ? fmt(p.meta) : '—'}
                          </td>
                          <td style={{padding:'7px 10px', textAlign:'right', color:'#60a5fa', fontWeight:600, borderRight:BORDER, whiteSpace:'nowrap'}}>
                            {p.montoMes > 0 ? fmt(p.montoMes) : '—'}
                          </td>
                          <td style={{padding:'7px 10px', textAlign:'right', fontWeight:700, whiteSpace:'nowrap', ...pctColor(p.pct)}}>
                            {p.pct !== null ? p.pct + '%' : '—'}
                          </td>
                        </tr>
                      ))
                    })}
                  </tbody>
                </table>
              </div>

              {/* DESKTOP: tabla Excel con rowSpan por día */}
              <div className="hidden md:block overflow-x-auto">
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#080d18'}}>
                      <th style={{...thSt, width:90, borderRight:BORDER_DAY}}>Día</th>
                      <th style={{...thSt, textAlign:'left'}}>Cliente</th>
                      <th style={{...thSt, textAlign:'right', width:130}}>Meta</th>
                      <th style={{...thSt, textAlign:'right', width:130}}>Ventas</th>
                      <th style={{...thSt, textAlign:'right', width:60}}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diasConPuntos.map((dia: any, dIdx: number) => {
                      const puntos = dia.puntos || []
                      return puntos.map((p: any, i: number) => (
                        <tr key={`${dIdx}-${i}`} style={{borderBottom:BORDER, background: dIdx%2===0?'#0d1220':'#0a0f1a'}}>
                          {i === 0 && (
                            <td rowSpan={puntos.length} style={{
                              padding:'8px 10px', textAlign:'center', verticalAlign:'middle',
                              fontWeight:700, fontSize:11, color:'#93c5fd', textTransform:'uppercase',
                              borderRight:BORDER_DAY,
                              borderBottom: dIdx < diasConPuntos.length-1 ? BORDER_DAY : BORDER,
                              whiteSpace:'nowrap', letterSpacing:'0.05em',
                              background: dIdx%2===0?'#0b1628':'#08101e',
                            }}>
                              {dia.nombre}
                            </td>
                          )}
                          <td style={{padding:'7px 12px', borderRight:BORDER}}>
                            <span style={{color:'white',fontWeight:500,display:'block'}}>{p.nombre}</span>
                            {p.nombreComercial && <span style={{color:'#64748b',fontSize:11,display:'block',marginTop:1}}>{p.nombreComercial}</span>}
                          </td>
                          <td style={{padding:'7px 12px', textAlign:'right', color:'#f59e0b', fontWeight:600, borderRight:BORDER, whiteSpace:'nowrap'}}>
                            {p.meta > 0 ? fmt(p.meta) : '—'}
                          </td>
                          <td style={{padding:'7px 12px', textAlign:'right', color:'#60a5fa', fontWeight:600, borderRight:BORDER, whiteSpace:'nowrap'}}>
                            {p.montoMes > 0 ? fmt(p.montoMes) : '—'}
                          </td>
                          <td style={{padding:'7px 12px', textAlign:'right', fontWeight:700, whiteSpace:'nowrap', ...pctColor(p.pct)}}>
                            {p.pct !== null ? p.pct + '%' : '—'}
                          </td>
                        </tr>
                      ))
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const thSt: React.CSSProperties = {
  padding:'8px 12px', fontWeight:600, color:'#94a3b8', textTransform:'uppercase',
  fontSize:11, letterSpacing:'0.06em', borderBottom:'2px solid #1e2a3d', whiteSpace:'nowrap',
}

// ── Tab Rotación (vendedor) ───────────────────────────────────────────
function RotacionTab() {
  const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
  const fmtP = (n: number | null | undefined) => n == null ? '—' : '$' + priceFmt.format(n)

  const [snapshots, setSnapshots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/impulsar/rotacion-snapshots?dias=14')
      .then(r => r.json())
      .then(d => { setSnapshots(d.snapshots || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer h-16 rounded-xl" />)}
    </div>
  )

  if (snapshots.length === 0) return (
    <div className="rounded-2xl p-10 text-center" style={{ background: '#0d1220', border: '1px solid #131c2e' }}>
      <p className="text-zinc-500 text-sm">Sin reportes en los últimos 14 días</p>
    </div>
  )

  return (
    <div className="space-y-2">
      <p className="text-zinc-400 text-xs px-1">Rotación — últimos 14 días</p>
      {snapshots.map((snap: any) => {
        const montoTotal = snap.filas.reduce((acc: number, f: any) => {
          const cant = f.sugerido ?? 0
          const prv  = f.precioVenta ?? 0
          return acc + cant * prv
        }, 0)

        return (
          <div key={snap.key} className="rounded-xl overflow-hidden" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
            <button
              onClick={() => setExpandido(expandido === snap.key ? null : snap.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate">{snap.clienteNombre}</p>
                <p className="text-zinc-500 text-xs">{snap.impulsadoraNombre} · {snap.fecha}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <div className="text-right">
                  {montoTotal > 0 && <p className="text-blue-400 font-bold text-sm">{fmtP(montoTotal)}</p>}
                  <p className="text-zinc-500 text-xs">{snap.filas.length} productos</p>
                </div>
                <span className="text-zinc-500 text-sm">{expandido === snap.key ? '▲' : '▼'}</span>
              </div>
            </button>

            {expandido === snap.key && (
              <div className="border-t" style={{ borderColor: '#131c2e' }}>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ minWidth: 360, background: '#0a0f1a' }}>
                    <thead>
                      <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                        <th style={{ ...gThSt, textAlign: 'right', width: 70 }}>Cant.</th>
                        <th style={gThSt}>Producto</th>
                        <th style={{ ...gThSt, textAlign: 'right', width: 100 }}>Precio V.</th>
                        <th style={{ ...gThSt, textAlign: 'right', width: 100 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.filas.map((f: any, i: number) => {
                        const cant  = f.sugerido ?? 0
                        const prv   = f.precioVenta ?? null
                        const total = prv != null && cant > 0 ? cant * prv : null
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #0d1524', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>{cant || '—'}</td>
                            <td style={{ ...gTdSt, color: '#e2e8f0' }}>{f.productoNombre}</td>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#64748b' }}>{prv != null ? fmtP(prv) : '—'}</td>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#a78bfa', fontWeight: 600 }}>{total != null ? fmtP(total) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab Eventos (vendedor) ────────────────────────────────────────────
function EventosTab() {
  const { data: session } = useSession()
  const _u = session?.user as any
  const esAdmin = _u?.role === 'empresa'
  const esSupervisor = _u?.role === 'supervisor'

  const _hoy = new Date()
  const _dom = new Date(_hoy); _dom.setDate(_hoy.getDate() - _hoy.getDay())
  const _sab = new Date(_dom); _sab.setDate(_dom.getDate() + 6)
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  const defaultDesde = toISO(_dom)
  const defaultHasta = toISO(_sab)

  const [desde, setDesde] = useState(defaultDesde)
  const [hasta, setHasta] = useState(defaultHasta)
  const filtroModificado = desde !== defaultDesde || hasta !== defaultHasta

  const [eventos, setEventos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({})
  const [visorFotos, setVisorFotos] = useState<{ keys: string[]; idx: number } | null>(null)

  async function cargar() {
    setLoading(true)
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const d = await fetch('/api/impulsar/evento?' + params).then(r => r.json())
    setEventos(d.eventos || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [desde, hasta])

  async function verFoto(key: string) {
    if (fotoUrls[key]) return
    const d = await fetch('/api/impulsar/evento/foto-url?key=' + encodeURIComponent(key)).then(r => r.json())
    setFotoUrls(prev => ({ ...prev, [key]: d.url }))
  }

  function abrirVisor(fotos: string[], idx: number) {
    setVisorFotos({ keys: fotos, idx })
    fotos.forEach(k => verFoto(k))
  }

  async function eliminar(id: string) {
    if (!confirm('Eliminar este evento?')) return
    await fetch('/api/impulsar/evento?id=' + id, { method: 'DELETE' })
    cargar()
  }

  const fmtFecha = (f: string) => {
    const iso = f.slice(0, 10)
    const [y, m, d] = iso.split('-')
    return d + '/' + m + '/' + y
  }

  // Agrupar por impulsadora
  const grupos: Record<string, { nombre: string; eventos: any[] }> = {}
  for (const ev of eventos) {
    if (!grupos[ev.empleadoId]) grupos[ev.empleadoId] = { nombre: ev.impulsadoraNombre, eventos: [] }
    grupos[ev.empleadoId].eventos.push(ev)
  }

  const thEv: React.CSSProperties = {
    padding: '10px 10px', fontSize: 12, fontWeight: 600, color: '#94a3b8',
    whiteSpace: 'nowrap', overflow: 'hidden', borderBottom: '1px solid #1e2a3d',
    background: '#0a1020', userSelect: 'none', textAlign: 'left',
  }
  const tdEv: React.CSSProperties = {
    padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #131c2e',
    borderLeft: '2px solid rgba(255,255,255,0.07)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  }

  return (
    <div className="space-y-3">
      {visorFotos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setVisorFotos(null)}>
          <div className="relative w-full max-w-lg px-4" onClick={e => e.stopPropagation()}>
            <img src={fotoUrls[visorFotos.keys[visorFotos.idx]] || ''} alt="" className="w-full rounded-2xl object-contain max-h-[80vh]" />
            <div className="flex justify-center gap-2 mt-3">
              {visorFotos.keys.map((_, i) => (
                <button key={i} onClick={() => setVisorFotos(v => v ? { ...v, idx: i } : v)}
                  className={'w-2.5 h-2.5 rounded-full ' + (i === visorFotos.idx ? 'bg-blue-400' : 'bg-zinc-600')} />
              ))}
            </div>
            {visorFotos.keys.length > 1 && (
              <>
                <button onClick={() => setVisorFotos(v => v ? { ...v, idx: (v.idx - 1 + v.keys.length) % v.keys.length } : v)}
                  className="absolute left-6 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded-xl">&#8249;</button>
                <button onClick={() => setVisorFotos(v => v ? { ...v, idx: (v.idx + 1) % v.keys.length } : v)}
                  className="absolute right-6 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded-xl">&#8250;</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filtros fecha — estilo Gastos */}
      <div className="flex gap-2 items-center">
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
          className={'bg-[#0d1220] rounded-lg px-3 py-2 text-white text-sm focus:outline-none flex-1 min-w-0 ' + (filtroModificado ? 'border border-red-500' : 'border border-[#1e2a3d]')}
          style={{ colorScheme: 'dark' }} />
        <span className="text-zinc-500 text-sm flex-shrink-0">—</span>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
          className={'bg-[#0d1220] rounded-lg px-3 py-2 text-white text-sm focus:outline-none flex-1 min-w-0 ' + (filtroModificado ? 'border border-red-500' : 'border border-[#1e2a3d]')}
          style={{ colorScheme: 'dark' }} />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><span className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : eventos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-10 text-center">
          <p className="text-zinc-400 text-sm">Sin eventos en el período seleccionado</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.values(grupos).map(grupo => (
            <div key={grupo.nombre} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                  <span>👤</span>
                  <span className="text-sm font-bold text-white">{grupo.nombre}</span>
                </div>
                <span className="text-sm font-bold text-zinc-400">{grupo.eventos.length} evento{grupo.eventos.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="rounded-2xl border border-zinc-800 overflow-hidden" style={{ background: '#0f1623' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 480, background: '#0a0f1a' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e2a3d' }}>
                        {['FECHA', 'CLIENTE', 'CIUDAD', 'TIPO', 'FOTOS'].map(h => (
                          <th key={h} style={{ ...thEv, textAlign: h === 'FOTOS' ? 'center' : 'left' }}>{h}</th>
                        ))}
                        {(esAdmin || esSupervisor) && <th style={thEv}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.eventos.map((ev: any, i: number) => (
                        <tr key={ev.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                          <td style={{ ...tdEv, color: 'white' }}>{fmtFecha(ev.fecha)}</td>
                          <td style={{ ...tdEv, color: 'white', fontWeight: 500 }}>{ev.clienteNombre}</td>
                          <td style={{ ...tdEv, color: '#94a3b8', fontSize: 11 }}>{ev.ciudad || '—'}</td>
                          <td style={{ ...tdEv, color: 'white' }}>{ev.tipoEvento}</td>
                          <td style={{ ...tdEv, textAlign: 'center' }}>
                            <button onClick={() => abrirVisor(ev.fotos, 0)}
                              className="flex items-center gap-1 mx-auto text-blue-400 hover:text-blue-300 transition-colors">
                              <span>🖼</span>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{ev.fotos?.length || 0}</span>
                            </button>
                          </td>
                          {(esAdmin || esSupervisor) && (
                            <td style={tdEv}>
                              <button onClick={() => eliminar(ev.id)}
                                className="text-zinc-600 hover:text-red-400 transition-colors text-xs">🗑</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab Gestión (vendedor) ─────────────────────────────────────────
function GestionInventarioTab() {
  const priceFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
  const fmtP = (n: number | null | undefined) => n == null ? '—' : '$' + priceFmt.format(n)

  const [snapshots, setSnapshots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/impulsar/sugeridos?dias=14')
      .then(r => r.json())
      .then(d => { setSnapshots(d.snapshots || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer h-16 rounded-xl" />)}
    </div>
  )

  if (snapshots.length === 0) return (
    <div className="rounded-2xl p-10 text-center" style={{ background: '#0d1220', border: '1px solid #131c2e' }}>
      <p className="text-zinc-500 text-sm">Sin reportes de inventario en los últimos 14 días</p>
    </div>
  )

  return (
    <div className="space-y-2">
      <p className="text-zinc-400 text-xs px-1">Inventarios enviados por impulsadoras — últimos 14 días</p>
      {snapshots.map((snap: any) => {
        const montoTotal = snap.filas.reduce((acc: number, f: any) => {
          const sug = f.sugerido ?? 0
          const pr  = f.precio  ?? 0
          return acc + sug * pr
        }, 0)

        return (
          <div key={snap.key} className="rounded-xl overflow-hidden" style={{ background: '#0d1220', border: '1px solid rgba(59,130,246,0.25)' }}>
            {/* Header — cliente + monto + toggle */}
            <button
              onClick={() => setExpandido(expandido === snap.key ? null : snap.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate">{snap.clienteNombre}</p>
                <p className="text-zinc-500 text-xs">{snap.impulsadoraNombre} · {snap.fecha}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <div className="text-right">
                  {montoTotal > 0 && <p className="text-blue-400 font-bold text-sm">{fmtP(montoTotal)}</p>}
                  <p className="text-zinc-500 text-xs">{snap.filas.length} productos</p>
                </div>
                <span className="text-zinc-500 text-sm">{expandido === snap.key ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Tabla detalle */}
            {expandido === snap.key && (
              <div className="border-t" style={{ borderColor: '#131c2e' }}>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ minWidth: 420, background: '#0a0f1a' }}>
                    <thead>
                      <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                        <th style={{ ...gThSt, textAlign: 'right', width: 80 }}>Inv.</th>
                        <th style={gThSt}>Producto</th>
                        <th style={gThSt}>Línea</th>
                        <th style={{ ...gThSt, textAlign: 'right', width: 90 }}>Precio</th>
                        <th style={{ ...gThSt, textAlign: 'right', width: 80 }}>Sug.</th>
                        <th style={{ ...gThSt, textAlign: 'right', width: 100 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.filas.map((f: any, i: number) => {
                        const total = (f.sugerido ?? 0) * (f.precio ?? 0)
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #0d1524', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#34d399', fontWeight: 600 }}>{f.inventario ?? '—'}</td>
                            <td style={{ ...gTdSt, color: '#e2e8f0' }}>{f.productoNombre}</td>
                            <td style={{ ...gTdSt, color: '#64748b' }}>{f.linea || '—'}</td>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#64748b' }}>{fmtP(f.precio)}</td>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>{f.sugerido ?? '—'}</td>
                            <td style={{ ...gTdSt, textAlign: 'right', color: '#a78bfa', fontWeight: 600 }}>{total > 0 ? fmtP(total) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const gThSt: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, fontWeight: 500, color: '#64748b',
  textAlign: 'left', borderBottom: '1px solid #131c2e', whiteSpace: 'nowrap',
}
const gTdSt: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis',
}
