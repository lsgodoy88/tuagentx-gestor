'use client'
import type { UseEmpleados } from '../_lib/useEmpleados'

export default function PopupAsignacionInicial({ emp }: { emp: UseEmpleados }) {
  const {
    popupAsignacion, setPopupAsignacion,
    editando, setEditando,
    nombre, setNombre,
    empleados,
    syncEmpleados,
    listas,
    listaIds, setListaIds,
    apiIdSeleccionado, setApiIdSeleccionado,
    asigMsg, setAsigMsg,
    asigLoading, setAsigLoading,
    loadData,
  } = emp

  if (!popupAsignacion) return null

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#0a0f28', border: '1px solid rgba(16,185,129,0.30)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(16,185,129,0.20)' }}>
          <div>
            <p className="text-white font-bold text-sm">👤 Asignación inicial</p>
            <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[200px]">{editando?.nombre || nombre || 'Nuevo vendedor'}</p>
          </div>
          <button onClick={() => { setPopupAsignacion(false); setAsigMsg('') }} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-zinc-400 text-xs">Enlaza el vendedor con su empleado en UpTres y asigna su lista de clientes.</p>
          {(() => {
            // apiIds ya usados por otros vendedores (excluir el actual)
            const apiIdsUsados = new Set(
              empleados.filter((e: any) => e.rol === 'vendedor' && e.apiId && e.id !== editando?.id).map((e: any) => e.apiId)
            )
            const listaIdsUsados = new Set(
              empleados.filter((e: any) => e.rol === 'vendedor' && e.id !== editando?.id)
                .flatMap((e: any) => e.listasAsignadas?.map((l: any) => l.listaId) || [])
            )
            // Disponibles = no usados por otros + incluir el propio si ya tiene asignado
            const syncDisponibles = syncEmpleados.filter((s: any) =>
              !apiIdsUsados.has(s.externalId) || s.externalId === editando?.apiId
            )
            const listaIdActual = editando?.listasAsignadas?.[0]?.listaId
            const listasDisponibles = listas.filter((l: any) =>
              !listaIdsUsados.has(l.id) || l.id === listaIdActual
            )
            return (<>
              {syncDisponibles.length > 0 && (
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Empleado UpTres</label>
                  <select value={apiIdSeleccionado} onChange={e => {
                    setApiIdSeleccionado(e.target.value)
                    const s = syncDisponibles.find((s: any) => s.externalId === e.target.value)
                    if (s && !nombre) setNombre(s.nombre)
                  }}
                    className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none" style={{ background: '#0d1220', border: '1px solid #1e2a3d' }}>
                    <option value="">— Sin enlazar —</option>
                    {syncDisponibles.map((s: any) => (
                      <option key={s.externalId} value={s.externalId}>{s.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
              {listasDisponibles.length > 0 && (
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Lista de clientes</label>
                  <div className="space-y-1 max-h-36 overflow-y-auto rounded-xl p-2" style={{ background: '#0d1220', border: '1px solid #1e2a3d' }}>
                    {listasDisponibles.map((l: any) => (
                      <label key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-700 cursor-pointer">
                        <input type="radio" name="listaAsigPopup" checked={listaIds.includes(l.id)}
                          onChange={() => setListaIds([l.id])} className="accent-emerald-500" />
                        <span className="text-white text-sm">{l.nombre}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {syncDisponibles.length === 0 && <p className="text-amber-400 text-xs">Todos los empleados UpTres ya están asignados.</p>}
              {listasDisponibles.length === 0 && listas.length > 0 && <p className="text-amber-400 text-xs">Todas las listas ya están asignadas.</p>}
            </>)
          })()}
          {asigMsg && <p className={`text-sm text-center ${asigMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{asigMsg}</p>}
        </div>
        <div className="px-5 py-3 border-t flex gap-2" style={{ borderColor: 'rgba(16,185,129,0.20)' }}>
          <button onClick={() => { setPopupAsignacion(false); setAsigMsg('') }}
            className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Cancelar
          </button>
          <button disabled={asigLoading || !apiIdSeleccionado || listaIds.length === 0}
            onClick={async () => {
              if (!editando) {
                // Nuevo vendedor — solo guardar en estado local, se envía al Crear
                setPopupAsignacion(false)
                return
              }
              setAsigLoading(true); setAsigMsg('')
              try {
                const res = await fetch('/api/empleados', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: editando.id, nombre: editando.nombre, apiId: apiIdSeleccionado, listaIds, confirmarReduccionListas: true })
                })
                const data = await res.json()
                if (data.error) { setAsigMsg('Error: ' + data.error) }
                else {
                  setAsigMsg('✅ Asignación guardada')
                  setEditando((prev: any) => ({ ...prev, apiId: apiIdSeleccionado }))
                  await loadData()
                  setTimeout(() => { setPopupAsignacion(false); setAsigMsg('') }, 1200)
                }
              } catch { setAsigMsg('Error de conexión') }
              setAsigLoading(false)
            }}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)', border: '1px solid rgba(16,185,129,0.50)' }}>
            {asigLoading ? 'Guardando...' : '✓ Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
