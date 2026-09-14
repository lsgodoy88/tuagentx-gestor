'use client'
import { useState, useEffect, useRef } from 'react'

interface Imagen {
  id: string
  nombre: string
  url: string
}

export default function Carrusel({ imagenes }: { imagenes: Imagen[] }) {
  const [idx, setIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startXRef = useRef(0)

  function siguiente() { setIdx(i => (i + 1) % imagenes.length) }
  function anterior() { setIdx(i => (i - 1 + imagenes.length) % imagenes.length) }

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(siguiente, 4000)
  }

  useEffect(() => {
    if (imagenes.length <= 1) return
    resetTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagenes.length])

  function onTouchStart(e: React.TouchEvent) { startXRef.current = e.touches[0].clientX }
  function onTouchEnd(e: React.TouchEvent) {
    const diff = startXRef.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 40) { diff > 0 ? siguiente() : anterior(); resetTimer() }
  }

  if (imagenes.length === 0) return null

  return (
    <div className="relative max-w-xl mx-auto px-4 mb-2 select-none">
      <div
        className="overflow-hidden rounded-2xl"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenes[idx].url}
          alt={imagenes[idx].nombre}
          className="w-full object-cover max-h-[60vh] transition-opacity duration-300"
        />
      </div>

      {imagenes.length > 1 && (
        <>
          <button
            onClick={() => { anterior(); resetTimer() }}
            className="absolute left-6 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-9 h-9 rounded-full flex items-center justify-center text-lg"
          >‹</button>
          <button
            onClick={() => { siguiente(); resetTimer() }}
            className="absolute right-6 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-9 h-9 rounded-full flex items-center justify-center text-lg"
          >›</button>
          <div className="flex justify-center gap-1.5 mt-3">
            {imagenes.map((_, i) => (
              <button
                key={i}
                onClick={() => { setIdx(i); resetTimer() }}
                className={`w-2 h-2 rounded-full transition-colors ${i === idx ? 'bg-blue-400' : 'bg-gray-600'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
