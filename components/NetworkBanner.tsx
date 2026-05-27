'use client'
import { useNetwork } from '@/lib/useNetwork'

export function NetworkBanner() {
  const { online, lastOnline } = useNetwork()
  if (online) return null

  const mins = lastOnline
    ? Math.floor((Date.now() - lastOnline.getTime()) / 60_000)
    : null

  const label = mins !== null
    ? `Sin conexión · hace ${mins < 1 ? 'menos de 1 min' : mins + ' min'}`
    : 'Sin conexión'

  return (
    <div
      title={label}
      aria-label={label}
      className="fixed top-4 right-4 z-[9999] group"
    >
      {/* Pin flotante */}
      <div className="relative w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg cursor-default"
        style={{
          background: 'rgba(220,38,38,0.25)',
          border: '1px solid rgba(239,68,68,0.55)',
        }}>

        {/* Icono señal perdida */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-red-400">
          {/* Barras de señal atenuadas */}
          <rect x="2" y="18" width="3" height="3" rx="0.5" fill="white" opacity="0.9"/>
          <rect x="7" y="14" width="3" height="7" rx="0.5" fill="white" opacity="0.9"/>
          <rect x="12" y="10" width="3" height="11" rx="0.5" fill="white" opacity="0.9"/>
          <rect x="17" y="6" width="3" height="15" rx="0.5" fill="white" opacity="0.9"/>
          {/* X roja encima */}
          <line x1="14" y1="3" x2="20" y2="9" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
          <line x1="20" y1="3" x2="14" y2="9" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
        </svg>

        {/* Pulso animado */}
        <span className="absolute inset-0 rounded-2xl animate-ping"
          style={{background:'rgba(220,38,38,0.20)', animationDuration:'2s'}} />
      </div>

      {/* Tooltip — aparece al hover/focus */}
      <div className="absolute top-12 right-0 whitespace-nowrap text-xs font-semibold text-red-300 px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          background: 'rgba(10,8,4,0.85)',
          border: '1px solid rgba(239,68,68,0.4)',
        }}>
        {label}
      </div>
    </div>
  )
}
