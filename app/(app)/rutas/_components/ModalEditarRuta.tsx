'use client'
import type { UseEditarRuta } from '../_lib/useEditarRuta'

export default function ModalEditarRuta({ er, empleados }: { er: UseEditarRuta; empleados: any[] }) {
  const {
    modalEditar, editando, nombre, setNombre, fecha, setFecha,
    guardarEdicion, loading, cerrarModalEditar,
    tabEditar, setTabEditar, pedidosVinculados,
    empSeleccionados, toggleEmp,
    buscarSup, setBuscarSup, setPageSup, loadClientesSup, selSup, setSelSup,
    clientesSup, totalSup, LIMIT_SUP, pageSup, savingSup,
    agregarClientesEditar, selVinculadas, setSelVinculadas, loadingVinculadas,
    agregarVinculadosEditar,
  } = er

  if (!modalEditar || !editando) return null

  return (
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
                    <button key={c.id} onClick={() => setSelSup((prev: string[]) => sel ? prev.filter(x => x !== c.id) : [...prev, c.id])}
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
                      <button key={p.id} onClick={() => setSelVinculadas((prev: string[]) => sel ? prev.filter(x => x !== p.id) : [...prev, p.id])}
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
  )
}
