'use client'
import { useSession } from 'next-auth/react'
import PopupPermisos from '@/components/PopupPermisos'
import { useEffect, useState, useCallback } from 'react'

function slugify(n: string) {
  return n.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20)
}

const ROLES_CONFIG = [
  { id: 'supervisor', label: 'Supervisores', icon: '👁️', maxKey: 'maxSupervisores' },
  { id: 'vendedor', label: 'Vendedores', icon: '🛍️', maxKey: 'maxVendedores' },
  { id: 'entregas', label: 'Entregas', icon: '📦', maxKey: 'maxEntregas' },
  { id: 'impulsadora', label: 'Impulsadoras', icon: '⚡', maxKey: 'maxImpulsadoras' },
  { id: 'bodega', label: 'Bodega', icon: '🏭', maxKey: 'maxBodega' },
]
const ROL_SINGULAR: Record<string, string> = {
  supervisor: 'Supervisor', vendedor: 'Vendedor', entregas: 'Entrega', impulsadora: 'Impulsadora', bodega: 'Bodega',
}
export default function EmpleadosPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const esAdmin = user?.role === 'empresa'
  const [empleados, setEmpleados] = useState<any[]>([])
  const [limites, setLimites] = useState<any>({})
  const [modal, setModal] = useState(false)
  const [slotRol, setSlotRol] = useState('')
  const [slotNum, setSlotNum] = useState(0)
  const [editando, setEditando] = useState<any>(null)
  const [emailEdit, setEmailEdit] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [telefonoValido, setTelefonoValido] = useState(true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function generarPasswordDefault(nom: string, tel: string) {
    const prefijo = nom.trim().slice(0, 3)
    const sufijo = tel.replace(/\D/g, '').slice(-4)
    if (prefijo && sufijo) return prefijo + '*' + sufijo
    return ''
  }

  const [vendedorId, setVendedorId] = useState('')
  const [listaIds, setListaIds] = useState<string[]>([])
  const [notifReglas, setNotifReglas] = useState<any[]>([])
  const [notifEmpresaTarget, setNotifEmpresaTarget] = useState<string>('propia')
  const [notifEmpresas, setNotifEmpresas] = useState<{id:string,nombre:string,clienteId:string}[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifGuardando, setNotifGuardando] = useState<string | null>(null)
  const [notifTesting, setNotifTesting] = useState<string | null>(null)
  const [rolesConSub, setRolesConSub] = useState<string[]>([])
  const [listas, setListas] = useState<any[]>([])
  const [vendedorIds, setVendedorIds] = useState<string[]>([])
  const [etiqueta, setEtiqueta] = useState('')
  const PERMISOS_CONFIG = [
    { key: 'verClientes',       label: 'Ver clientes' },
    { key: 'editarClientes',    label: 'Editar clientes' },
    { key: 'verVisitas',        label: 'Ver visitas' },
    { key: 'registrarVisitas',  label: 'Registrar visitas' },
    { key: 'verRutas',          label: 'Ver rutas' },
    { key: 'asignarRutas',      label: 'Asignar rutas a entregas' },
    { key: 'verReportes',       label: 'Ver reportes' },
  { key: 'verBitacora',       label: 'Ver bitácora' },
  ]
  const [permisos, setPermisos] = useState<Record<string, boolean>>({})
  const [popupPermisos, setPopupPermisos] = useState(false)
  const [puedeCapturarGps, setPuedeCapturarGps] = useState(false)
  const [ciudadesAsignadas, setCiudadesAsignadas] = useState<string[]>([])
  const [ciudadBusqueda, setCiudadBusqueda] = useState('')
  const [colombiaData, setColombiaData] = useState<any[]>([])
  const [ciudadesSugeridas, setCiudadesSugeridas] = useState<string[]>([])
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [empresaNombre, setEmpresaNombre] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [precios, setPrecios] = useState<Record<string, number>>({})
  const [cantidades, setCantidades] = useState<Record<string, number>>({ supervisor: 0, vendedor: 0, entregas: 0, impulsadora: 0, bodega: 0 })
  const [modoEquipo, setModoEquipo] = useState<string | null>(null)
  const [syncEmpleados, setSyncEmpleados] = useState<any[]>([])
  const [tieneIntegracion, setTieneIntegracion] = useState(false)
  const [apiIdSeleccionado, setApiIdSeleccionado] = useState('')

  // Tab principal
  const [tabPrincipal, setTabPrincipal] = useState<'rutas' | 'equipo' | 'metas' | 'notifica'>('rutas')
  // Metas
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const fmtMeta = (v: string) => {
    const n = parseInt(v.replace(/[^0-9]/g,''), 10)
    if (!n || isNaN(n)) return v
    return Math.round(n).toLocaleString('es-CO')
  }
  const parseMeta = (v: string) => v.replace(/[^0-9]/g,'')
  const [popupSync, setPopupSync] = useState(false)
  const [popupSyncForm, setPopupSyncForm] = useState(false)
  const [syncEvidencia, setSyncEvidencia] = useState<string|null>(null)
  const [syncEmpleadoId, setSyncEmpleadoId] = useState('')
  const [syncFecha, setSyncFecha] = useState('')
  const [syncPrimerRecibo, setSyncPrimerRecibo] = useState<{numeroRecibo:string, fecha:string}|null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [metasEmpleadoId, setMetasEmpleadoId] = useState('')
  const [metasAnio, setMetasAnio] = useState(new Date().getFullYear())
  const [metasData, setMetasData] = useState<{recaudo: any[], venta: any[]}>({ recaudo: [], venta: [] })
  const [metasEdit, setMetasEdit] = useState<Record<string, {recaudo: string, venta: string}>>({})
  const [metasCargando, setMetasCargando] = useState(false)
  const [metasGuardando, setMetasGuardando] = useState(false)
  // Tab rutas
  const [subTabRutas, setSubTabRutas] = useState<'hoy' | 'historial'>('hoy')
  const [turnosHoy, setTurnosHoy] = useState<any[]>([])
  const [turnosHistorial, setTurnosHistorial] = useState<any[]>([])
  const [filtroRol, setFiltroRol] = useState('')
  const [loadingTurnos, setLoadingTurnos] = useState(false)
  const [paginaHist, setPaginaHist] = useState(1)
  const [totalPaginasHist, setTotalPaginasHist] = useState(1)
  const [totalHist, setTotalHist] = useState(0)

  async function cargarTurnos(modo: 'hoy' | 'historial', rol = '', page = 1) {
    setLoadingTurnos(true)
    try {
      const res = await fetch(`/api/turnos/admin?modo=${modo}&rol=${rol}&page=${page}`)
      const data = await res.json()
      if (modo === 'hoy') {
        setTurnosHoy(data.turnos || [])
      } else {
        if (page === 1) setTurnosHistorial(data.turnos || [])
        else setTurnosHistorial(prev => [...prev, ...(data.turnos || [])])
        setTotalPaginasHist(data.pages || 1)
        setTotalHist(data.total || 0)
        setPaginaHist(page)
      }
    } finally {
      setLoadingTurnos(false)
    }
  }

  useEffect(() => { cargarTurnos('hoy') }, [])

  useEffect(() => {
    if (subTabRutas === 'historial' && turnosHistorial.length === 0) cargarTurnos('historial', filtroRol)
  }, [subTabRutas])

  useEffect(() => {
    if (subTabRutas === 'historial') { setPaginaHist(1); cargarTurnos('historial', filtroRol, 1) }
  }, [filtroRol])

  const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const ROL_ICON: Record<string,string> = { vendedor:'🛍️', entregas:'📦', supervisor:'👁️', impulsadora:'⭐', bodega:'🏭' }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [empRes, meRes, estadoRes] = await Promise.all([
      fetch('/api/empleados').then(r => r.json()),
      fetch('/api/me').then(r => r.json()),
      fetch('/api/mi-empresa/estado').then(r => r.json()),
    ])
    fetch('/api/listas').then(r => r.json()).then(d => { if (Array.isArray(d)) setListas(d) })
    fetch('/api/sync-empleados').then(r => r.json()).then(d => { if (d.ok) { setSyncEmpleados(d.empleados || []); setTieneIntegracion(d.tieneIntegracion || false) } })
    setEmpleados(empRes.empleados || [])
    setLimites(empRes.limites || {})
    setEmpresaNombre(meRes.nombre || '')
    setEmpresaId(meRes.id || '')
    setModoEquipo(estadoRes.modoEquipo ?? null)
    fetch('/api/precios/publico')
      .then(r => r.json())
      .then(d => {
        const map: Record<string, number> = {}
        for (const p of (d.precios ?? [])) map[p.rol] = p.precio
        setPrecios(map)
      })
      .catch(() => {})
  }

  function abrirSlot(rol: string, num: number, empleadoExistente?: any) {
    setSlotRol(rol)
    setSlotNum(num)
    setEmailEdit(empleadoExistente?.email || '')
    setEditando(empleadoExistente || null)
    setNombre(empleadoExistente?.nombre || '')
    setTelefono(empleadoExistente?.telefono || '')
    setPuedeCapturarGps(empleadoExistente?.puedeCapturarGps || false)
    setVendedorId(empleadoExistente?.vendedorId || '')
    setListaIds(empleadoExistente?.listasAsignadas?.map((l: any) => l.listaId) || [])
    setVendedorIds(empleadoExistente?.vendedoresAsignados?.map((v: any) => v.vendedorId) || [])
    setPermisos(empleadoExistente?.permisos || {})
    setEtiqueta(empleadoExistente?.etiqueta || '')
    setCiudadesAsignadas(empleadoExistente?.ciudades || [])
    setCiudadBusqueda('')
    if (colombiaData.length === 0) fetch('/colombia.json').then(r => r.json()).then(d => setColombiaData(d))
    setPassword('')
    setResultado(null)
    setError('')
    setApiIdSeleccionado(empleadoExistente?.apiId || '')
    setModal(true)
  }

  async function guardar(confirmarReduccionListas?: boolean) {
    setLoading(true); setError('')
    if (editando) {
      const res = await fetch('/api/empleados', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editando.id, nombre, email: emailEdit || undefined, telefono, password: password || undefined, vendedorId: vendedorId || null, puedeCapturarGps, ciudades: ciudadesAsignadas, listaIds, vendedorIds: (slotRol === 'supervisor' || editando?.rol === 'supervisor') ? vendedorIds : undefined, permisos: permisos, etiqueta: (slotRol === 'supervisor' || editando?.rol === 'supervisor') ? etiqueta : undefined, apiId: apiIdSeleccionado || undefined, confirmarReduccionListas })
      })
      const data = await res.json()
      if (data.error === 'REDUCCION_LISTAS_SIN_CONFIRMAR') {
        setLoading(false)
        const nombres = (data.listaIdsRemovidas || []).join(', ')
        if (confirm(`Este cambio quita ${data.listaIdsRemovidas?.length || 0} lista(s) asignada(s) (${nombres}). ¿Confirmar?`)) {
          guardar(true)
        }
        return
      }
      setLoading(false)
      if (data.error) { setError(data.error); return }
      setModal(false)
      loadData()
    } else {
      const res = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, rol: slotRol, telefono, password, vendedorId: vendedorId || null, ciudades: ciudadesAsignadas, listaIds, vendedorIds: slotRol === 'supervisor' ? vendedorIds : undefined, permisos: permisos, etiqueta: slotRol === 'supervisor' ? etiqueta : undefined })
      })
      const data = await res.json()
      setLoading(false)
      if (data.error) { setError(data.error); return }
      setResultado(data)
      // Si el empleado tiene apiId y lista → preparar popup sync (solo si no tiene syncInicioAt)
      if (data.id && apiIdSeleccionado && listaIds.length > 0) {
        setSyncEmpleadoId(data.id)
        setSyncFecha(new Date().toISOString().split('T')[0])
        setSyncMsg('')
      }
    }
  }

  async function ejecutarSyncInicial() {
    if (!syncEmpleadoId || !syncFecha) return
    setSyncLoading(true); setSyncMsg('')
    const res = await fetch('/api/vendedor/sync-inicial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empleadoId: syncEmpleadoId, syncInicioAt: new Date(syncFecha + 'T05:00:00Z').toISOString() })
    })
    const data = await res.json()
    setSyncLoading(false)
    if (data.error) { setSyncMsg('Error: ' + data.error); return }
    setSyncMsg(`✅ ${data.actualizadas} deudas sincronizadas`)
    setTimeout(() => { setPopupSync(false); setSyncMsg('') }, 2000)
  }

  async function desactivar(id: string) {
    if (!confirm('Desactivar este empleado?')) return
    await fetch('/api/empleados', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    loadData()
  }

  function getSlug(n: string) {
    return slugify(n) + '@' + slugify(empresaNombre)
  }

  async function testNotifRegla(reglaId: string) {
    setNotifTesting(reglaId)
    await fetch('/api/notif-reglas/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reglaId }) })
    setNotifTesting(null)
  }

  async function cargarNotifReglas(target?: string) {
    setNotifLoading(true)
    const q = target && target !== 'propia' ? `?target=${target}` : ''
    const d = await fetch(`/api/notif-reglas${q}`).then(r => r.json()).catch(() => ({ reglas: [] }))
    setNotifReglas(d.reglas || [])
    setRolesConSub(d.rolesConSub || [])
    setNotifLoading(false)
  }

  async function cargarNotifEmpresas() {
    const d = await fetch('/api/bodega/empresas').then(r => r.json()).catch(() => ({}))
    const vincs = (d.vinculadas || []).map((v: any) => ({ id: v.slug, nombre: v.nombre, clienteId: v.id }))
    setNotifEmpresas(vincs)
  }

  async function toggleNotifRol(reglaId: string, rol: string, checked: boolean) {
    const regla = notifReglas.find((r: any) => r.id === reglaId)
    if (!regla) return
    const roles = checked ? [...regla.roles, rol] : regla.roles.filter((r: string) => r !== rol)
    setNotifReglas(prev => prev.map((r: any) => r.id === reglaId ? { ...r, roles } : r))
    setNotifGuardando(reglaId)
    const tgt = notifEmpresas.find(e => e.id === notifEmpresaTarget)?.clienteId
    await fetch('/api/notif-reglas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reglaId, roles, activa: regla.activa, ...(tgt ? { target: tgt } : {}) }) })
    setNotifGuardando(null)
  }

  async function toggleNotifActiva(reglaId: string, activa: boolean) {
    const regla = notifReglas.find((r: any) => r.id === reglaId)
    if (!regla) return
    setNotifReglas(prev => prev.map((r: any) => r.id === reglaId ? { ...r, activa } : r))
    setNotifGuardando(reglaId)
    const tgt = notifEmpresas.find(e => e.id === notifEmpresaTarget)?.clienteId
    await fetch('/api/notif-reglas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reglaId, roles: regla.roles, activa, ...(tgt ? { target: tgt } : {}) }) })
    setNotifGuardando(null)
  }

  async function cargarMetas(empId: string, anio: number) {
    if (!empId) return
    setMetasCargando(true)
    const d = await fetch(`/api/metas?empleadoId=${empId}&anio=${anio}`).then(r => r.json()).catch(() => ({ recaudo: [], venta: [] }))
    setMetasData(d)
    const edit: Record<string, {recaudo: string, venta: string}> = {}
    for (let m = 1; m <= 12; m++) {
      const r = d.recaudo.find((x: any) => x.mes === m)
      const v = d.venta.find((x: any) => x.mes === m)
      edit[m] = { recaudo: r ? Math.round(Number(r.metaPesos)).toLocaleString('es-CO') : '', venta: v ? Math.round(Number(v.metaPesos)).toLocaleString('es-CO') : '' }
    }
    setMetasEdit(edit)
    setMetasCargando(false)
  }

  async function guardarMetas() {
    if (!metasEmpleadoId) return
    setMetasGuardando(true)
    const recaudo = []
    const venta = []
    for (let m = 1; m <= 12; m++) {
      const r = metasEdit[m]?.recaudo
      const v = metasEdit[m]?.venta
      recaudo.push({ mes: m, metaPesos: r ? parseInt(r.replace(/[^0-9]/g, ''), 10) || null : null })
      venta.push({ mes: m, metaPesos: v ? parseInt(v.replace(/[^0-9]/g, ''), 10) || null : null })
    }
    await fetch('/api/metas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empleadoId: metasEmpleadoId, anio: metasAnio, recaudo, venta }) })
    setMetasGuardando(false)
  }

  function guardarPermisos(nuevosPermisos: Record<string, boolean>) {
    setPermisos(nuevosPermisos)
    setPopupPermisos(false)
  }

  return (
    <>
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Tabs principales */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        <button onClick={() => setTabPrincipal('rutas')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'rutas' ? 'tab-active' : 'text-white hover:text-white'}`}>
          🛣️ Rutas
        </button>
        <button onClick={() => setTabPrincipal('equipo')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'equipo' ? 'tab-active' : 'text-white hover:text-white'}`}>
          👥 Equipo
        </button>
        <button onClick={() => setTabPrincipal('metas')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'metas' ? 'tab-active' : 'text-white hover:text-white'}`}>
          🎯 Metas
        </button>
        {esAdmin && (
          <button onClick={() => { setTabPrincipal('notifica'); cargarNotifEmpresas(); if (notifReglas.length === 0) cargarNotifReglas() }}
            className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tabPrincipal === 'notifica' ? 'tab-active' : 'text-white hover:text-white'}`}>
            🔔 Notif.
          </button>
        )}
      </div>

      {/* Tab Rutas */}
      {tabPrincipal === 'rutas' && (
        <div className="space-y-4">
          {/* Subtabs */}
          <div className="flex gap-2">
            <button onClick={() => { setSubTabRutas('hoy'); cargarTurnos('hoy') }}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors ${subTabRutas === 'hoy' ? 'bg-[#09091e] border-[rgba(59,130,246,0.60)] text-white' : 'bg-[rgba(8,8,28,0.60)] border-[rgba(59,130,246,0.20)] text-zinc-400 hover:text-white'}`}>
              📅 Hoy
            </button>
            <button onClick={() => setSubTabRutas('historial')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors ${subTabRutas === 'historial' ? 'bg-[#09091e] border-[rgba(59,130,246,0.60)] text-white' : 'bg-[rgba(8,8,28,0.60)] border-[rgba(59,130,246,0.20)] text-zinc-400 hover:text-white'}`}>
              📋 Historial
            </button>
          </div>

          {/* Filtro rol — solo en historial */}
          {subTabRutas === 'historial' && (
            <div className="flex gap-2 flex-wrap">
              {['', 'vendedor', 'entregas', 'supervisor', 'impulsadora', 'bodega'].map(r => (
                <button key={r} onClick={() => setFiltroRol(r)}
                  className={`px-3 py-1.5 text-xs rounded-xl border font-semibold transition-colors ${filtroRol === r ? 'bg-[#09091e] border-[rgba(59,130,246,0.50)] text-white' : 'bg-[rgba(8,8,28,0.60)] border-[rgba(59,130,246,0.20)] text-zinc-400 hover:text-white'}`}>
                  {r === '' ? 'Todos' : ROL_ICON[r] + ' ' + r}
                </button>
              ))}
            </div>
          )}

          {loadingTurnos ? (
            <div className="text-center py-10 text-zinc-500 text-sm">Cargando...</div>
          ) : (
            <>
              {/* HOY */}
              {subTabRutas === 'hoy' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {turnosHoy.length === 0 ? (
                    <div style={{ background:"#060a24", border:"1px solid rgba(59,130,246,0.20)", borderRadius:16, padding:40, textAlign:"center" }}>
                      <p className="text-3xl mb-2">😴</p>
                      <p className="text-zinc-400">Sin turnos activos hoy</p>
                    </div>
                  ) : turnosHoy.map((t: any) => (
                    <div key={t.id} style={{ background:"#060a24", border:`1px solid ${t.activo ? "rgba(59,130,246,0.40)" : "#0f2540"}`, borderRadius:16, padding:16 }} className={`space-y-3`}>
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg">{ROL_ICON[t.rol] || '👤'}</span>
                          <p className="text-white font-semibold text-sm truncate">{t.empleado}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${t.activo ? (t.pausado ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400') : 'bg-zinc-700 text-zinc-400'}`}>
                          {t.activo ? (t.pausado ? '⏸ Pausa' : '🟢 Activo') : '✅ Fin'}
                        </span>
                      </div>
                      {/* Inicio / Fin */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-zinc-500 mb-0.5">🟢 Inicio</p>
                          {t.latInicio && t.lngInicio ? (
                            <a href={`https://www.google.com/maps?q=${t.latInicio},${t.lngInicio}`} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline font-medium">{t.inicio}</a>
                          ) : (
                            <p className="text-white font-medium">{t.inicio}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-zinc-500 mb-0.5">🔴 Fin</p>
                          {t.fin ? (
                            t.latFin && t.lngFin ? (
                              <a href={`https://www.google.com/maps?q=${t.latFin},${t.lngFin}`} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline font-medium">{t.fin}</a>
                            ) : (
                              <p className="text-white font-medium">{t.fin}</p>
                            )
                          ) : (
                            <p className="text-zinc-600">—</p>
                          )}
                        </div>
                      </div>
                      {/* Pausa */}
                      {t.pausaMotivo && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs">
                          <span className="text-amber-400 font-semibold">
                            ☕ {t.pausaMotivo}
                            {t.pausaInicio ? ` · ${t.pausaInicio}` : ''}
                            {t.pausaDuracionMin ? ` · ${t.pausaDuracionMin}min` : ''}
                          </span>
                        </div>
                      )}
                      {/* Duración */}
                      <div className="flex items-center gap-3 text-xs border-t border-zinc-800 pt-2">
                        <span className="text-zinc-500">⏱ Efectivo:</span>
                        <span className="text-white font-semibold">{t.duracionEfectiva}</span>
                        {t.pausaDuracionMin > 0 && (
                          <><span className="text-zinc-600">Total:</span><span className="text-zinc-400">{t.duracionTotal}</span></>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* HISTORIAL */}
              {subTabRutas === 'historial' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {turnosHistorial.length === 0 ? (
                    <div style={{ background:"#060a24", border:"1px solid rgba(59,130,246,0.20)", borderRadius:16, padding:40, textAlign:"center" }}>
                      <p className="text-zinc-400">Sin historial en los últimos 30 días</p>
                    </div>
                  ) : turnosHistorial.map((t: any) => (
                    <div key={t.id} style={{ background:"#060a24", border:"1px solid rgba(59,130,246,0.20)", borderRadius:16, padding:16 }}>
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg">{ROL_ICON[t.rol] || '👤'}</span>
                          <p className="text-white font-semibold text-sm truncate">{t.empleado}</p>
                        </div>
                        <span className="text-zinc-500 text-xs flex-shrink-0">{t.fecha}</span>
                      </div>
                      {/* Inicio / Fin */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-zinc-500 mb-0.5">🟢 Inicio</p>
                          {t.latInicio && t.lngInicio ? (
                            <a href={`https://www.google.com/maps?q=${t.latInicio},${t.lngInicio}`} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline font-medium">{t.inicio}</a>
                          ) : (
                            <p className="text-white font-medium">{t.inicio}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-zinc-500 mb-0.5">🔴 Fin</p>
                          {t.latFin && t.lngFin ? (
                            <a href={`https://www.google.com/maps?q=${t.latFin},${t.lngFin}`} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline font-medium">{t.fin}</a>
                          ) : (
                            <p className="text-white font-medium">{t.fin || '—'}</p>
                          )}
                        </div>
                      </div>
                      {/* Pausa */}
                      {t.pausaMotivo && (
                        <p className="text-zinc-500 text-xs">
                          ☕ {t.pausaMotivo}
                          {t.pausaInicio ? ` · ${t.pausaInicio}` : ''}
                          {t.pausaDuracionMin ? ` · ${t.pausaDuracionMin}min` : ''}
                        </p>
                      )}
                      {/* Duración */}
                      <div className="flex items-center gap-3 text-xs border-t border-zinc-800 pt-2">
                        <span className="text-zinc-500">⏱ Efectivo:</span>
                        <span className="text-white font-semibold">{t.duracionEfectiva}</span>
                        {t.pausaDuracionMin > 0 && (
                          <><span className="text-zinc-600">Total:</span><span className="text-zinc-400">{t.duracionTotal}</span></>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Cargar más */}
                  {paginaHist < totalPaginasHist && (
                    <div className="col-span-full">
                      <button onClick={() => cargarTurnos('historial', filtroRol, paginaHist + 1)}
                        disabled={loadingTurnos}
                        style={{ background:"rgba(8,8,28,0.82)", border:"1px solid rgba(59,130,246,0.30)", borderRadius:12, padding:"10px 0", color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:600, width:"100%", cursor:"pointer" }}>
                        {loadingTurnos ? 'Cargando...' : `Cargar más (${turnosHistorial.length} de ${totalHist})`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab Equipo — contenido original */}
      {tabPrincipal === 'equipo' && (
        <div className="space-y-4">

      {(() => {
        const haySupervisor = empleados.some(e => e.rol === 'supervisor' && e.activo)
        const rolesVisibles = ROLES_CONFIG.filter(rc =>
          modoEquipo === 'simple' ? rc.id !== 'supervisor' : true
        )
        return rolesVisibles.map(rc => {
          const max = limites[rc.maxKey] || 0
          const empRol = empleados.filter(e => e.rol === rc.id && e.activo)
          if (max === 0) return null
          return (
            <div key={rc.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{rc.icon}</span>
                  <span className="text-white font-semibold">{rc.label}</span>
                </div>
                <span className="text-zinc-500 text-xs">{empRol.length}/{max}</span>
              </div>
              <div className="p-3 space-y-2">
                {Array.from({ length: max }).map((_, i) => {
                  const emp = empRol[i]
                  const bloqueadoPorSupervisor = false
                  return (
                    <div key={i} className={"flex items-center gap-3 px-3 py-2.5 rounded-xl " + (emp ? "bg-zinc-800" : "bg-zinc-900 border border-dashed border-zinc-700")}>
                      <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 " + (emp ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-600")}>
                        {emp ? emp.nombre[0].toUpperCase() : (i + 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {emp ? (
                          <>
                            <p className="text-white text-sm font-medium">{emp.nombre}</p>
                            <p className="text-zinc-500 text-xs font-mono">{emp.email}</p>
                          </>
                        ) : (
                          <p className="text-zinc-600 text-sm">{rc.label.replace('Vendedores','Vendedor').replace('Supervisores','Supervisor').replace('Impulsadoras','Impulsadora').replace('Entregas','Entrega')} {i + 1}</p>
                        )}
                      </div>
                      {esAdmin && (
                        bloqueadoPorSupervisor ? (
                          <div className="relative group flex-shrink-0">
                            <button disabled className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-600 cursor-not-allowed">
                              Configurar
                            </button>
                            <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block w-48  rounded-lg px-3 py-2 text-xs text-zinc-300 shadow-xl pointer-events-none z-10" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                              Primero crea un supervisor
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => abrirSlot(rc.id, i + 1, emp)}
                            className={"text-xs px-3 py-1.5 rounded-lg flex-shrink-0 " + (emp ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300" : "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold")}>
                            {emp ? 'Editar' : 'Configurar'}
                          </button>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      })()}

      {/* Ampliar equipo */}
      {esAdmin && empresaId && Object.keys(precios).length > 0 && (() => {
        const rolesAmpliables = ROLES_CONFIG.filter(rc =>
          modoEquipo === 'simple' ? rc.id !== 'supervisor' : true
        )
        const total = rolesAmpliables.reduce((sum, rc) => sum + (cantidades[rc.id] ?? 0) * (precios[rc.id] ?? 0), 0)
        const rolesSeleccionados: Record<string, number> = {}
        for (const rc of rolesAmpliables) {
          const c = cantidades[rc.id] ?? 0
          if (c > 0) rolesSeleccionados[rc.id] = c
        }
        const url = total > 0
          ? `https://master.tuagentx.com/checkout?producto=GESTOR&upgrade=true&monto=${total}&empresaId=${empresaId}&roles=${encodeURIComponent(JSON.stringify(rolesSeleccionados))}`
          : ''
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <div className="text-white font-semibold">Ampliar equipo</div>
              <div className="text-zinc-500 text-xs mt-0.5">Selecciona cuántos empleados agregar por rol</div>
            </div>
            <div className="p-3 space-y-2">
              {rolesAmpliables.map(rc => {
                const precio = precios[rc.id]
                if (!precio) return null
                const cant = cantidades[rc.id] ?? 0
                return (
                  <div key={rc.id} className="flex items-center justify-between  rounded-xl px-4 py-3" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span>{rc.icon}</span>
                      <div>
                        <div className="text-white text-sm font-medium">{ROL_SINGULAR[rc.id]}</div>
                        <div className="text-zinc-500 text-xs">${precio.toLocaleString('es-CO')}/mes c/u</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {cant > 0 && (
                        <div className="text-violet-400 text-xs font-semibold">
                          +${(cant * precio).toLocaleString('es-CO')}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCantidades(p => ({ ...p, [rc.id]: Math.max(0, (p[rc.id] ?? 0) - 1) }))}
                          disabled={cant === 0}
                          className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center transition-colors">
                          −
                        </button>
                        <span className="text-white font-semibold text-sm w-4 text-center">{cant}</span>
                        <button
                          onClick={() => setCantidades(p => ({ ...p, [rc.id]: Math.min(5, (p[rc.id] ?? 0) + 1) }))}
                          disabled={cant === 5}
                          className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center transition-colors">
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-3 pb-3">
              <button
                disabled={total === 0}
                onClick={() => total > 0 && url && window.open(url, '_blank', 'noopener,noreferrer')}
                className="w-full py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 text-white">
                {total === 0 ? 'Selecciona empleados para agregar' : `💳 Pagar $${total.toLocaleString('es-CO')}/mes`}
              </button>
            </div>
          </div>
        )
      })()}

      {modal && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {resultado ? (
              <>
                <div className="text-center space-y-3">
                  <div className="text-4xl">✅</div>
                  <p className="text-white font-semibold">Empleado creado</p>
                  <div className="rounded-xl p-4 text-left space-y-2" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                    <p className="text-zinc-400 text-xs">Email:</p>
                    <p className="text-emerald-400 font-mono text-sm">{resultado.email}</p>
                    <p className="text-zinc-400 text-xs mt-2">Contraseña:</p>
                    <p className="text-white font-mono text-sm">{password}</p>
                  </div>
                </div>
                {syncEmpleadoId && !popupSync && (
                  <button onClick={async () => {
                    // Buscar primer recibo del vendedor
                    try {
                      const r = await fetch(`/api/empleados/primer-recibo?empleadoId=${syncEmpleadoId}`)
                      const d = await r.json()
                      if (d.numeroRecibo && d.fecha) {
                        setSyncPrimerRecibo({ numeroRecibo: d.numeroRecibo, fecha: d.fecha })
                        setSyncFecha(d.fecha.split('T')[0])
                      } else {
                        setSyncPrimerRecibo(null)
                      }
                    } catch { setSyncPrimerRecibo(null) }
                    setPopupSync(true)
                  }} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm py-3 rounded-xl font-semibold">
                    📊 Sincronizar cartera inicial
                  </button>
                )}
                <button onClick={() => { setModal(false); setSyncEmpleadoId(''); loadData() }}
                  className="w-full bg-zinc-800 text-white text-sm py-3 rounded-xl">Cerrar</button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold">{editando ? 'Editar' : 'Configurar'} — {ROLES_CONFIG.find(r => r.id === slotRol)?.label.replace('Vendedores','Vendedor').replace('Supervisores','Supervisor').replace('Impulsadoras','Impulsadora').replace('Entregas','Entrega')} {slotNum}</h3>
                  <button onClick={() => setModal(false)} className="text-zinc-500 hover:text-white">✕</button>
                </div>
                {editando && (
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Email de acceso</label>
                    <input value={emailEdit} onChange={e => setEmailEdit(e.target.value)}
                      placeholder="correo@empresa"
                      className="w-full  rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#0d1220",border:"1px solid #1e2a3d"}} />
                  </div>
                )}
                {nombre && !editando && (
                  <div className="rounded-xl p-3" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                    <p className="text-zinc-400 text-xs mb-1">Usuario:</p>
                    <p className="text-emerald-400 font-mono text-sm">{getSlug(nombre)}</p>
                  </div>
                )}
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre</label>
                  <input value={nombre} onChange={e => { setNombre(e.target.value); if (!editando) setPassword(generarPasswordDefault(e.target.value, telefono)) }}
                    placeholder="Nombre del empleado"
                    className="w-full  rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#0d1220",border:"1px solid #1e2a3d"}} />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Teléfono</label>
                  <input value={telefono} onChange={e => { const v = e.target.value; setTelefono(v); setTelefonoValido(v === "" || v.replace(/\D/g, "").length === 10); if (!editando) setPassword(generarPasswordDefault(nombre, v)) }}
                    placeholder="Ej: 3001234567" autoComplete="off"
                    className={`w-full bg-zinc-800 border rounded-xl px-4 py-2.5 text-white text-sm outline-none ${telefonoValido ? "border-zinc-700 focus:border-emerald-500" : "border-red-500"}`} />
                {!telefonoValido && <p className="text-red-400 text-xs mt-1">El celular debe tener 10 dígitos</p>}
                </div>
                {(slotRol === 'impulsadora' || editando?.rol === 'impulsadora') && (
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Vendedor responsable</label>
                    <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
                      className="w-full  rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                      <option value="">Sin asignar</option>
                      {empleados.filter(e => e.rol === 'vendedor' && e.activo).map((v: any) => (
                        <option key={v.id} value={v.id}>{v.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
                {(slotRol === 'vendedor' || editando?.rol === 'vendedor') && tieneIntegracion && syncEmpleados.length > 0 && (
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Empleado UpTres</label>
                    <select value={apiIdSeleccionado} onChange={e => {
                      setApiIdSeleccionado(e.target.value)
                      const emp = syncEmpleados.find((s: any) => s.externalId === e.target.value)
                      if (emp && !nombre) setNombre(emp.nombre)
                    }}
                      className="w-full  rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                      <option value="">— Sin enlazar —</option>
                      {syncEmpleados.map((s: any) => (
                        <option key={s.externalId} value={s.externalId}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
                {(slotRol === 'vendedor' || editando?.rol === 'vendedor') && tieneIntegracion && editando && (
                  <button type="button" onClick={async () => {
                    setSyncMsg(''); setSyncEvidencia(null)
                    try {
                      const r = await fetch(`/api/empleados/primer-recibo?empleadoId=${editando.id}`)
                      const d = await r.json()
                      if (d.numeroRecibo && d.fecha) {
                        setSyncPrimerRecibo({ numeroRecibo: d.numeroRecibo, fecha: d.fecha })
                        setSyncFecha(d.fecha.split('T')[0])
                      } else { setSyncPrimerRecibo(null); setSyncFecha('') }
                    } catch { setSyncPrimerRecibo(null) }
                    setPopupSyncForm(true)
                  }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors hover:opacity-90"
                    style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.30)' }}>
                    <div className="flex items-center gap-2">
                      <span>🔗</span>
                      <span className="text-white text-sm font-semibold">Sincronización cartera</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {syncEvidencia
                        ? <span className="text-emerald-400 text-xs">{syncEvidencia}</span>
                        : <span className="text-zinc-500 text-xs">Configurar</span>}
                      <span className="text-zinc-500 text-xs">›</span>
                    </div>
                  </button>
                )}
                {(slotRol === 'vendedor' || editando?.rol === 'vendedor') && listas.length > 0 && (
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Lista asignada</label>
                    <div className="space-y-1 max-h-36 overflow-y-auto  rounded-xl p-2" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                      {listas.map((l: any) => (
                        <label key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-700 cursor-pointer">
                          <input
                            type="radio"
                            name="listaAsignada"
                            checked={listaIds.includes(l.id)}
                            onChange={() => setListaIds([l.id])}
                            className="accent-emerald-500"
                          />
                          <span className="text-white text-sm">{l.nombre}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {(slotRol === 'supervisor' || editando?.rol === 'supervisor') && (
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Etiqueta / Marca</label>
                    <input value={etiqueta} onChange={e => setEtiqueta(e.target.value)}
                      placeholder="Ej: Carmel, Chanel, Nike..."
                      className="w-full  rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-violet-500" style={{background:"#0d1220",border:"1px solid #1e2a3d"}} />
                  </div>
                )}
                {(slotRol === 'supervisor' || editando?.rol === 'supervisor') && empleados.filter(e => e.rol === 'vendedor' && e.activo).length > 0 && (
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Vendedores asignados</label>
                    <div className="space-y-1 max-h-36 overflow-y-auto  rounded-xl p-2" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                      {empleados.filter(e => e.rol === 'vendedor' && e.activo).map((v: any) => (
                        <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vendedorIds.includes(v.id)}
                            onChange={e => setVendedorIds(prev => e.target.checked ? [...prev, v.id] : prev.filter(x => x !== v.id))}
                            className="accent-violet-500"
                          />
                          <span className="text-white text-sm">{v.nombre}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {(slotRol === 'supervisor' || editando?.rol === 'supervisor') && (
                  <button type="button" onClick={() => setPopupPermisos(true)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors hover:opacity-90"
                    style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.30)' }}>
                    <div className="flex items-center gap-2">
                      <span>🔐</span>
                      <span className="text-white text-sm font-semibold">Establecer permisos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-violet-400 text-xs">
                        {Object.values(permisos).filter(Boolean).length} activos
                      </span>
                      <span className="text-zinc-500 text-xs">›</span>
                    </div>
                  </button>
                )}
                {(slotRol === 'vendedor' || slotRol === 'entregas' || editando?.rol === 'vendedor' || editando?.rol === 'entregas') && (
                  <div className="flex items-center justify-between  rounded-xl px-4 py-3" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                    <div>
                      <p className="text-white text-sm font-medium">Puede capturar GPS de clientes</p>
                      <p className="text-zinc-500 text-xs">Al visitar cliente sin GPS, puede guardar su ubicación</p>
                    </div>
                    <button type="button" onClick={() => setPuedeCapturarGps(p => !p)}
                      className={"w-12 h-6 rounded-full transition-colors flex-shrink-0 " + (puedeCapturarGps ? "bg-emerald-500" : "bg-zinc-600")}>
                      <div className={"w-5 h-5 bg-white rounded-full transition-transform mx-0.5 " + (puedeCapturarGps ? "translate-x-6" : "translate-x-0")} />
                    </button>
                  </div>
                )}
                {(slotRol === 'entregas' || editando?.rol === 'entregas') && (
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Ciudades asignadas</label>
                    <div className="relative">
                      <input
                        value={ciudadBusqueda}
                        onChange={e => {
                          const q = e.target.value
                          setCiudadBusqueda(q)
                          if (q.length < 2) { setCiudadesSugeridas([]); return }
                          const resultados: string[] = []
                          colombiaData.forEach((dep: any) => {
                            dep.ciudades.forEach((c: string) => {
                              const texto = dep.departamento + '/' + c
                              if (texto.toLowerCase().includes(q.toLowerCase())) resultados.push(texto)
                            })
                          })
                          setCiudadesSugeridas(resultados.slice(0, 8))
                        }}
                        placeholder="Buscar ciudad... ej: Tolima/Ibagué"
                        className="w-full  rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}
                      />
                      {ciudadesSugeridas.length > 0 && (
                        <div className="absolute z-10 w-full mt-1  rounded-xl overflow-hidden shadow-xl" style={{background:"#0d1220",border:"1px solid #1e2a3d"}}>
                          {ciudadesSugeridas.map(c => (
                            <button key={c} type="button" onClick={() => {
                              if (!ciudadesAsignadas.includes(c)) setCiudadesAsignadas(prev => [...prev, c])
                              setCiudadBusqueda('')
                              setCiudadesSugeridas([])
                            }} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors">
                              {c}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {ciudadesAsignadas.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {ciudadesAsignadas.map(c => (
                          <span key={c} className="flex items-center gap-1 bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded-lg">
                            {c}
                            <button type="button" onClick={() => setCiudadesAsignadas(prev => prev.filter(x => x !== c))} className="hover:text-white">✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">{editando ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
                      placeholder={editando ? 'Dejar vacío para no cambiar' : 'Contraseña de acceso'}
                      className="w-full  rounded-lg px-3 py-2 pr-10 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#0d1220",border:"1px solid #1e2a3d"}} />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                      {showPassword ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <div className="flex gap-2">
                  {editando && (
                    <button onClick={() => desactivar(editando.id)}
                      className="bg-red-500/10 text-red-400 border border-red-500/20 text-sm px-3 py-3 rounded-xl hover:bg-red-500/20">
                      🗑️
                    </button>
                  )}
                  <button onClick={() => setModal(false)}
                    className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
                  <button onClick={() => guardar()} disabled={loading || !nombre || (!editando && !password)}
                    className={`flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm py-3 rounded-xl ${(loading || !nombre || (!editando && !password)) ? 'btn-shimmer' : ''}`}>
                    {loading ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
        </div>
      )}

      {/* Tab Metas */}
      {tabPrincipal === 'metas' && (
        <div className="space-y-4">
          {/* Selectores */}
          <div className="flex gap-3 flex-wrap">
            <select
              value={metasEmpleadoId}
              onChange={e => { setMetasEmpleadoId(e.target.value); cargarMetas(e.target.value, metasAnio) }}
              className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm text-white outline-none"
              style={{background:'#060a24',border:'1px solid rgba(59,130,246,0.35)'}}>
              <option value="">— Seleccionar vendedor —</option>
              {empleados.filter((e: any) => e.rol === 'vendedor' && e.activo).map((e: any) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
            <select
              value={metasAnio}
              onChange={e => { const a = parseInt(e.target.value); setMetasAnio(a); cargarMetas(metasEmpleadoId, a) }}
              className="rounded-xl px-3 py-2 text-sm text-white outline-none"
              style={{background:'#060a24',border:'1px solid rgba(59,130,246,0.35)'}}>
              {[metasAnio - 1, metasAnio, metasAnio + 1].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Tabla 12 meses */}
          {metasEmpleadoId && (
            <div className="rounded-2xl overflow-hidden" style={{background:'#060a24',border:'1px solid rgba(59,130,246,0.25)'}}>
              {/* Header */}
              <div className="grid grid-cols-3 gap-0 px-4 py-3 border-b" style={{borderColor:'rgba(59,130,246,0.20)'}}>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Mes</p>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Meta Recaudo</p>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Meta Venta</p>
              </div>
              {metasCargando ? (
                <div className="p-6 text-center text-zinc-500 text-sm">Cargando...</div>
              ) : (
                Array.from({length: 12}, (_, i) => i + 1).map(mes => {
                  const esMesActual = mes === new Date().getMonth() + 1 && metasAnio === new Date().getFullYear()
                  return (
                    <div key={mes} className={`grid grid-cols-3 gap-0 px-4 py-2.5 border-b transition-colors ${esMesActual ? 'bg-blue-500/5' : ''}`}
                      style={{borderColor:'#0c1d35'}}>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-semibold">{MESES[mes-1]}</span>
                        {esMesActual && <span className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">actual</span>}
                      </div>
                      <div className="pr-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={metasEdit[mes]?.recaudo || ''}
                          onChange={e => setMetasEdit(p => ({...p, [mes]: {...p[mes], recaudo: parseMeta(e.target.value)}}))}
                          onBlur={e => { if (e.target.value) setMetasEdit(p => ({...p, [mes]: {...p[mes], recaudo: fmtMeta(e.target.value)}})) }}
                          placeholder="Sin meta"
                          className="w-full rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-blue-500/60"
                          style={{background:'#060a24',border:'1px solid rgba(59,130,246,0.20)'}}
                        />
                      </div>
                      <div className="pr-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={metasEdit[mes]?.venta || ''}
                          onChange={e => setMetasEdit(p => ({...p, [mes]: {...p[mes], venta: parseMeta(e.target.value)}}))}
                          onBlur={e => { if (e.target.value) setMetasEdit(p => ({...p, [mes]: {...p[mes], venta: fmtMeta(e.target.value)}})) }}
                          placeholder="Sin meta"
                          className="w-full rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-blue-500/60"
                          style={{background:'#060a24',border:'1px solid rgba(59,130,246,0.20)'}}
                        />
                      </div>
                    </div>
                  )
                })
              )}
              {/* Guardar */}
              <div className="px-4 py-3">
                <button
                  onClick={guardarMetas}
                  disabled={metasGuardando}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
                  style={{background:'rgba(59,130,246,0.20)',border:'1px solid rgba(59,130,246,0.40)'}}>
                  {metasGuardando ? 'Guardando...' : '💾 Guardar metas'}
                </button>
              </div>
            </div>
          )}
          {!metasEmpleadoId && (
            <div className="rounded-2xl p-8 text-center text-zinc-500 text-sm"
              style={{background:'#060a24',border:'1px solid rgba(59,130,246,0.25)'}}>
              Selecciona un vendedor para ver y editar sus metas
            </div>
          )}
        </div>
      )}


      {tabPrincipal === 'notifica' && esAdmin && (
        <div className="fade-up space-y-3">
          {/* Header + selector empresa */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-sm">Reglas de notificaciones push</span>
            {/* Tooltip siglas */}
            <div className="relative group">
              <button className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs flex items-center justify-center">?</button>
              <div className="absolute left-0 top-7 z-50 hidden group-hover:block bg-zinc-900 border border-zinc-700 rounded-xl p-3 w-48 shadow-xl">
                <p className="text-zinc-300 text-xs font-semibold mb-2">Columnas</p>
                {[['A','Admin'],['S','Supervisor'],['V','Vendedor'],['I','Impulsadora'],['E','Entregas'],['B','Bodega']].map(([k,v]) => (
                  <p key={k} className="text-zinc-400 text-xs"><span className="text-white font-bold">{k}</span> = {v}</p>
                ))}
              </div>
            </div>
            </div>{/* flex items-center gap-2 */}
            {/* Selector empresa vinculada */}
            {notifEmpresas.length > 0 && (
              <select value={notifEmpresaTarget}
                onChange={e => { setNotifEmpresaTarget(e.target.value); const tgt = notifEmpresas.find(v => v.id === e.target.value)?.clienteId; cargarNotifReglas(tgt || undefined) }}
                className="text-xs rounded-lg px-2 py-1 text-white outline-none"
                style={{ background: '#0d1220', border: '1px solid #1e2a3d' }}>
                <option value="propia">Propia</option>
                {notifEmpresas.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            )}
          </div>{/* justify-between */}

          {notifLoading ? (
            <p className="text-zinc-500 text-sm">Cargando...</p>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
              {/* Cabecera */}
              <div style={{display:"grid", gridTemplateColumns:"260px repeat(6,36px) 48px 52px", gap:4, padding:"8px 16px", borderBottom:"1px solid #27272a"}}>
                <span className="text-zinc-500 text-xs">Evento</span>
                {[['A','empresa','Admin'],['S','supervisor','Supervisor'],['V','vendedor','Vendedor'],['I','impulsadora','Impulsadora'],['E','entregas','Entregas'],['B','bodega','Bodega']].map(([k,rol,v]) => (
                  <div key={k} className="relative flex justify-center items-center">
                    <span className="text-zinc-500 text-xs text-center" title={v}>{k}</span>
                    {rolesConSub.includes(rol) && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-500" title={`${v} tiene suscripción activa`} />
                    )}
                  </div>
                ))}
                <span className="text-zinc-500 text-xs text-center">On</span>
                <span className="text-zinc-500 text-xs text-center">Test</span>
              </div>
              {/* Filas */}
              {notifReglas.map((regla: any) => (
                <div key={regla.id} style={{display:"grid", gridTemplateColumns:"260px repeat(6,36px) 48px 52px", gap:4, padding:"10px 16px", borderBottom:"1px solid rgba(39,39,42,0.5)", alignItems:"center", opacity: regla.activa ? 1 : 0.4}}>
                  <span className="text-white text-xs whitespace-nowrap pr-4">{regla.label}</span>
                  {['empresa','supervisor','vendedor','impulsadora','entregas','bodega'].map(rol => (
                    <div key={rol} className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={regla.roles.includes(rol)}
                        disabled={!regla.activa || notifGuardando === regla.id}
                        onChange={e => toggleNotifRol(regla.id, rol, e.target.checked)}
                        className="w-4 h-4 accent-blue-500 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>
                  ))}
                  {/* Toggle activa */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => toggleNotifActiva(regla.id, !regla.activa)}
                      disabled={notifGuardando === regla.id}
                      className={`w-9 h-5 rounded-full transition-colors relative ${regla.activa ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${regla.activa ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {/* Botón test */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => testNotifRegla(regla.id)}
                      disabled={notifTesting === regla.id}
                      className="px-2 py-1 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors disabled:opacity-40">
                      {notifTesting === regla.id ? '...' : 'Test'}
                    </button>
                  </div>
                </div>
              ))}
              </div>{/* overflow-x-auto */}
            </div>
          )}
        </div>
      )}

      {popupSync && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-2">📊</div>
              <h3 className="text-white font-bold">Sincronizar cartera inicial</h3>
              <p className="text-zinc-400 text-xs mt-1">El saldo actual de UpTres se usará como base. Solo se contarán los pagos registrados en Gestor desde la fecha indicada.</p>
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Fecha de inicio de pagos</label>
              <input type="date" value={syncFecha} onChange={e => setSyncFecha(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
                style={{background:'#0d1220', border:'1px solid #1e2a3d'}} />
              <p className="text-zinc-600 text-xs mt-1">Los pagos anteriores a esta fecha no se descontarán del saldo base.</p>
              {syncPrimerRecibo && (
                <p className="text-amber-400 text-xs mt-2">⚠️ Primer recibo detectado: <strong>{syncPrimerRecibo.numeroRecibo}</strong> del {new Date(syncPrimerRecibo.fecha).toLocaleDateString('es-CO')}. Se usó como fecha de inicio.</p>
              )}
            </div>
            {syncMsg && <p className={`text-sm text-center ${syncMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{syncMsg}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setPopupSync(false); setSyncMsg('') }}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">
                Omitir
              </button>
              <button onClick={ejecutarSyncInicial} disabled={syncLoading || !syncFecha}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm py-3 rounded-xl font-semibold">
                {syncLoading ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>

    {popupSyncForm && editando && (
      <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4">
        <div className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
          style={{ background: '#0a0f28', border: '1px solid rgba(59,130,246,0.30)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(59,130,246,0.20)' }}>
            <div>
              <p className="text-white font-bold text-sm">🔗 Sincronización cartera</p>
              <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[200px]">{editando.nombre}</p>
            </div>
            <button onClick={() => { setPopupSyncForm(false); setSyncMsg('') }} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
          </div>
          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            <p className="text-zinc-400 text-xs">El saldo actual de UpTres se usará como base. Solo se contarán los pagos registrados en Gestor desde la fecha indicada.</p>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Fecha de inicio de pagos</label>
              <input type="date" value={syncFecha} onChange={e => setSyncFecha(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none"
                style={{ background: '#0d1220', border: '1px solid #1e2a3d' }} />
              {syncPrimerRecibo && (
                <p className="text-amber-400 text-xs mt-2">⚠️ Primer recibo: <strong>{syncPrimerRecibo.numeroRecibo}</strong> del {new Date(syncPrimerRecibo.fecha).toLocaleDateString('es-CO')}</p>
              )}
            </div>
            {/* Evidencia post-sync */}
            {syncEvidencia && (
              <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)' }}>
                <p className="text-emerald-400 text-sm font-bold">{syncEvidencia}</p>
                <p className="text-zinc-500 text-xs mt-1">Sincronización completada</p>
              </div>
            )}
            {syncMsg && !syncEvidencia && (
              <p className={`text-sm text-center ${syncMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{syncMsg}</p>
            )}
          </div>
          {/* Footer */}
          <div className="px-5 py-3 border-t flex gap-2" style={{ borderColor: 'rgba(59,130,246,0.20)' }}>
            <button onClick={() => { setPopupSyncForm(false); setSyncMsg('') }}
              className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {syncEvidencia ? 'Cerrar' : 'Omitir'}
            </button>
            {!syncEvidencia && (
              <button onClick={async () => {
                if (!editando || !syncFecha) return
                setSyncLoading(true); setSyncMsg('')
                const res = await fetch('/api/vendedor/sync-inicial', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ empleadoId: editando.id, syncInicioAt: new Date(syncFecha + 'T05:00:00Z').toISOString() })
                })
                const data = await res.json()
                setSyncLoading(false)
                if (data.error) { setSyncMsg('Error: ' + data.error) }
                else { setSyncEvidencia(`✅ ${data.actualizadas} deudas sincronizadas`) }
              }} disabled={syncLoading || !syncFecha}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: '1px solid rgba(59,130,246,0.50)' }}>
                {syncLoading ? 'Sincronizando...' : '🔗 Sincronizar'}
              </button>
            )}
          </div>
        </div>
      </div>
    )}

    {popupPermisos && editando && (
      <PopupPermisos
        nombreEmpleado={editando.nombre}
        permisosIniciales={permisos}
        onGuardar={guardarPermisos}
        onCerrar={() => setPopupPermisos(false)}
      />
    )}
    </>
  )
}
