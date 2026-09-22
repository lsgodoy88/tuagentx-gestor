'use client'
import { GaleriaState } from '../_lib/tipos'
import { formatFechaCorta } from '../_lib/utils'

interface Props {
  galeria: GaleriaState
  onClose: () => void
  onNav: (index: number) => void
}

export default function ModalGaleria({ galeria, onClose, onNav }: Props) {
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-1.5">
        <div>
          <span className="text-zinc-400 text-sm">
            {galeria.esFirma ? '📷 Foto entrega' : '🖼️ Foto'}{' '}
            {galeria.fotos.length > 1 ? `${galeria.index + 1}/${galeria.fotos.length}` : ''}
          </span>
          {galeria.fecha && <p className="text-zinc-300 text-xs">{formatFechaCorta(galeria.fecha)}</p>}
        </div>
        <button onClick={onClose} className="text-white text-2xl">✕</button>
      </div>
      <div className="flex-1 flex items-start justify-center relative overflow-hidden pt-8">
        <img src={galeria.fotos[galeria.index]} className="max-w-full max-h-full object-contain" />
        {galeria.index > 0 && (
          <button
            onClick={() => onNav(galeria.index - 1)}
            className="absolute left-2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">
            ‹
          </button>
        )}
        {galeria.index < galeria.fotos.length - 1 && (
          <button
            onClick={() => onNav(galeria.index + 1)}
            className="absolute right-2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">
            ›
          </button>
        )}
      </div>
      {galeria.fotos.length > 1 && (
        <div className="flex gap-2 p-3 overflow-x-auto">
          {galeria.fotos.map((f, i) => (
            <button
              key={i}
              onClick={() => onNav(i)}
              className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ${i === galeria.index ? 'border-emerald-500' : 'border-transparent'}`}>
              <img src={f} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
