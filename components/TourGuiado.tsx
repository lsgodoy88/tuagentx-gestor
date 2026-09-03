'use client'
import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

export type TourPaso = {
  id: string
  titulo: string
  desc: string
  posTooltip?: 'top' | 'bottom' | 'auto' | 'right'
  parentId?: string
  childIndex?: number
  onEnter?: () => void
  // Si retorna string → está bloqueado, mostrar ese mensaje en lugar de Siguiente
  waitFor?: () => string | null
}

interface Props {
  pasos: TourPaso[]
  onFin: () => void
  onOpenNav?: () => void
  onExpandSidebar?: () => void
}

const PAD    = 10
const TT_W   = 320
const TT_GAP = 12
const MARGIN = 10

function findEl(p: TourPaso): HTMLElement | null {
  const isPC = window.innerWidth >= 768

  // En móvil, alertas → componente móvil
  let id = p.id
  let parentId = p.parentId
  if (!isPC && id === 'nav-alertas') id = 'nav-alertas-movil'

  if (isPC) {
    if (id === 'bottom-nav') return null                     // notch no existe en PC — skip
    if (id === 'nav-drawer') id = 'nav-sidebar'              // drawer → sidebar
    if (parentId === 'nav-drawer') parentId = 'nav-sidebar'
    // nav-item-N → nav-pc-N (Links con data-tour directo)
    const navItemMatch = id.match(/^nav-item-(\d+)$/)
    if (navItemMatch) id = `nav-pc-${navItemMatch[1]}`
  }

  // 1. Buscar por data-tour directo
  const direct = document.querySelector(`[data-tour="${id}"]`) as HTMLElement | null
  if (direct) return direct
  // 2. Fallback: padre directo (cuando id no existe, usar parentId como spotlight)
  if (parentId !== undefined) {
    const parent = document.querySelector(`[data-tour="${parentId}"]`) as HTMLElement | null
    if (parent) {
      // Si hay childIndex y no es PC (en PC usamos nav-pc-N directamente)
      if (p.childIndex !== undefined && !isPC) {
        // Usar solo Links de navegación directos — evitar botones anidados
        const children = Array.from(
          parent.querySelectorAll('[data-tour^="nav-pc-"], a[href]')
        ).filter(el => !el.closest('[data-tour^="nav-pc-"]')?.parentElement?.closest('[data-tour^="nav-pc-"]')) as HTMLElement[]
        // Fallback simple: todos los a[href] directos
        const links = children.length
          ? children
          : Array.from(parent.querySelectorAll('a[href]')) as HTMLElement[]
        if (links[p.childIndex]) return links[p.childIndex]
      }
      // Sin childIndex o en PC — usar el padre como spotlight
      return parent
    }
  }
  return null
}

function getRectVisible(el: HTMLElement): DOMRect | null {
  const r = el.getBoundingClientRect()
  if (r.width > 0 && r.height > 0) return r
  return null
}

