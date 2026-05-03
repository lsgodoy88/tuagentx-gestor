'use client'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

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
  ]
  const [permisos, setPermisos] = useState<Record<string, boolean>>({})
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

  async function guardar() {
    setLoading(true); setError('')
    if (editando) {
      const res = await fetch('/api/empleados', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editando.id, nombre, email: emailEdit || undefined, telefono, password: password || undefined, vendedorId: vendedorId || null, puedeCapturarGps, ciudades: ciudadesAsignadas, listaIds, vendedorIds: (slotRol === 'supervisor' || editando?.rol === 'supervisor') ? vendedorIds : undefined, permisos: (slotRol === 'supervisor' || editando?.rol === 'supervisor') ? permisos : undefined, etiqueta: (slotRol === 'supervisor' || editando?.rol === 'supervisor') ? etiqueta : undefined, apiId: apiIdSeleccionado || undefined })
      })
      const data = await res.json()
      setLoading(false)
      if (data.error) { setError(data.error); return }
      setModal(false)
      loadData()
    } else {
      const res = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, rol: slotRol, telefono, password, vendedorId: vendedorId || null, ciudades: ciudadesAsignadas, listaIds, vendedorIds: slotRol === 'supervisor' ? vendedorIds : undefined, permisos: slotRol === 'supervisor' ? permisos : undefined, etiqueta: slotRol === 'supervisor' ? etiqueta : undefined })
      })
      const data = await res.json()
      setLoading(false)
      if (data.error) { setError(data.error); return }
      setResultado(data)
    }
  }

  async function desactivar(id: string) {
    if (!confirm('Desactivar este empleado?')) return
    await fetch('/api/empleados', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    loadData()
  }

  function getSlug(n: string) {
    return slugify(n) + '@' + slugify(empresaNombre)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Empleados</h1>
        <p className="text-zinc-400 text-sm mt-1">Gestiona los usuarios de tu equipo</p>
      </div>

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
                  const bloqueadoPorSupervisor =
                    modoEquipo === 'supervisores' &&
                    !haySupervisor &&
                    rc.id !== 'supervisor' &&
                    !emp
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
                            <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block w-48 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-300 shadow-xl pointer-events-none z-10">
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
                  <div key={rc.id} className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3">
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {resultado ? (
              <>
                <div className="text-center space-y-3">
                  <div className="text-4xl">✅</div>
                  <p className="text-white font-semibold">Empleado creado</p>
                  <div className="bg-zinc-800 rounded-xl p-4 text-left space-y-2">
                    <p className="text-zinc-400 text-xs">Email:</p>
                    <p className="text-emerald-400 font-mono text-sm">{resultado.email}</p>
                    <p className="text-zinc-400 text-xs mt-2">Contraseña:</p>
                    <p className="text-white font-mono text-sm">{password}</p>
                  </div>
                </div>
                <button onClick={() => { setModal(false); loadData() }}
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
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                  </div>
                )}
                {nombre && !editando && (
                  <div className="bg-zinc-800 rounded-xl p-3">
                    <p className="text-zinc-400 text-xs mb-1">Usuario:</p>
                    <p className="text-emerald-400 font-mono text-sm">{getSlug(nombre)}</p>
                  </div>
                )}
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Nombre</label>
                  <input value={nombre} onChange={e => { setNombre(e.target.value); if (!editando) setPassword(generarPasswordDefault(e.target.value, telefono)) }}
                    placeholder="Nombre del empleado"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
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
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500">
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
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500">
                      <option value="">— Sin enlazar —</option>
                      {syncEmpleados.map((s: any) => (
                        <option key={s.externalId} value={s.externalId}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
                {(slotRol === 'vendedor' || editando?.rol === 'vendedor') && listas.length > 0 && (
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Listas asignadas</label>
                    <div className="space-y-1 max-h-36 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-xl p-2">
                      {listas.map((l: any) => (
                        <label key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={listaIds.includes(l.id)}
                            onChange={e => setListaIds(prev => e.target.checked ? [...prev, l.id] : prev.filter(x => x !== l.id))}
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
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-violet-500" />
                  </div>
                )}
                {(slotRol === 'supervisor' || editando?.rol === 'supervisor') && empleados.filter(e => e.rol === 'vendedor' && e.activo).length > 0 && (
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Vendedores asignados</label>
                    <div className="space-y-1 max-h-36 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-xl p-2">
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
                  <div>
                    <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Permisos</label>
                    <div className="space-y-2 bg-zinc-800 border border-zinc-700 rounded-xl p-3">
                      {PERMISOS_CONFIG.map(p => (
                        <div key={p.key} className="flex items-center justify-between">
                          <span className="text-white text-sm">{p.label}</span>
                          <button type="button" onClick={() => setPermisos(prev => {
                            const next = { ...prev, [p.key]: !prev[p.key] }
                            if (next[p.key]) {
                              if (p.key === 'editarClientes')   next.verClientes = true
                              if (p.key === 'registrarVisitas') next.verVisitas = true
                              if (p.key === 'asignarRutas')     next.verRutas = true
                            } else {
                              if (p.key === 'verClientes')  next.editarClientes = false
                              if (p.key === 'verVisitas')   next.registrarVisitas = false
                              if (p.key === 'verRutas')     next.asignarRutas = false
                            }
                            return next
                          })}
                            className={"w-10 h-5 rounded-full transition-colors flex-shrink-0 " + (permisos[p.key] ? "bg-violet-500" : "bg-zinc-600")}>
                            <div className={"w-4 h-4 bg-white rounded-full transition-transform mx-0.5 " + (permisos[p.key] ? "translate-x-5" : "translate-x-0")} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(slotRol === 'vendedor' || slotRol === 'entregas' || editando?.rol === 'vendedor' || editando?.rol === 'entregas') && (
                  <div className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3">
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
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500"
                      />
                      {ciudadesSugeridas.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
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
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 pr-10 text-white text-sm outline-none focus:border-emerald-500" />
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
                  <button onClick={guardar} disabled={loading || !nombre || (!editando && !password)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm py-3 rounded-xl">
                    {loading ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
