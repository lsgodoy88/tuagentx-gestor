'use client'
import { useState } from 'react'

interface Props {
  url: string
  nombre: string
  onClose: () => void
}

export default function VisorPDF({ url, nombre, onClose }: Props) {
  const [cargando, setCargando] = useState(true)

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: '#0a0f1c' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0 border-b"
        style={{ borderColor: 'rgba(59,130,246,0.30)', background: '#0f172a' }}
      >
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">📄 {nombre}</p>
          <p className="text-gray-400 text-xs">Usa los controles del visor para navegar páginas</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl ml-3 shrink-0">×</button>
      </div>

      {/* Visor iframe */}
      <div className="flex-1 relative">
        {cargando && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            Cargando portafolio...
          </div>
        )}
        <iframe
          src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
          className="w-full h-full border-0"
          onLoad={() => setCargando(false)}
          title={nombre}
        />
      </div>
    </div>
  )
}
