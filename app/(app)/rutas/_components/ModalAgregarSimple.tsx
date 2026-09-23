'use client'
import type { UseEditarRuta } from '../_lib/useEditarRuta'

export default function ModalAgregarSimple({ er }: { er: UseEditarRuta }) {
  const {
    modalSimpleRuta, cerrarModalSimple,
    buscarSup, setBuscarSup, setPageSup, loadClientesSup, selSup, setSelSup,
    clientesSup, totalSup, LIMIT_SUP, pageSup, savingSup, agregarClienteSimple,
  } = er

  if (!modalSimpleRuta) return null

  return (
    <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-50 pt-4 px-4 pb-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto pb-6">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold">➕ Agregar cliente</h3>
            <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[200px]">{modalSimpleRuta.nombre}</p>
          </div>
          <button onClick={cerrarModalSimple} className="text-zinc-400 hover:text-white text-xl">×</button>
        </div>
        <div className="p-6 space-y-4">
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
          <div className="flex gap-2 pt-2">
            <button onClick={cerrarModalSimple}
              className="flex-1 bg-zinc-800 text-white text-sm py-3 rounded-xl">Cancelar</button>
            <button onClick={agregarClienteSimple} disabled={savingSup || selSup.length === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm py-3 rounded-xl">
              {savingSup ? 'Agregando...' : `Agregar${selSup.length > 0 ? ` ${selSup.length}` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
