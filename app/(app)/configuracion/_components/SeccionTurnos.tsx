'use client'
import { Seccion } from './Seccion'
import { labelClass } from '../_lib/utils'
import type { ConfigEntregas } from '../_lib/useConfigEntregas'



interface Props extends ConfigEntregas {
  isOpen: boolean
  onToggle: () => void
}

export function SeccionTurnos({ isOpen, onToggle, ...cfg }: Props) {
  const {
    horaInicio, setHoraInicio, horaFin, setHoraFin,
    autoCrearRuta, setAutoCrearRuta,
    autoCerrarRuta, setAutoCerrarRuta,
    autoAbrirTurno, setAutoAbrirTurno,
    autoCerrarTurno, setAutoCerrarTurno,
    diasCrear, diasCerrar, toggleDia,
    msgRutas, savingRutas, guardarConfigEntregas,
  } = cfg

  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <Seccion titulo="Turnos" icono="⏱️" isOpen={isOpen} onToggle={onToggle}>
      <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-3">Rutas</p>

      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-white text-sm">Auto-crear ruta diaria</p>
          <p className="text-zinc-500 text-xs">Crea rutas automáticamente a la hora de inicio</p>
        </div>
        <button onClick={() => setAutoCrearRuta(p => !p)}
          className={`relative w-11 h-6 rounded-full transition-colors ${autoCrearRuta ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoCrearRuta ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {autoCrearRuta && (
        <div className="space-y-2 pl-1">
          <div>
            <label className={labelClass}>Hora inicio</label>
            <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className="w-full modal-inner-card rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className={labelClass}>Días</label>
            <div className="flex gap-1">
              {DIAS.map((dia, i) => (
                <button key={i} onClick={() => toggleDia('inicio', i)}
                  className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${diasCrear.includes(i) ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                  {dia}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-white text-sm">Auto-cerrar ruta diaria</p>
          <p className="text-zinc-500 text-xs">Cierra rutas automáticamente a la hora de fin</p>
        </div>
        <button onClick={() => setAutoCerrarRuta(p => !p)}
          className={`relative w-11 h-6 rounded-full transition-colors ${autoCerrarRuta ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoCerrarRuta ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {autoCerrarRuta && (
        <div className="space-y-2 pl-1">
          <div>
            <label className={labelClass}>Hora fin</label>
            <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className="w-full modal-inner-card rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className={labelClass}>Días</label>
            <div className="flex gap-1">
              {DIAS.map((dia, i) => (
                <button key={i} onClick={() => toggleDia('fin', i)}
                  className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${diasCerrar.includes(i) ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                  {dia}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <hr className="border-zinc-800 my-3" />
      <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-3">Vendedores y Supervisores</p>

      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-white text-sm">Auto-abrir turno diario</p>
          <p className="text-zinc-500 text-xs">Abre turno automáticamente a la hora de inicio (sin GPS)</p>
        </div>
        <button onClick={() => setAutoAbrirTurno(p => !p)}
          className={`relative w-11 h-6 rounded-full transition-colors ${autoAbrirTurno ? 'bg-blue-600' : 'bg-zinc-700'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoAbrirTurno ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-white text-sm">Auto-cerrar turno diario</p>
          <p className="text-zinc-500 text-xs">Cierra turnos activos automáticamente a la hora de fin</p>
        </div>
        <button onClick={() => setAutoCerrarTurno(p => !p)}
          className={`relative w-11 h-6 rounded-full transition-colors ${autoCerrarTurno ? 'bg-blue-600' : 'bg-zinc-700'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoCerrarTurno ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <p className="text-zinc-600 text-xs mt-1 mb-3">Usa las mismas horas y días configurados en Despachos.</p>
      {msgRutas && <p className="text-sm text-emerald-400">{msgRutas}</p>}
      <button onClick={guardarConfigEntregas} disabled={savingRutas}
        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
        {savingRutas ? 'Guardando...' : 'Guardar'}
      </button>
    </Seccion>
  )
}
