'use client'

interface ModalObsProps {
  texto: string
  onClose: () => void
}
export function ModalObsTexto({ texto, onClose }: ModalObsProps) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-4 max-w-sm w-full"
        onClick={e => e.stopPropagation()}>
        <p className="text-zinc-400 text-xs mb-2">✍🏼 Observación</p>
        <p className="text-white text-sm">{texto}</p>
        <button onClick={onClose} className="mt-4 w-full bg-zinc-800 text-zinc-300 py-2 rounded-xl text-xs">
          Cerrar
        </button>
      </div>
    </div>
  )
}

interface ModalFirmaProps {
  url: string
  onClose: () => void
}
export function ModalFirma({ url, onClose }: ModalFirmaProps) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}>
      <div
        className="relative max-w-sm w-full bg-white rounded-2xl p-3"
        onClick={e => e.stopPropagation()}>
        <img src={url} alt="Firma" className="w-full object-contain rounded-xl max-h-[60vh]" />
        <button
          onClick={onClose}
          className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm">
          ✕
        </button>
      </div>
    </div>
  )
}
