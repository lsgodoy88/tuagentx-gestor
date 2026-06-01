'use client'
import { useNetworkContext } from '@/lib/network-context'

export function NetworkBanner() {
  const { online, lastOnline } = useNetworkContext()
  if (online) return null

  const mins = lastOnline
    ? Math.floor((Date.now() - lastOnline.getTime()) / 60_000)
    : null

  const label = mins !== null
    ? `Sin conexión · hace ${mins < 1 ? 'menos de 1 min' : mins + ' min'}`
    : 'Sin conexión'

  return (
    <>
      {/* Borde neon pulsante — full screen, no bloquea interacción */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          pointerEvents: 'none',
          boxShadow:
            'inset 0 0 0 2px rgba(239,68,68,0.70), inset 0 0 12px 2px rgba(239,68,68,0.35), inset 0 0 28px 4px rgba(239,68,68,0.15)',
          animation: 'neon-border-pulse 2s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes neon-border-pulse {
          0%, 100% {
            box-shadow:
              inset 0 0 0 2px rgba(239,68,68,0.70),
              inset 0 0 12px 2px rgba(239,68,68,0.35),
              inset 0 0 28px 4px rgba(239,68,68,0.15);
          }
          50% {
            box-shadow:
              inset 0 0 0 2px rgba(239,68,68,0.95),
              inset 0 0 18px 4px rgba(239,68,68,0.55),
              inset 0 0 40px 8px rgba(239,68,68,0.22);
          }
        }
      `}</style>

      {/* Ícono flotante */}
      <div
        title={label}
        aria-label={label}
        className="fixed top-4 right-4 z-[9999] group"
      >
        <div className="relative w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg cursor-default"
          style={{
            background: 'rgba(220,38,38,0.25)',
            border: '1px solid rgba(239,68,68,0.55)',
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="18" width="3" height="3" rx="0.5" fill="white" opacity="0.9"/>
            <rect x="7" y="14" width="3" height="7" rx="0.5" fill="white" opacity="0.9"/>
            <rect x="12" y="10" width="3" height="11" rx="0.5" fill="white" opacity="0.9"/>
            <rect x="17" y="6" width="3" height="15" rx="0.5" fill="white" opacity="0.9"/>
            <line x1="14" y1="3" x2="20" y2="9" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
            <line x1="20" y1="3" x2="14" y2="9" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="absolute inset-0 rounded-2xl animate-ping"
            style={{background:'rgba(220,38,38,0.20)', animationDuration:'2s'}} />
        </div>
        <div className="absolute top-12 right-0 whitespace-nowrap text-xs font-semibold text-red-300 px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{
            background: 'rgba(10,8,4,0.85)',
            border: '1px solid rgba(239,68,68,0.4)',
          }}>
          {label}
        </div>
      </div>
    </>
  )
}
