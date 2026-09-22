'use client'

interface Props {
  fotosCapturadas: string[]
  countdownSec: number | null
  anotacionSrc: string | null
  anotShowToolbar: boolean
  anotTool: 'text' | 'arrow'
  anotColor: string
  anotText: string
  anotaciones: any[]
  anotArrow: { x1: number; y1: number; x2: number; y2: number } | null
  anotTextPendiente: string | null
  anotTextPos: { x: number; y: number } | null
  anotTextDragging: boolean
  anotDrawing: boolean
  anotStart: { x: number; y: number } | null
  zoomLevel: number
  soportaZoom: boolean
  fotoExpandida: string | null
  streamRef: React.MutableRefObject<MediaStream | null>
  saving: Record<string, boolean>
  camaraOrdenId: string | null
  onSetAnotShowToolbar: (v: boolean) => void
  onSetAnotTool: (v: 'text' | 'arrow') => void
  onSetAnotColor: (v: string) => void
  onSetAnotText: (v: string) => void
  onSetAnotaciones: (v: any[]) => void
  onSetAnotArrow: (v: any) => void
  onSetAnotDrawing: (v: boolean) => void
  onSetAnotStart: (v: any) => void
  onSetAnotTextPendiente: (v: string | null) => void
  onSetAnotTextPos: (v: any) => void
  onSetAnotTextDragging: (v: boolean) => void
  onSetFotoExpandida: (v: string | null) => void
  onCapturarFoto: () => void
  onEnviarFotos: () => void
  onCerrarCamara: () => void
  onCancelarCountdown: () => void
  onEliminarFoto: (idx: number) => void
  onAplicarZoom: (nivel: number) => void
  onConfirmarAnotacion: () => void
  onDescartarAnotacion: () => void
  onDibujarAnotaciones: (canvas: HTMLCanvasElement, imgSrc: string, items: any[], arrow: any) => void
  videoRef: React.MutableRefObject<HTMLVideoElement | null>
  anotCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>
}

