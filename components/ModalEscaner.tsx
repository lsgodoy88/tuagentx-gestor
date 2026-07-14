'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onDetect: (codigo: string) => void
  onClose: () => void
}

export default function ModalEscaner({ onDetect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [detectado, setDetectado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const detectadoRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const bloquear = () => window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', bloquear)

    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // Verificar soporte BarcodeDetector
        if (!('BarcodeDetector' in window)) {
          setError('Tu navegador no soporta lectura de barcodes. Usa Chrome.')
          return
        }

        const detector = new (window as any).BarcodeDetector({
          formats: ['code_128','code_39','code_93','ean_13','ean_8','upc_a','upc_e','qr_code','pdf417','itf','codabar']
        })

        async function escanear() {
          if (detectadoRef.current || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0) {
              const raw = codes[0].rawValue
              if (raw && !detectadoRef.current) {
                detectadoRef.current = true
                setDetectado(raw)
                if (navigator.vibrate) navigator.vibrate([80, 40, 80])
                detener()
                setTimeout(() => onDetect(raw), 600)
                return
              }
            }
          } catch {}
          rafRef.current = requestAnimationFrame(escanear)
        }

        rafRef.current = requestAnimationFrame(escanear)
      } catch (e: any) {
        setError('No se pudo acceder a la cámara. Verifica los permisos.')
      }
    }

    iniciar()

    return () => {
      window.removeEventListener('popstate', bloquear)
      detener()
    }
  }, [])

  function detener() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <span className="text-white text-sm font-semibold">Escanear código de barras</span>
        <button type="button" onClick={() => { detener(); onClose() }}
          className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center">
          ✕
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {!detectado && !error && (
          <>
            <video ref={videoRef} muted playsInline
              style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            {/* Guía visual */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div style={{
                width: 280, height: 120,
                border: '2px solid #3b82f6',
                borderRadius: 12,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
              }} />
            </div>
            <p className="absolute bottom-8 left-0 right-0 text-white/70 text-xs text-center px-8">
              Apunta al código de barras de la guía
            </p>
          </>
        )}

        {detectado && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
              <span className="text-white text-3xl">✓</span>
            </div>
            <p className="text-zinc-400 text-xs uppercase tracking-widest">Código detectado</p>
            <p className="text-white text-xl font-mono font-bold text-center break-all">{detectado}</p>
          </div>
        )}

        {error && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button type="button" onClick={() => { detener(); onClose() }}
              className="bg-zinc-800 text-white px-4 py-2 rounded-xl text-sm">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  )
}
