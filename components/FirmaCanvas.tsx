'use client'
import { useRef, useEffect, useState } from 'react'

interface Props {
  onFirma: (dataUrl: string | null) => void
  firma: string | null
  autoOpen?: boolean
}

export default function FirmaCanvas({ onFirma, firma, autoOpen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [firmado, setFirmado] = useState(false)
  const [textoRecibe, setTextoRecibe] = useState('')
  const dibujando = useRef(false)
  const ultimoPos = useRef<{x: number, y: number} | null>(null)

  useEffect(() => {
    if (modalAbierto) setTimeout(() => iniciarCanvas(), 150)
  }, [modalAbierto])

  useEffect(() => {
    if (autoOpen) setModalAbierto(true)
  }, [])

  function iniciarCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (parent) {
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setFirmado(false)
  }

  function getPos(e: any, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  function iniciar(e: any) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    dibujando.current = true
    const pos = getPos(e, canvas)
    ultimoPos.current = pos
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function dibujar(e: any) {
    e.preventDefault()
    if (!dibujando.current || !ultimoPos.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    ultimoPos.current = pos
    setFirmado(true)
  }

  function terminar(e: any) {
    e.preventDefault()
    dibujando.current = false
    ultimoPos.current = null
  }

  function limpiar() {
    setFirmado(false)
    setTextoRecibe('')
    iniciarCanvas()
    onFirma(null)
  }

  function confirmar() {
    const canvas = canvasRef.current
    if (!canvas) return
    // Dibujar texto en la parte superior del canvas si hay texto
    if (textoRecibe.trim()) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const padding = 20
        const fontSize = Math.round(canvas.width * 0.07)
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.fillStyle = '#1a1a1a'
        ctx.textAlign = 'center'
        ctx.fillText(`Recibe: ${textoRecibe.trim()}`, canvas.width / 2, fontSize + padding)
        // Línea separadora con espacio amplio
        const lineY = fontSize + padding + 40
        ctx.strokeStyle = '#a1a1aa'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(padding, lineY)
        ctx.lineTo(canvas.width - padding, lineY)
        ctx.stroke()
      }
    }
    // Recortar al área con contenido + padding
    const ctx2 = canvas.getContext('2d')
    if (ctx2) {
      const imgData = ctx2.getImageData(0, 0, canvas.width, canvas.height)
      const { data, width, height } = imgData
      let minX = width, minY = height, maxX = 0, maxY = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3]
          // pixel no blanco (r<240 o g<240 o b<240)
          const r = data[(y * width + x) * 4]
          const g = data[(y * width + x) * 4 + 1]
          const b = data[(y * width + x) * 4 + 2]
          if (r < 240 || g < 240 || b < 240) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      const pad = 20
      minX = Math.max(0, minX - pad)
      minY = Math.max(0, minY - pad)
      maxX = Math.min(width, maxX + pad)
      maxY = Math.min(height, maxY + pad)
      const cropW = maxX - minX
      const cropH = maxY - minY
      if (cropW > 10 && cropH > 10) {
        const offscreen = document.createElement('canvas')
        offscreen.width = cropW
        offscreen.height = cropH
        const octx = offscreen.getContext('2d')
        if (octx) {
          octx.fillStyle = '#ffffff'
          octx.fillRect(0, 0, cropW, cropH)
          octx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH)
          const dataUrl = offscreen.toDataURL('image/jpeg', 0.9)
          onFirma(dataUrl)
          if (navigator.vibrate) navigator.vibrate(30)
          return
        }
      }
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    onFirma(dataUrl)
    if (navigator.vibrate) navigator.vibrate(30)
    setModalAbierto(false)
  }

  return (
    <div className="space-y-2">
      <label className="text-zinc-400 text-xs font-semibold block">Firma del cliente</label>
      {firma ? (
        <div className="space-y-2">
          <div className="border border-emerald-500/30 rounded-xl overflow-hidden bg-white p-1">
            <img src={firma} alt="Firma" className="w-full h-20 object-contain" />
          </div>
          <button type="button" onClick={() => { onFirma(null); setModalAbierto(true) }}
            className="w-full bg-zinc-800 text-zinc-300 text-xs py-2 rounded-xl border border-zinc-700">
            Volver a firmar
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setModalAbierto(true)}
          className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
          <span>🖊️</span> Firmar
        </button>
      )}

      {modalAbierto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 99999, backgroundColor: '#09090b',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #27272a', flexShrink: 0
          }}>
            <span style={{color:'#fff', fontWeight:'bold', fontSize:'16px'}}>Firma del cliente</span>
            <div style={{display:'flex', gap:'8px'}}>
              <button type="button" onClick={limpiar} style={{
                background:'#27272a', color:'#d4d4d8', fontSize:'13px',
                padding:'6px 12px', borderRadius:'8px', border:'1px solid #3f3f46'
              }}>Limpiar</button>
              <button type="button" onClick={() => setModalAbierto(false)} style={{
                background:'#27272a', color:'#a1a1aa', fontSize:'13px',
                padding:'6px 12px', borderRadius:'8px', border:'none'
              }}>Cancelar</button>
            </div>
          </div>

          <div style={{ padding: '0 12px 8px' }}>
            <input
              type="text"
              value={textoRecibe}
              onChange={e => setTextoRecibe(e.target.value)}
              placeholder="Nombre de quien recibe (opcional)"
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '10px',
                background: '#ffffff', border: '1px solid #d4d4d8',
                color: '#111', fontSize: '20px', outline: 'none', boxSizing: 'border-box',
                fontWeight: 500, textAlign: 'center'
              }}
            />
          </div>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 12px 12px'
          }}>
            <div style={{
              width: '100%', height: '100%',
              border: '2px solid #52525b', borderRadius: '16px', overflow: 'hidden',
              background: '#fff'
            }}>
              <canvas
                ref={canvasRef}
                style={{width:'100%', height:'100%', display:'block', touchAction:'none'}}
                onMouseDown={iniciar}
                onMouseMove={dibujar}
                onMouseUp={terminar}
                onMouseLeave={terminar}
                onTouchStart={iniciar}
                onTouchMove={dibujar}
                onTouchEnd={terminar}
              />
            </div>
          </div>

          <div style={{padding:'12px 16px 56px 16px', borderTop:'1px solid #27272a', flexShrink:0}}>
            <p style={{color:'#71717a',fontSize:'11px',textAlign:'center',marginBottom:'8px'}}>
              🔄 Gira el teléfono horizontalmente para más espacio
            </p>
            <button type="button" onClick={confirmar} disabled={!firmado} style={{
              width: '100%', padding: '14px',
              background: firmado ? '#059669' : '#374151',
              color: '#fff', fontWeight: 'bold', fontSize: '16px',
              borderRadius: '16px', border: 'none', opacity: firmado ? 1 : 0.5
            }}>
              {firmado ? '✅ Confirmar firma' : 'Firma primero'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
