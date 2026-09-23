'use client'
import type { UseMetas } from '../_lib/useMetas'
import { MESES } from '../_lib/tipos'
import { fmtMeta, parseMeta } from '../_lib/utils'

export default function TabMetas({ metas, empleados }: { metas: UseMetas; empleados: any[] }) {
  const {
    metasEmpleadoId, setMetasEmpleadoId,
    metasAnio, setMetasAnio,
    metasEdit, setMetasEdit,
    metasCargando,
    metasGuardando,
    metasDirty, setMetasDirty,
    cargarMetas,
    guardarMetas,
  } = metas

  return (
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
                      onChange={e => { setMetasEdit(p => ({...p, [mes]: {...p[mes], recaudo: parseMeta(e.target.value)}})); setMetasDirty(true) }}
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
                      onChange={e => { setMetasEdit(p => ({...p, [mes]: {...p[mes], venta: parseMeta(e.target.value)}})); setMetasDirty(true) }}
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
              disabled={metasGuardando || !metasDirty}
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
  )
}
