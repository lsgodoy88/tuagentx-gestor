'use client'

interface Props {
  seleccionados: string[]
  totalVisibles: number
  repartidores: any[]
  asignarTodasRepartidor: string
  setAsignarTodasRepartidor: (v: string) => void
  asignandoTodas: boolean
  modalEnviarMasivo: boolean
  setModalEnviarMasivo: (v: boolean) => void
  onToggleAll: () => void
  onCancelar: () => void
  onEnviarMasivo: (repartidorId: string) => void
}

export default function BarraSeleccionMasiva({
  seleccionados, totalVisibles, repartidores,
  asignarTodasRepartidor, setAsignarTodasRepartidor,
  asignandoTodas, modalEnviarMasivo, setModalEnviarMasivo,
  onToggleAll, onCancelar, onEnviarMasivo,
}: Props) {
  return (
    <>
      {/* Barra fija */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 z-[1050] bg-zinc-950 border-t-2 border-blue-500 px-4 pt-3 pb-6 flex items-center gap-3 shadow-2xl">
        <button
          onClick={onCancelar}
          className="text-white text-sm px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-600 font-semibold">
          ✕
        </button>
        <button
          onClick={onToggleAll}
          className="text-white text-sm px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-600 font-semibold">
          {seleccionados.length === totalVisibles ? '☑ Todos' : '☐ Todos'}
        </button>
        <span className="text-white text-sm font-semibold flex-1">{seleccionados.length} selec.</span>
        {seleccionados.length > 0 && (
          <button
            onClick={() => {
              if (repartidores.length === 1) setAsignarTodasRepartidor(repartidores[0].id)
              else if (repartidores.length > 1 && !asignarTodasRepartidor) setAsignarTodasRepartidor(repartidores[0].id)
              setModalEnviarMasivo(true)
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
            🚚 Enviar {seleccionados.length}
          </button>
        )}
      </div>

      {/* Modal repartidor */}
      {modalEnviarMasivo && (
        <div className="fixed inset-0 z-[1100] bg-black/95 flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold">Asignar repartidor</p>
              <span className="text-zinc-400 text-sm">
                {seleccionados.length} orden{seleccionados.length > 1 ? 'es' : ''}
              </span>
            </div>
            <select
              value={asignarTodasRepartidor}
              onChange={e => setAsignarTodasRepartidor(e.target.value)}
              className="w-full rounded-xl px-3 py-3 text-white text-sm"
              style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
              <option value="">— Selecciona repartidor —</option>
              {repartidores.map((r: any) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setModalEnviarMasivo(false)}
                className="flex-1 bg-zinc-800 text-white py-3 rounded-xl text-sm">
                Cancelar
              </button>
              <button
                onClick={() => onEnviarMasivo(asignarTodasRepartidor)}
                disabled={asignandoTodas || !asignarTodasRepartidor}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold">
                {asignandoTodas ? 'Enviando...' : '🚚 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
