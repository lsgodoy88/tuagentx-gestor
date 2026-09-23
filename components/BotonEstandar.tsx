import React from 'react'

interface BotonEstandarProps {
  onClick?: () => void
  children: React.ReactNode
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

/**
 * Botón estándar TuAgentX — fondo #0f1623, borde rgba(255,255,255,0.12)
 * Uso: <BotonEstandar onClick={...}>⚙️ Categorías</BotonEstandar>
 */
export default function BotonEstandar({ onClick, children, className = '', disabled, type = 'button' }: BotonEstandarProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={{ background: '#0f1623', border: '1px solid rgba(255,255,255,0.12)' }}
    >
      {children}
    </button>
  )
}