export default function ModalCamara({
  fotosCapturadas, countdownSec, anotacionSrc, anotShowToolbar, anotTool,
  anotColor, anotText, anotaciones, anotArrow, anotTextPendiente, anotTextPos,
  anotTextDragging, anotDrawing, anotStart, zoomLevel, soportaZoom,
  fotoExpandida, streamRef, saving, camaraOrdenId,
  onSetAnotShowToolbar, onSetAnotTool, onSetAnotColor, onSetAnotText,
  onSetAnotaciones, onSetAnotArrow, onSetAnotDrawing, onSetAnotStart,
  onSetAnotTextPendiente, onSetAnotTextPos, onSetAnotTextDragging, onSetFotoExpandida,
  onCapturarFoto, onEnviarFotos, onCerrarCamara, onCancelarCountdown,
  onEliminarFoto, onAplicarZoom, onConfirmarAnotacion, onDescartarAnotacion,
  onDibujarAnotaciones, videoRef, anotCanvasRef,
}: Props) {
  return (
    <>
      {/* Cámara fullscreen */}
      <div className="fixed inset-0 overflow-hidden touch-none" style={{ zIndex: 9999, background: '#000', display: anotacionSrc ? 'none' : undefined }}>
        {countdownSec !== null ? (
          <div className="absolute inset-0 bg-black">
            {fotosCapturadas.length === 1 ? (
              <img src={fotosCapturadas[0]} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full grid gap-0.5 ${fotosCapturadas.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'}`}>
                {fotosCapturadas.map((f, i) => (
                  <img key={i} src={f} className={`w-full h-full object-cover ${fotosCapturadas.length === 3 && i === 0 ? 'col-span-2' : ''}`} />
                ))}
              </div>
            )}
            <div className="absolute inset-x-0 top-0 h-1/2 flex flex-col items-center justify-center gap-2">
              <div className="bg-black/60 backdrop-blur-sm rounded-3xl px-6 py-3 flex flex-col items-center gap-1">
                <span className="text-white/70 text-xs font-semibold tracking-widest uppercase">Alistando en</span>
                <span className="text-white text-7xl font-black tabular-nums leading-none">{countdownSec}</span>
              </div>
              <button onClick={onCancelarCountdown}
                className="mt-1 px-8 py-2.5 rounded-2xl bg-black/60 border border-white/30 backdrop-blur-sm text-white text-sm font-semibold">
                ✕ Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 bg-black flex flex-col">
            <div className="relative flex-1 overflow-hidden">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ touchAction: 'none' }} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 pb-8 px-4 pointer-events-none">
              {fotosCapturadas.length > 0 && (
                <div className="flex gap-2 mb-4 overflow-x-auto pointer-events-auto">
                  {fotosCapturadas.map((f, i) => (
                    <div key={i} className="relative flex-shrink-0">
                      <img src={f}
                        onClick={() => { onSetFotoExpandida(f); streamRef.current?.getTracks().forEach(t => { t.enabled = false }) }}
                        className="w-14 h-14 object-cover rounded-xl border-2 border-white/60 cursor-pointer active:scale-95 transition-transform" />
                      <button onClick={() => onEliminarFoto(i)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center">
                <div className="flex items-center gap-2 pointer-events-auto w-16">
                  <button onClick={onCerrarCamara}
                    className="w-16 h-16 rounded-2xl bg-zinc-800/80 border border-zinc-600 text-white text-xs flex flex-col items-center justify-center gap-1">
                    <span className="text-lg">✕</span><span>Cancelar</span>
                  </button>
                </div>
                <div className="flex-1 flex justify-center">
                  <button onClick={onCapturarFoto}
                    className="w-20 h-20 rounded-full bg-white border-4 border-zinc-400 active:scale-95 transition-transform shadow-lg pointer-events-auto" />
                </div>
                <div className="flex items-center gap-2 pointer-events-auto w-16 justify-end">
                  {fotosCapturadas.length > 0 ? (
                    <button onClick={onEnviarFotos} disabled={saving[camaraOrdenId ?? ''] || false}
                      className="w-16 h-16 rounded-2xl bg-emerald-500 disabled:opacity-50 text-white text-xs flex flex-col items-center justify-center gap-1 font-bold">
                      <span className="text-lg">✓</span>
                      <span>{fotosCapturadas.length} foto{fotosCapturadas.length > 1 ? 's' : ''}</span>
                    </button>
                  ) : soportaZoom ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => onAplicarZoom(zoomLevel - 0.5)} className="w-7 h-7 rounded-full bg-zinc-700/80 text-white text-base flex items-center justify-center">−</button>
                      <span className="text-white text-xs w-8 text-center">{zoomLevel.toFixed(1)}x</span>
                      <button onClick={() => onAplicarZoom(zoomLevel + 0.5)} className="w-7 h-7 rounded-full bg-zinc-700/80 text-white text-base flex items-center justify-center">+</button>
                    </div>
                  ) : <div className="w-16" />}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal anotación */}
      {anotacionSrc && (
        <div className="fixed inset-0 bg-black z-[1000] flex flex-col">
          {anotShowToolbar && (
            <div className="absolute top-0 left-0 right-0 z-10 bg-black/70 px-3 py-2 flex items-center justify-center gap-2 flex-wrap">
              <button onClick={() => { onSetAnotTool('text'); onSetAnotText(''); onSetAnotTextPendiente(null); onSetAnotTextPos(null) }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${anotTool === 'text' ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-zinc-300'}`}>T Texto</button>
              <button onClick={() => { onSetAnotTool('arrow'); onSetAnotTextPendiente(null); onSetAnotTextPos(null) }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${anotTool === 'arrow' ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-zinc-300'}`}>➜ Flecha</button>
              <div className="flex gap-1.5">
                {['#FFFFFF', '#FF3B30', '#FFD60A', '#30D158', '#000000'].map(col => (
                  <button key={col} onClick={() => onSetAnotColor(col)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${anotColor === col ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ background: col }} />
                ))}
              </div>
              {(anotaciones.length > 0 || anotTextPendiente) && (
                <button onClick={() => {
                  if (anotTextPendiente) { onSetAnotTextPendiente(null); onSetAnotTextPos(null); return }
                  const next = anotaciones.slice(0, -1); onSetAnotaciones(next)
                  const cv = anotCanvasRef.current; if (cv) onDibujarAnotaciones(cv, anotacionSrc!, next, null)
                }} className="ml-auto text-zinc-400 text-xs px-2 py-1.5 bg-zinc-800/80 rounded-xl">↩</button>
              )}
            </div>
          )}
          <div className="relative flex-1 overflow-hidden"
            onPointerDown={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const px = e.clientX - rect.left, py = e.clientY - rect.top
              if (anotTool === 'text' && anotTextPendiente) { onSetAnotTextDragging(true); onSetAnotTextPos({ x: px, y: py }); return }
              const hitIdx = anotaciones.findLastIndex((a: any) => {
                if (a.type === 'text') return Math.abs(px - a.x) < 60 && Math.abs(py - a.y) < 30
                if (a.type === 'arrow') { const mx = (a.x1 + a.x2) / 2, my = (a.y1 + a.y2) / 2; return Math.abs(px - mx) < 40 && Math.abs(py - my) < 40 }
                return false
              })
              if (hitIdx >= 0) { onSetAnotTextDragging(true); onSetAnotTextPos({ x: px, y: py }); onSetAnotTextPendiente(`__move__${hitIdx}`); return }
              if (anotTool === 'arrow') { onSetAnotDrawing(true); onSetAnotStart({ x: px, y: py }) }
            }}
            onPointerMove={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const px = e.clientX - rect.left, py = e.clientY - rect.top
              if (anotTextDragging && anotTextPendiente) onSetAnotTextPos({ x: px, y: py })
              else if (anotDrawing && anotStart) onSetAnotArrow({ x1: anotStart.x, y1: anotStart.y, x2: px, y2: py })
            }}
            onPointerUp={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const px = e.clientX - rect.left, py = e.clientY - rect.top
              if (anotTextDragging && anotTextPendiente) {
                onSetAnotTextDragging(false)
                if (anotTextPendiente.startsWith('__move__')) {
                  const idx = parseInt(anotTextPendiente.replace('__move__', ''))
                  const next = anotaciones.map((a: any, i: number) => {
                    if (i !== idx) return a
                    if (a.type === 'text') return { ...a, x: px, y: py }
                    if (a.type === 'arrow') { const dx = px - (a.x1 + a.x2) / 2, dy = py - (a.y1 + a.y2) / 2; return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy } }
                    return a
                  })
                  onSetAnotaciones(next); onSetAnotTextPendiente(null); onSetAnotTextPos(null)
                  const cv = anotCanvasRef.current; if (cv) onDibujarAnotaciones(cv, anotacionSrc!, next, null)
                } else {
                  const next = [...anotaciones, { type: 'text', text: anotTextPendiente!, color: anotColor, x: px, y: py }]
                  onSetAnotaciones(next); onSetAnotTextPendiente(null); onSetAnotTextPos(null); onSetAnotText('')
                  const cv = anotCanvasRef.current; if (cv) onDibujarAnotaciones(cv, anotacionSrc!, next, null)
                }
              } else if (anotDrawing && anotStart) {
                const next = [...anotaciones, { type: 'arrow', x1: anotStart.x, y1: anotStart.y, x2: px, y2: py, color: anotColor }]
                onSetAnotaciones(next); onSetAnotArrow(null); onSetAnotDrawing(false)
                const cv = anotCanvasRef.current; if (cv) onDibujarAnotaciones(cv, anotacionSrc!, next, null)
              }
            }}>
            <canvas className="w-full h-full object-contain" style={{ touchAction: 'none' }}
              ref={(el) => {
                (anotCanvasRef as any).current = el
                if (el && anotacionSrc) onDibujarAnotaciones(el, anotacionSrc, anotaciones, anotArrow)
              }} />
            {anotTextPendiente && anotTextPos && (
              <div className="absolute pointer-events-none font-bold text-lg select-none"
                style={{ left: anotTextPos.x, top: anotTextPos.y, color: anotColor, transform: 'translate(-50%,-50%)', textShadow: '0 0 4px rgba(0,0,0,0.8)' }}>
                {anotTextPendiente}
              </div>
            )}
            {anotShowToolbar && anotTool === 'text' && !anotTextPendiente && (
              <div className="absolute bottom-4 left-3 right-3 z-10 flex gap-2">
                <input type="text" placeholder="Escribe un texto..." value={anotText}
                  onChange={e => onSetAnotText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && anotText.trim()) { onSetAnotTextPendiente(anotText.trim()); onSetAnotTextPos({ x: 80, y: 80 }); onSetAnotShowToolbar(false) } }}
                  className="flex-1 bg-black/70 border border-white/30 rounded-2xl px-4 py-2.5 text-white text-sm outline-none focus:border-white/60 placeholder-white/40" />
                <button
                  onClick={() => { if (anotText.trim()) { onSetAnotTextPendiente(anotText.trim()); onSetAnotTextPos({ x: 80, y: 80 }); onSetAnotShowToolbar(false) } }}
                  disabled={!anotText.trim()}
                  className="w-10 h-10 bg-blue-500 disabled:opacity-40 text-white font-bold rounded-full flex items-center justify-center self-center">→</button>
              </div>
            )}
          </div>
          <div style={{ background: '#060a24', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', marginBottom: '2%' }} className="px-6 pt-3 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex gap-3" style={{ marginRight: '10%' }}>
                <button onClick={onDescartarAnotacion}
                  className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-600 text-white text-xs flex flex-col items-center justify-center gap-1">
                  <span className="text-lg">🗑️</span><span>Descartar</span>
                </button>
                <button onClick={() => { onSetAnotShowToolbar(!anotShowToolbar); onSetAnotText('') }}
                  className={`w-16 h-16 rounded-2xl text-xs flex flex-col items-center justify-center gap-1 font-bold border ${anotShowToolbar ? 'bg-blue-600 border-blue-400 text-white' : 'bg-zinc-700 border-zinc-600 text-zinc-300'}`}>
                  <span className="text-xl">✏️</span><span>Tools</span>
                </button>
              </div>
              <button onClick={onConfirmarAnotacion}
                className="w-16 h-16 rounded-2xl bg-emerald-500 text-white text-xs flex flex-col items-center justify-center gap-1 font-bold">
                <span className="text-lg">✓</span><span>Usar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Foto expandida */}
      {fotoExpandida && (
        <div className="fixed inset-0 bg-black flex items-center justify-center" style={{ zIndex: 10001 }}
          onClick={() => { onSetFotoExpandida(null); streamRef.current?.getTracks().forEach(t => { t.enabled = true }) }}>
          <img src={fotoExpandida} alt="Foto" className="max-w-full max-h-full object-contain" />
          <button
            onClick={e => { e.stopPropagation(); onSetFotoExpandida(null); streamRef.current?.getTracks().forEach(t => { t.enabled = true }) }}
            className="absolute top-4 right-4 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">✕</button>
        </div>
      )}
    </>
  )
}
