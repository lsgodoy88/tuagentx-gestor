import React from 'react'

interface Props {
  titulo: string
  icono: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
  cardStyle?: React.CSSProperties
}

export function Seccion({ titulo, icono, isOpen, onToggle, children, cardStyle }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden" style={cardStyle ?? { background: '#060a24', border: '1px solid rgba(59,130,246,0.22)' }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <span className="text-white font-semibold">{icono} {titulo}</span>
        <span className="text-zinc-500 text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  )
}
