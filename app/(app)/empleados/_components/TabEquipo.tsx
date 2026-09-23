'use client'
import type { UseEmpleados } from '../_lib/useEmpleados'
import { ROLES_CONFIG, ROL_SINGULAR } from '../_lib/tipos'
import PlanActualCard from './PlanActualCard'
import ModalEmpleado from './ModalEmpleado'
import { PopupSyncInicial } from './PopupSyncCartera'

export default function TabEquipo({ emp, esAdmin, esSupervisor, puedeEditarEmpleados, tieneIntegracion }: {
  emp: UseEmpleados
  esAdmin: boolean
  esSupervisor: boolean
  puedeEditarEmpleados: boolean
  tieneIntegracion: boolean
}) {
  const {
    empleados,
    limites,
    empresaId,
    precios,
    enMora,
    storageData,
    cantidades, setCantidades,
    ampliarAbierto, setAmpliarAbierto,
    abrirSlot,
    eliminarSlotVacio,
  } = emp

  return (
    <div className="space-y-4">
      {/* Plan actual — primero */}
      {esAdmin && empresaId && Object.keys(precios).length > 0 && (() => {
        const slotMap: Record<string, string> = { vendedor:'maxVendedores', supervisor:'maxSupervisores', bodega:'maxBodega', entregas:'maxEntregas', impulsadora:'maxImpulsadoras' }
        const resumen = Object.entries(slotMap)
          .map(([rol, key]) => { const activos = limites[key] ?? 0; const precio = precios[rol] ?? 0; return { rol, activos, precio, subtotal: activos * precio } })
          .filter(r => r.activos > 0)
        if (resumen.length === 0) return null
        const totalEmpleados = resumen.reduce((s, r) => s + r.activos, 0)
        return <PlanActualCard resumen={resumen} totalEmpleados={totalEmpleados} empresaId={empresaId} limites={limites} precios={precios} montoNegociado={limites.montoNegociado ?? null} billingEstado={enMora} />
      })()}

      {/* Card Almacenamiento Nube */}
      {esAdmin && (
        <a href="/configuracion/almacenamiento" className="block bg-zinc-900 border border-zinc-800 rounded-2xl" style={{padding:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}>
            <span className="text-white font-semibold text-sm">☁️ Almacenamiento Nube</span>
            <span className="text-white text-xs opacity-70">{storageData ? `${storageData.totalMb.toFixed(1)} MB / ${storageData.limiteGb} GB` : '...'}</span>
          </div>
          <div style={{width:'100%',background:'#27272a',borderRadius:9999,height:10,overflow:'hidden',display:'flex'}}>
            {storageData?.alerta ? (
              <>
                <div style={{height:10,background:'#3b82f6',borderRadius:'9999px 0 0 9999px',width:`${storageData.limiteBytes>0?(800*1024*1024/storageData.limiteBytes*100):0}%`}} />
                <div style={{height:10,background:'#f97316',borderRadius:'0 9999px 9999px 0',width:`${Math.min(storageData.porcentaje-(storageData.limiteBytes>0?(800*1024*1024/storageData.limiteBytes*100):0),100-(storageData.limiteBytes>0?(800*1024*1024/storageData.limiteBytes*100):0))}%`}} />
              </>
            ) : (
              <div style={{height:10,background:'#3b82f6',borderRadius:9999,width:`${Math.min(storageData?.porcentaje??0,100)}%`,transition:'all 0.3s'}} />
            )}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
            <span className="text-white text-xs opacity-60">{storageData ? `${storageData.porcentaje.toFixed(1)}% utilizado` : ''}</span>
            <span className="text-white text-xs opacity-60">{storageData ? `${((storageData.limiteBytes-storageData.totalBytes)/1024/1024).toFixed(0)} MB disponibles` : ''}</span>
          </div>
          {storageData?.alerta && <p className="text-orange-400 text-xs" style={{marginTop:8}}>⚠️ Espacio casi agotado &nbsp;&nbsp;Compra capacidad en la Nube.</p>}
        </a>
      )}



      {(() => {
        const haySupervisor = empleados.some(e => e.rol === 'supervisor' && e.activo)
        const rolesVisibles = ROLES_CONFIG.filter(rc =>
          true
        )
        return rolesVisibles.map(rc => {
          const max = limites[rc.maxKey] || 0
          const empRolTotal = empleados.filter(e => e.rol === rc.id) // activos + inactivos, orden de BD
          if (max === 0) return null
          return (
            <div key={rc.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3" style={{borderBottom:"1px solid rgba(37,99,235,.15)"}}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{rc.icon}</span>
                  <span className="text-white font-semibold">{rc.label}</span>
                </div>
                <span className="text-zinc-500 text-xs">{empRolTotal.filter((e:any)=>e.activo).length}/{max}</span>
              </div>
              <div className="p-3 space-y-2">
                {Array.from({ length: max }).map((_, i) => {
                  const empSlot = empRolTotal[i]
                  const emp2 = empSlot?.activo ? empSlot : null
                  const inactivo = !emp2 && !!empSlot
                  const vacio = !empSlot
                  const bloqueadoPorSupervisor = false
                  return (
                    <div key={i} className={"flex items-center gap-3 px-3 py-2.5 rounded-xl " + (emp2 ? "bg-zinc-800" : inactivo ? "bg-zinc-800/50 border border-dashed border-red-900" : "bg-zinc-900 border border-dashed border-zinc-700")}>
                      <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 " + (emp2 ? "bg-emerald-500/20 text-emerald-400" : inactivo ? "bg-red-500/20 text-red-400" : "bg-zinc-800 text-zinc-600")}>
                        {empSlot ? empSlot.nombre[0].toUpperCase() : (i + 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {empSlot ? (
                          <>
                            <p className={"text-sm font-medium " + (emp2 ? "text-white" : "text-red-400")}>{empSlot.nombre}</p>
                            <p className="text-zinc-500 text-xs font-mono">{empSlot.email}</p>
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
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {!empSlot && empRolTotal.length < max && (() => {
                              // Mostrar "Eliminar" solo en el último slot vacío (mayor índice sin empleado activo o inactivo)
                              const ultimoVacioIdx = max - 1 - Array.from({length: max}).reverse().findIndex((_, ri) => !empRolTotal[max - 1 - ri])
                              return i === ultimoVacioIdx
                            })() && puedeEditarEmpleados && (
                              <button
                                onClick={() => eliminarSlotVacio(rc.id)}
                                className="text-xs px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors">
                                Borrar
                              </button>
                            )}
                            {puedeEditarEmpleados && <button onClick={() => abrirSlot(rc.id, i + 1, empSlot)}
                              className={"relative text-xs px-3 py-1.5 rounded-lg " + (empSlot ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300" : "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold")}>
                              {empSlot ? 'Editar' : 'Configurar'}
                              {emp2 && rc.id === 'vendedor' && tieneIntegracion && emp2.apiId && !emp2.syncInicioAt && (
                                <span style={{ position: 'absolute', top: -6, right: -6, fontSize: 13, lineHeight: 1 }}>⚠️</span>
                              )}
                            </button>}
                          </div>
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
          true
        )
        const total = rolesAmpliables.reduce((sum, rc) => sum + (cantidades[rc.id] ?? 0) * (precios[rc.id] ?? 0), 0)
        const rolesSeleccionados: Record<string, number> = {}
        for (const rc of rolesAmpliables) {
          const c = cantidades[rc.id] ?? 0
          if (c > 0) rolesSeleccionados[rc.id] = c
        }
        const url = total > 0
          ? null
          : ''
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2 cursor-pointer select-none" onClick={() => setAmpliarAbierto(a => !a)}>
              <div className="flex-1">
                <div className="text-white font-semibold text-sm">Ampliar equipo</div>
                <div className="text-zinc-500 text-xs mt-0.5">Agrega slots por rol</div>
              </div>
              <span className="text-zinc-500 text-xs">{ampliarAbierto ? '▲' : '▼'}</span>
            </div>
            {ampliarAbierto && <div className="p-3 space-y-2 border-t border-zinc-800">
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
                        <div className="text-blue-400 text-xs font-semibold">
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
            </div>}
            <div className="px-3 pb-3 border-t border-zinc-800 pt-2">
              <button
                disabled={total === 0}
                onClick={async () => {
                  if (total === 0) return
                  try {
                    const res = await fetch('/api/pagos/link', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        monto: total,
                        roles: Object.fromEntries(
                          Object.entries(cantidades).filter(([, v]) => (v as number) > 0)
                        ),
                      }),
                    })
                    const d = await res.json()
                    if (d.linkPago) window.open(d.linkPago, '_blank', 'noopener,noreferrer')
                  } catch {}
                }}
                className="w-full py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-700 text-white">
                {total === 0 ? 'Selecciona empleados para agregar' : `💳 Pagar $${total.toLocaleString('es-CO')}/mes`}
              </button>
            </div>
          </div>
        )
      })()}

      <ModalEmpleado emp={emp} esAdmin={esAdmin} esSupervisor={esSupervisor} tieneIntegracion={tieneIntegracion} />

      <PopupSyncInicial emp={emp} />
    </div>
  )
}
