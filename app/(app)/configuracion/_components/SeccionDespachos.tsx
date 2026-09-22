'use client'
import { Seccion } from './Seccion'
import { labelClass } from '../_lib/utils'
import type { ConfigEntregas } from '../_lib/useConfigEntregas'



interface Props extends ConfigEntregas {
  isOpen: boolean
  onToggle: () => void
  conectadas: any[]
}

export function SeccionDespachos({ isOpen, onToggle, conectadas, ...cfg }: Props) {
  const {
    tieneBodega, bodegaPuedeEnviar, setBodegaPuedeEnviar,
    ciudadEntregaLocal, setCiudadEntregaLocal,
    diasHistorialBodega, setDiasHistorialBodega,
    fechaInicioBodegaPropia, setFechaInicioBodegaPropia,
    sincInicioMsg, msgRutas, savingRutas,
    clientes, guardarConfigEntregas, guardarFechaInicioBodegaPropia,
  } = cfg

  if (!tieneBodega && conectadas.length === 0) return null

  return (
    <Seccion titulo="Despachos" icono="🚚" isOpen={isOpen} onToggle={onToggle}>
      <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-3">Bodega y Despachos</p>

      {!tieneBodega && conectadas.length > 0 && conectadas[0]?.configDuena && (() => {
        const cfgDuena = conectadas[0].configDuena
        return (
          <div className="space-y-3">
            <p className="text-zinc-500 text-xs">🔗 Configuración de <span className="text-white font-semibold">{conectadas[0].nombreEmpresaPrincipal}</span> (solo lectura)</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Hora inicio ruta', val: cfgDuena.horaInicioRuta },
                { label: 'Hora fin ruta', val: cfgDuena.horaFinRuta },
                { label: 'Ciudad entrega local', val: cfgDuena.ciudadEntregaLocal ?? 'Todas por transportadora' },
                { label: 'Días historial bodega', val: cfgDuena.diasHistorialBodega },
              ].map(({ label, val }) => (
                <div key={label} className="rounded-xl px-3 py-2.5 bg-zinc-900 border border-zinc-800">
                  <p className="text-zinc-500 text-xs mb-0.5">{label}</p>
                  <p className="text-white text-sm font-medium">{val ?? '—'}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              {[
                { label: 'Bodega puede enviar', val: cfgDuena.bodegaPuedeEnviar },
                { label: 'Auto abrir turno', val: cfgDuena.autoAbrirTurno },
              ].map(({ label, val }) => (
                <div key={label} className="rounded-xl px-3 py-2.5 bg-zinc-900 border border-zinc-800 flex-1 flex items-center justify-between">
                  <p className="text-zinc-400 text-xs">{label}</p>
                  <span className={`text-xs font-semibold ${val ? 'text-emerald-400' : 'text-zinc-600'}`}>{val ? 'Sí' : 'No'}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {bodegaPuedeEnviar && (
        <>
          <div>
            <label className={labelClass}>Ciudad entrega local</label>
            <select value={ciudadEntregaLocal} onChange={e => setCiudadEntregaLocal(e.target.value)} className="w-full modal-inner-card rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500">
              <option value="">Sin entrega local (todo por transportadora)</option>
              {[...new Set((clientes || []).map((c: any) => c.ciudad?.split('/').pop()?.trim()).filter(Boolean))].sort().map((ciudad: any) => (
                <option key={ciudad} value={ciudad}>{ciudad}</option>
              ))}
            </select>
            <p className="text-zinc-600 text-xs mt-1">Órdenes con esta ciudad se asignan a repartidor local; las demás van por transportadora.</p>
          </div>
          <div>
            <label className={labelClass}>Días historial bodega</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setDiasHistorialBodega(Math.max(1, diasHistorialBodega - 1))} className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-lg font-bold flex items-center justify-center">−</button>
              <span className="text-white font-semibold w-8 text-center">{diasHistorialBodega}</span>
              <button onClick={() => setDiasHistorialBodega(Math.min(90, diasHistorialBodega + 1))} className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-lg font-bold flex items-center justify-center">+</button>
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-white text-sm">Permitir que bodega envíe a despacho</p>
          <p className="text-zinc-500 text-xs">El rol bodega puede asignar repartidor o ingresar guía</p>
        </div>
        <button onClick={() => setBodegaPuedeEnviar(p => !p)}
          className={`relative w-11 h-6 rounded-full transition-colors ${bodegaPuedeEnviar ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${bodegaPuedeEnviar ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {bodegaPuedeEnviar && (
        <div className="border-t border-zinc-800 pt-4 mt-2">
          <label className="text-zinc-400 text-xs font-semibold block mb-1">Inicio de pendientes en bodega</label>
          <p className="text-zinc-500 text-xs mb-2">Órdenes anteriores a esta fecha quedan inactivas automáticamente (solo una vez).</p>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="date" value={fechaInicioBodegaPropia}
              onChange={e => setFechaInicioBodegaPropia(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            <button onClick={() => guardarFechaInicioBodegaPropia(fechaInicioBodegaPropia)}
              disabled={!fechaInicioBodegaPropia}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors">
              Guardar y sincronizar
            </button>
          </div>
          {sincInicioMsg && <p className="text-emerald-400 text-xs mt-2">{sincInicioMsg}</p>}
        </div>
      )}

      {msgRutas && <p className="text-sm text-emerald-400">{msgRutas}</p>}
      {tieneBodega && (
        <button onClick={guardarConfigEntregas} disabled={savingRutas}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
          {savingRutas ? 'Guardando...' : 'Guardar'}
        </button>
      )}
    </Seccion>
  )
}
