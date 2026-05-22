'use client'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner'

const Scanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then(m => ({ default: m.Scanner })),
  { ssr: false, loading: () => <div className="w-full h-full bg-black" /> }
)

interface Props {
  onDetect: (codigo: string) => void
  onClose: () => void
}

export default function ModalEscaner({ onDetect, onClose }: Props) {
  const [detectado, setDetectado] = useState<string | null>(null)
  const cerradoRef = useRef(false)

  // Bloquear botón atrás físico
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const bloquear = (e: PopStateEvent) => {
      e.preventDefault()
      window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', bloquear)
    return () => window.removeEventListener('popstate', bloquear)
  }, [])

  function handleScan(results: IDetectedBarcode[]) {
    if (cerradoRef.current || detectado) return
    const raw = results?.[0]?.rawValue
    if (!raw) return
    cerradoRef.current = true
    setDetectado(raw)
    if (navigator.vibrate) navigator.vibrate([80, 40, 80])
    setTimeout(() => onDetect(raw), 700)
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <span className="text-white text-sm font-semibold">Escanear guía</span>
        <button onClick={onClose}
          className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center">
          ✕
        </button>
      </div>

      {/* Área de escaneo */}
      <div className="relative flex-1 overflow-hidden">
        {!detectado ? (
          <>
            <Scanner
              onScan={handleScan}
              constraints={{ facingMode: 'environment' }}
              styles={{
                container: { width: '100%', height: '100%' },
                video: { objectFit: 'cover' },
              }}
            />
            {/* Línea animada sobre el finder nativo */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <p className="text-white/70 text-xs mt-64 text-center px-8">
                Apunta la cámara al código de barras de la guía
              </p>
            </div>
          </>
        ) : (
          /* Código detectado */
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-zinc-950 px-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
              <span className="text-white text-3xl">✓</span>
            </div>
            <p className="text-zinc-400 text-xs uppercase tracking-widest">Código detectado</p>
            <p className="text-white text-xl font-mono font-bold text-center break-all">{detectado}</p>
          </div>
        )}
      </div>
    </div>
  )
}
