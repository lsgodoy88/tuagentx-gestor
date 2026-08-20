'use client'
import { useEffect, useState } from 'react'

interface Props {
  active: boolean
  borderRadius?: number
  duration?: number
}

export default function BorderBeam({ active, borderRadius = 20, duration = 4 }: Props) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(
      typeof navigator !== 'undefined' &&
      (navigator.hardwareConcurrency <= 4 || /Mobi|Android/i.test(navigator.userAgent))
    )
  }, [])

  if (isMobile) {
    return (
      <style>{`
        @keyframes bb-pulse {
          0%, 100% { outline-color: rgba(59,130,246,0.8); outline-offset: 0px; }
          50%       { outline-color: rgba(59,130,246,0.2); outline-offset: 4px; }
        }
        .bb-host {
          border-radius: ${borderRadius}px;
          outline: 2px solid rgba(59,130,246,0);
          outline-offset: 0px;
          transition: outline-color 0.3s, outline-offset 0.3s;
        }
        .bb-host.bb-active {
          border: 1.5px solid rgba(59,130,246,0.5) !important;
          animation: bb-pulse ${duration * 0.6}s ease-in-out infinite;
        }
      `}</style>
    )
  }

  return (
    <>
      <style>{`
        @property --bb-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes bb-spin {
          to { --bb-angle: 360deg; }
        }
        .bb-ring {
          position: absolute;
          inset: 0;
          border-radius: ${borderRadius}px;
          background: conic-gradient(
            from var(--bb-angle),
            transparent 0%,
            transparent 60%,
            #3b82f6 72%,
            #93c5fd 78%,
            #3b82f6 84%,
            transparent 92%,
            transparent 100%
          );
          animation: bb-spin ${duration}s linear infinite;
          pointer-events: none;
          transition: opacity 0.5s ease;
          z-index: 0;
        }
        .bb-glow {
          position: absolute;
          inset: -6px;
          border-radius: ${borderRadius + 6}px;
          background: conic-gradient(
            from var(--bb-angle),
            transparent 0%,
            transparent 65%,
            rgba(59,130,246,0.5) 75%,
            rgba(147,197,253,0.18) 80%,
            transparent 90%,
            transparent 100%
          );
          animation: bb-spin ${duration}s linear infinite;
          filter: blur(8px);
          pointer-events: none;
          transition: opacity 0.5s ease;
          z-index: -1;
        }
      `}</style>
      <div className="bb-glow" style={{ opacity: active ? 1 : 0 }} />
      <div className="bb-ring" style={{ opacity: active ? 1 : 0 }} />
    </>
  )
}
