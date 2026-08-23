'use client'
import { useEffect, useRef } from 'react'

export default function TuAgentXSpinner() {
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const xRef = useRef<HTMLSpanElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const CYCLE  = 1400
    const PAUSE  = 100
    const TRAVEL = 800
    const HOLD   = 100
    const BG     = '#060a24'

    const wEl = wrapRef.current
    const xEl = xRef.current
    if (!wEl || !xEl) return

    const wRect = wEl.getBoundingClientRect()
    const xRect = xEl.getBoundingClientRect()
    const xLeft = xRect.left - wRect.left

    const styleEl = document.createElement('style')
    let css = ''

    refs.current.forEach((span, i) => {
      if (!span) return
      const letraRight = span.getBoundingClientRect().right - wRect.left
      const touchMs    = Math.max(0, (xLeft - letraRight) * TRAVEL / xLeft)
      const touchPct   = ((PAUSE + touchMs) / CYCLE * 100).toFixed(2)
      const erasePct   = (parseFloat(touchPct) + 0.1).toFixed(2)
      const endErase   = (((PAUSE + TRAVEL + HOLD) / CYCLE) * 100).toFixed(2)
      const restore    = (((PAUSE + TRAVEL + HOLD + 240) / CYCLE) * 100).toFixed(2)

      const name = `tax-er${i}`
      css += `
        @keyframes ${name} {
          0%, ${touchPct}%           { color: white; }
          ${erasePct}%, ${endErase}% { color: ${BG}; }
          ${restore}%, 100%          { color: white; }
        }
      `
      span.style.animation = `${name} ${CYCLE}ms linear infinite`
    })

    css += `
      @keyframes tax-travel {
        0%, ${(PAUSE/CYCLE*100).toFixed(2)}%                           { transform: translateX(0); }
        ${((PAUSE+TRAVEL)/CYCLE*100).toFixed(2)}%,
        ${((PAUSE+TRAVEL+HOLD)/CYCLE*100).toFixed(2)}%                 { transform: translateX(-${xLeft}px); }
        100%                                                            { transform: translateX(0); }
      }
    `
    styleEl.textContent = css
    document.head.appendChild(styleEl)
    xEl.style.animation = `tax-travel ${CYCLE}ms linear infinite`

    return () => { styleEl.remove() }
  }, [])

  const letters = ['T','u','A','g','e','n','t']

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#060a24',
    }}>
      <div ref={wrapRef} style={{ display: 'flex', alignItems: 'center' }}>
        {letters.map((l, i) => (
          <span
            key={i}
            ref={el => { refs.current[i] = el }}
            style={{ fontSize: 36, fontWeight: 900, color: 'white', display: 'inline-block' }}
          >
            {l}
          </span>
        ))}
        <span
          ref={xRef}
          style={{ fontSize: 36, fontWeight: 900, color: '#3b82f6', display: 'inline-block' }}
        >
          X
        </span>
      </div>
    </div>
  )
}
