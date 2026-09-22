'use client'
import { Seccion } from './Seccion'
import { hslToHex, buildGradient, TEMA_PRESETS } from '../_lib/utils'
import type { Tema } from '../_lib/useTema'



interface Props extends Tema {
  isOpen: boolean
  onToggle: () => void
  onGuardar: () => void
}

export function SeccionTema({ isOpen, onToggle, onGuardar, ...tm }: Props) {
  return (
    <Seccion titulo="Tema" icono="🎨" isOpen={isOpen} onToggle={onToggle}>
      <div className="rounded-2xl p-4 space-y-4" style={{ background: 'rgba(55,65,95,0.55)', border: '1px solid rgba(100,130,200,0.25)' }}>
        {/* Banda espectro */}
        <div
          ref={tm.temaBandRef}
          className="relative rounded-xl select-none"
          style={{
            height: 44, cursor: 'crosshair',
            background: 'linear-gradient(to right, hsl(0,65%,12%), hsl(30,65%,12%), hsl(60,65%,12%), hsl(90,65%,12%), hsl(120,65%,12%), hsl(150,65%,12%), hsl(180,65%,12%), hsl(210,65%,12%), hsl(240,65%,12%), hsl(270,65%,12%), hsl(300,65%,12%), hsl(330,65%,12%), hsl(360,65%,12%))',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          onMouseDown={(e) => { tm.temaDragging.current = true; tm.getHueFromBand(e) }}
          onTouchStart={(e) => { tm.temaDragging.current = true; tm.getHueFromBand(e) }}
        >
          <div className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center transition-all"
            style={{ left: `${(tm.temaHue / 360) * 100}%` }}>
            <div className="text-[10px] font-mono text-white rounded px-1.5 py-0.5 mb-0.5 whitespace-nowrap"
              style={{ background: 'rgba(6,8,20,0.95)', border: `1px solid ${tm.colorFondo}`, boxShadow: `0 0 8px ${tm.colorFondo}66` }}>
              {tm.colorFondo}
            </div>
            <div className="w-0.5 h-1.5 bg-white/70" />
            <div className="w-4 h-4 rounded-full border-2 border-white"
              style={{ background: tm.colorFondo, boxShadow: `0 0 10px ${tm.colorFondo}99` }} />
          </div>
        </div>

        {/* Presets */}
        <div className="flex gap-2 justify-between">
          {TEMA_PRESETS.slice(0, 5).map(p => {
            const ph = hslToHex(p.hue, p.sat, p.lit)
            const active = tm.colorFondo === ph
            return (
              <button key={p.label}
                onClick={() => tm.previewColor(ph, p.hue, p.sat, p.lit)}
                className="flex-1 rounded-lg border-2 transition-all"
                style={{
                  height: 28, background: ph,
                  borderColor: active ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.10)',
                  boxShadow: active ? `0 0 8px ${ph}88` : 'none',
                }} />
            )
          })}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(59,130,246,0.20)' }}>
        <div className="px-3 py-2 flex items-center gap-2 transition-all" style={{ background: tm.colorFondo }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(59,130,246,0.8)' }} />
          <span className="text-white/60 text-xs">Vista previa del fondo</span>
        </div>
        <div className="p-3 space-y-2 transition-all" style={{ background: `linear-gradient(160deg, ${tm.colorFondo} 0%, ${hslToHex(tm.temaHue, Math.max(20, tm.temaSat - 10), Math.min(20, tm.temaLit + 3))} 60%, ${tm.colorFondo} 100%)` }}>
          {[
            { dot: '#ef4444', name: 'ALBA CECILIA TORRES', val: '$528.800' },
            { dot: '#f97316', name: 'ALBA VARON', val: '$3.968.000' },
          ].map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(30,36,58,0.92)', border: '1px solid rgba(59,130,246,0.18)' }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.dot }} />
              <span className="text-white text-xs flex-1">{r.name}</span>
              <span className="text-yellow-400 text-xs font-bold">{r.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Guardar */}
      {tm.msgTema && <p className="text-sm text-emerald-400">{tm.msgTema}</p>}
      <div className="flex gap-2">
        <button onClick={onGuardar} disabled={tm.savingTema}
          className="flex-1 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: `${tm.colorFondo}55`, border: `1px solid ${tm.colorFondo}88` }}>
          {tm.savingTema ? 'Guardando...' : 'Guardar tema'}
        </button>
      </div>
    </Seccion>
  )
}