export default function TourGuiado({ pasos, onFin, onOpenNav, onExpandSidebar }: Props) {
  const [paso, setPaso]   = useState(0)
  const [rect, setRect]   = useState<DOMRect | null>(null)
  const [listo, setListo] = useState(false)

  const calcRect = useCallback((onDone?: () => void) => {
    const p = pasos[paso]
    if (!p) { onDone?.(); return }

    const el = findEl(p)
    if (!el) { setRect(null); onDone?.(); return }

    // Leer rect tras repaint para garantizar posición correcta
    const readRect = (attempts: number, interval: number) => {
      requestAnimationFrame(() => {
        // Re-buscar el elemento en cada intento — puede aparecer después de un fetch
        const freshEl = findEl(p) ?? el
        const r = getRectVisible(freshEl)
        if (r) {
          setRect(r)
          onDone?.()
        } else if (attempts > 0) {
          setTimeout(() => readRect(attempts - 1, interval), interval)
        } else {
          setRect(null)
          onDone?.()
        }
      })
    }

    // Si ya es visible — leer inmediato con rAF
    const rImmediate = el.getBoundingClientRect()
    if (rImmediate.width > 0 && rImmediate.height > 0 &&
        rImmediate.top >= 0 && rImmediate.top < window.innerHeight) {
      readRect(0, 0)
      return
    }

    // Necesita scroll o puede estar cargando — scroll + reintentos largos
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => readRect(15, 200), 300) // hasta 3s de espera
  }, [paso, pasos])

  useEffect(() => {
    // Resetear al cambiar de paso
    setRect(null)
    setListo(false)

    const p = pasos[paso]
    if (p?.onEnter) p.onEnter()

    const isPC    = typeof window !== 'undefined' && window.innerWidth >= 768
    const isNotch = p?.id === 'bottom-nav'
    const isNav   = p?.id === 'nav-drawer' || p?.id?.startsWith('nav-item') || p?.parentId === 'nav-drawer'

    const run = () => calcRect(() => {
      setTimeout(() => setListo(true), 60)
    })

    // En PC, si el elemento no existe → saltar al siguiente paso automáticamente
    if (isPC && isNotch) {
      setPaso(p => Math.min(p + 1, pasos.length - 1))
      return
    }

    // En PC, expandir sidebar antes de remarcar ítems del nav
    const isSidebarItem = isPC && (p?.id?.startsWith('nav-pc') || p?.id === 'nav-sidebar' || p?.id === 'nav-alertas')
    if (isSidebarItem && onExpandSidebar) onExpandSidebar()

    // Si el elemento no existe en el DOM → saltar en lugar de esperar 3s
    const elCheck = findEl(p)
    if (!elCheck) {
      setPaso(p => Math.min(p + 1, pasos.length - 1))
      return
    }

    if (!isPC && isNav && onOpenNav) {
      onOpenNav()
      requestAnimationFrame(() => requestAnimationFrame(() => run()))
    } else {
      run()
    }
  }, [paso]) // eslint-disable-line

  useEffect(() => {
    const fn = () => calcRect()
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [calcRect])

  // Re-evaluar waitFor cada 800ms para detectar cuando el turno se inicia
  const [bloqueado, setBloqueado] = useState<string | null>(null)
  useEffect(() => {
    if (!p?.waitFor) { setBloqueado(null); return }
    try {
      const bloqActual = p.waitFor() ?? null
      setBloqueado(bloqActual)
      if (!bloqActual) return
      const interval = setInterval(() => {
        try {
          const b = p.waitFor!() ?? null
          setBloqueado(b)
          if (!b) clearInterval(interval)
        } catch { clearInterval(interval) }
      }, 800)
      return () => clearInterval(interval)
    } catch { setBloqueado(null) }
  }, [paso]) // eslint-disable-line

  const siguiente = () => paso < pasos.length - 1 ? setPaso(p => p + 1) : onFin()
  const anterior  = () => paso > 0 && setPaso(p => p - 1)
  const p = pasos[paso]

  const vw = typeof window !== 'undefined' ? window.innerWidth  : 390
  const vh = typeof window !== 'undefined' ? window.innerHeight : 844

  const sx = rect ? Math.max(0, rect.left   - PAD) : 0
  const sy = rect ? Math.max(0, rect.top    - PAD) : 0
  const sw = rect ? Math.min(vw - sx, rect.width  + PAD * 2) : 0
  const sh = rect ? Math.min(vh - sy, rect.height + PAD * 2) : 0

  const noEl       = !rect || sw <= 0 || sh <= 0
  const ttW        = Math.min(TT_W, vw - MARGIN * 2)
  const spBottom   = sy + sh
  const spTop      = sy
  const spRight    = rect ? Math.max(0, rect.right + PAD) : 0
  const espAbajo   = vh - spBottom - TT_GAP
  const espArriba  = spTop - TT_GAP
  const espDerecha = vw - spRight - TT_GAP

  // posTooltip:'right' tiene prioridad si hay espacio, si no cae a top/bottom
  const pos = (p.posTooltip === 'right' && espDerecha >= ttW + MARGIN) ? 'right'
            : espAbajo >= espArriba ? 'bottom' : 'top'

  const ttTop = noEl
    ? vh / 2 - 120
    : pos === 'bottom' ? spBottom + TT_GAP
    : pos === 'right'  ? Math.max(MARGIN, Math.min(vh - 280 - MARGIN, sy + sh / 2 - 140))
    : Math.max(MARGIN, spTop - TT_GAP - 240)

  const ttLeft = noEl
    ? vw / 2 - ttW / 2
    : pos === 'right'
      ? Math.min(vw - ttW - MARGIN, spRight + TT_GAP)
      : Math.max(MARGIN, Math.min(vw - ttW - MARGIN,
          rect ? rect.left + rect.width / 2 - ttW / 2 : vw / 2 - ttW / 2))

  const ttMaxH = noEl ? 280
    : pos === 'right'  ? Math.max(140, vh - ttTop - MARGIN)
    : pos === 'bottom' ? Math.max(140, vh - ttTop - MARGIN)
    : Math.max(140, spTop - TT_GAP - MARGIN)

  const transition = listo ? 'all 0.32s cubic-bezier(0.4,0,0.2,1)' : 'none'

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onFin() }}
    >
      {/* Overlay SVG con spotlight */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {!noEl && (
              <rect x={sx} y={sy} width={sw} height={sh} rx={13} ry={13} fill="black" />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.74)" mask="url(#tour-mask)" />
        {!noEl && (
          <rect x={sx} y={sy} width={sw} height={sh} rx={13} ry={13}
            fill="none" stroke="rgba(99,179,237,0.80)" strokeWidth={2}
            style={{ transition }} />
        )}
      </svg>

      {/* Tooltip */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position:     'absolute',
          left:         ttLeft,
          top:          ttTop,
          width:        ttW,
          maxHeight:    ttMaxH,
          overflowY:    'hidden',
          background:   'rgba(12,18,38,0.98)',
          border:       '1.5px solid rgba(99,179,237,0.40)',
          borderRadius: 16,
          padding:      '14px 16px 12px',
          boxShadow:    '0 10px 40px rgba(0,0,0,0.65)',
          opacity:      listo ? 1 : 0,
          transform:    listo ? 'translateY(0)'
                              : pos === 'bottom' ? 'translateY(8px)' : 'translateY(-8px)',
          transition,
          pointerEvents: 'auto',
          boxSizing:    'border-box' as const,
        }}
      >
        {/* Barra progreso con número a cada lado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color: '#63b3ed', fontSize: 11, fontWeight: 800,
            minWidth: 14, textAlign: 'right', flexShrink: 0 }}>
            {paso + 1}
          </span>
          <div style={{ flex: 1, display: 'flex', gap: 3, alignItems: 'center' }}>
            {pasos.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 3,
                background: i <= paso ? '#63b3ed' : 'rgba(255,255,255,0.12)',
                transition: 'background 0.3s ease',
              }} />
            ))}
          </div>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 600,
            minWidth: 14, textAlign: 'left', flexShrink: 0 }}>
            {pasos.length}
          </span>
        </div>
        <p style={{ color: '#fff', fontSize: 14, fontWeight: 700,
          margin: '0 0 5px', lineHeight: 1.3 }}>
          {p.titulo}
        </p>

        <p style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12.5,
          lineHeight: 1.55, margin: '0 0 12px' }}>
          {p.desc}
        </p>

        <div style={{ display: 'flex', gap: 6 }}>
          {paso > 0 && (
            <button onClick={anterior} style={{
              flex: 1, padding: '8px 0', borderRadius: 9,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.13)',
              color: 'rgba(255,255,255,0.75)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>← Ant.</button>
          )}
          {(() => {
            const bloq = bloqueado
            return bloq ? (
              <div style={{ flex: 3, padding: '8px 10px', borderRadius: 9,
                background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)',
                color: '#fbbf24', fontSize: 12, fontWeight: 600, textAlign: 'center' as const }}>
                ⏳ {bloq}
              </div>
            ) : (
              <button onClick={siguiente} style={{
                flex: 3, padding: '8px 0', borderRadius: 9,
                background: paso === pasos.length - 1
                  ? 'rgba(52,211,153,0.18)' : 'rgba(99,179,237,0.18)',
                border: `1px solid ${paso === pasos.length - 1
                  ? 'rgba(52,211,153,0.45)' : 'rgba(99,179,237,0.45)'}`,
                color: paso === pasos.length - 1 ? '#34d399' : '#63b3ed',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}>
                {paso === pasos.length - 1 ? '✓ Finalizar' : 'Siguiente →'}
              </button>
            )
          })()}
          <button onClick={onFin} style={{
            padding: '8px 10px', borderRadius: 9,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            color: 'rgba(255,255,255,0.35)', fontSize: 13, cursor: 'pointer',
          }} title="Salir">✕</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
