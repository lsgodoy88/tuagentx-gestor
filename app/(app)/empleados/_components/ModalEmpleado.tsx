'use client'
import type { UseEmpleados } from '../_lib/useEmpleados'
import { ROLES_CONFIG } from '../_lib/tipos'
import { getSlug } from '../_lib/utils'

export default function ModalEmpleado({ emp, esAdmin, esSupervisor, tieneIntegracion }: {
  emp: UseEmpleados
  esAdmin: boolean
  esSupervisor: boolean
  tieneIntegracion: boolean
}) {
  const {
    modal, setModal,
    slotRol, slotNum,
    editando, setEditando,
    emailEdit, setEmailEdit,
    nombre, setNombre,
    telefono, setTelefono,
    telefonoValido, setTelefonoValido,
    password, setPassword,
    showPassword, setShowPassword,
    generarPasswordDefault,
    vendedorId, setVendedorId,
    listaIds, setListaIds,
    empleados,
    empresaNombre,
    permisos,
    popupPermisos, setPopupPermisos,
    puedeCapturarGps, setPuedeCapturarGps,
    ciudadesAsignadas, setCiudadesAsignadas,
    ciudadBusqueda, setCiudadBusqueda,
    colombiaData,
    ciudadesSugeridas, setCiudadesSugeridas,
    resultado,
    error,
    loading,
    apiIdSeleccionado, setApiIdSeleccionado,
    confirmToggle, setConfirmToggle,
    syncEmpleadoId, setSyncEmpleadoId,
    setPopupSync,
    setSyncMsg,
    setSyncEvidencia,
    setSyncPrimerRecibo,
    setSyncFecha,
    popupSync,
    setPopupAsignacion,
    asigMsg, setAsigMsg,
    setPopupSyncForm,
    guardar,
    toggleActivo,
    loadData,
  } = emp

  if (!modal) return null

  return (
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
                <p className="text-emerald-400 font-mono text-sm">{getSlug(nombre, empresaNombre)}</p>
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
            {(slotRol === 'vendedor' || editando?.rol === 'vendedor') && tieneIntegracion && (
              <div className="space-y-2">
                {/* Botón Asignación inicial — requiere nombre+email+teléfono primero */}
                <button type="button"
                  disabled={!editando && !nombre}
                  onClick={() => { setAsigMsg(''); setPopupAsignacion(true) }}
                  className={"w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors " + (!editando && !nombre ? "opacity-40 cursor-not-allowed" : "hover:opacity-90")}
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.30)' }}>
                  <div className="flex items-center gap-2">
                    <span>👤</span>
                    <span className="text-white text-sm font-semibold">Asignación inicial</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(editando?.apiId || (!editando && apiIdSeleccionado))
                      ? <span className="text-emerald-400 text-xs">✓ Asignado</span>
                      : <span className="text-zinc-500 text-xs">Requerido</span>}
                    <span className="text-zinc-500 text-xs">›</span>
                  </div>
                </button>
                {/* Botón Sincronización cartera — activo solo si tiene apiId */}
                <button type="button" disabled={!editando?.apiId}
                  onClick={async () => {
                    if (!editando?.apiId) return
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
                  className={"w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors " + (editando?.apiId ? "hover:opacity-90" : "opacity-40 cursor-not-allowed")}
                  style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.30)' }}>
                  <div className="flex items-center gap-2">
                    <span>🔗</span>
                    <span className="text-white text-sm font-semibold">Sincronización cartera</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {editando?.syncInicioAt
                      ? <span className="text-emerald-400 text-xs">✅ {editando.syncDeudas ?? 0} deudas sincronizadas</span>
                      : <span className="text-zinc-500 text-xs">{editando?.apiId ? 'Configurar' : 'Requiere asignación'}</span>}
                    <span className="text-zinc-500 text-xs">›</span>
                  </div>
                </button>
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
                <div className="relative">
                  <button
                    onClick={() => setConfirmToggle(true)}
                    className="text-2xl px-2 py-1 rounded-xl hover:bg-zinc-800 transition-colors"
                    title={editando.activo ? 'Inactivar empleado' : 'Activar empleado'}>
                    {editando.activo ? '🚫' : '✅'}
                  </button>
                  {confirmToggle && (
                    <div className="absolute bottom-12 left-0 z-50 bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-xl w-48">
                      <p className="text-white text-xs font-semibold mb-2">
                        {editando.activo ? '¿Inactivar este empleado?' : '¿Activar este empleado?'}
                      </p>
                      <p className="text-zinc-500 text-xs mb-3">
                        {editando.activo ? 'No podrá iniciar sesión.' : 'Podrá iniciar sesión nuevamente.'}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmToggle(false)}
                          className="flex-1 py-1.5 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white">
                          Cancelar
                        </button>
                        <button onClick={() => { setConfirmToggle(false); toggleActivo(editando.id, editando.activo) }}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-white ${editando.activo ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                          {editando.activo ? 'Inactivar' : 'Activar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => setModal(false)}
                className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
              <button onClick={() => guardar()} disabled={loading || !nombre || (!editando && !password) || (!editando && slotRol === 'vendedor' && tieneIntegracion && !apiIdSeleccionado)}
                className={`flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm py-3 rounded-xl ${(loading || !nombre || (!editando && !password)) ? 'btn-shimmer' : ''}`}>
                {loading ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
