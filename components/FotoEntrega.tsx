'use client'
import { useRef, useState } from 'react'

interface Props {
  onFoto: (dataUrl: string | null) => void
  foto: string | null
  quienRecibe?: string
  autoOpen?: boolean
}

const MAX_PX = 1280

function marcaAgua(imgSrc: string, quienRecibe: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight
      if (w > MAX_PX || h > MAX_PX) {
        if (w > h) { h = Math.round(h * MAX_PX / w); w = MAX_PX }
        else { w = Math.round(w * MAX_PX / h); h = MAX_PX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const ahora = new Date().toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      })
      const lineas: string[] = []
      if (quienRecibe.trim()) lineas.push(`Recibe: ${quienRecibe.trim()}`)
      lineas.push(ahora)
      const fontSize = Math.max(28, Math.round(w * 0.045))
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.textAlign = 'left'
      const padX = Math.round(w * 0.025)
      const padY = Math.round(h * 0.02)
      const lineH = fontSize * 1.4
      const boxH = lineas.length * lineH + padY * 2
      const boxY = h - boxH
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, boxY, w, boxH)
      lineas.forEach((linea, i) => {
        const y = boxY + padY + fontSize + i * lineH
        ctx.strokeStyle = 'rgba(0,0,0,0.9)'
        ctx.lineWidth = fontSize * 0.18
        ctx.strokeText(linea, padX, y)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(linea, padX, y)
      })
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = imgSrc
  })
}

export default function FotoEntrega({ onFoto, foto, quienRecibe = '', autoOpen }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [procesando, setProcesando] = useState(false)
  const [vistaPrevia, setVistaPrevia] = useState(false)

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcesando(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const src = ev.target?.result as string
      const resultado = await marcaAgua(src, quienRecibe)
      onFoto(resultado)
      setProcesando(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-2">
      <label className="text-zinc-400 text-xs font-semibold block">Foto de entrega</label>

      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        style={{ display: 'none' }} onChange={onFileChange} />

      {foto ? (
        <>
          <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-black cursor-pointer"
            onClick={() => setVistaPrevia(true)}>
            <img src={foto} alt="Foto entrega" className="w-full h-36 object-cover" />
            <button type="button" onClick={e => { e.stopPropagation(); onFoto(null) }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center text-sm font-bold">
              ✕
            </button>
          </div>
          {vistaPrevia && (
            <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
              onClick={() => setVistaPrevia(false)}>
              <div className="relative" onClick={e => e.stopPropagation()}>
                <img src={foto} alt="Foto entrega" className="max-w-full max-h-[80vh] rounded-xl object-contain" />
                <button onClick={() => setVistaPrevia(false)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center text-sm font-bold">
                  ✕
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={procesando}
          className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {procesando ? '⏳ Procesando...' : <><span>📷</span><span>Tomar foto</span></>}
        </button>
      )}
    </div>
  )
}
