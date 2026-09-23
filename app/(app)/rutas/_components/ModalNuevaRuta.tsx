'use client'
import type { UseCrearRuta } from '../_lib/useCrearRuta'

export default function ModalNuevaRuta({ cr, empleados }: { cr: UseCrearRuta; empleados: any[] }) {
  const {
    modal, paso, setPaso, nombre, fecha, setFecha,
    empSeleccionado, setEmpSeleccionado, empSeleccionados, setEmpSeleccionados, setNombre,
    cliSeleccionados, buscarCli, setBuscarCli, pageCli, setPageCli,
    clientesFiltrados, totalCli, LIMIT_CLI,
    loading, modalRef, cliListRef,
    toggleCli, crear, resetModal, loadClientes, nombreAuto,
  } = cr

  if (!modal) return null

  return (
    <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-50 pt-4 px-4 pb-4" >
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
                  className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
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
                className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
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
                className={`flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl ${(loading) ? 'btn-shimmer' : ''}`}>
                {loading ? 'Guardando...' : 'Crear ruta'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
