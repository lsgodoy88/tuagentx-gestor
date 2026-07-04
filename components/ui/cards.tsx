/**
 * TuAgentX — Card Components
 * Contenedores: sin efectos GPU (sin boxShadow, sin backdrop-filter, sin hover-lift, sin fade-up)
 * Datos: CountUp, shimmer skeleton, live-ping — se mantienen
 */
import type { CSSProperties, ReactNode } from 'react'

// ── KPI Glass genérico ─────────────────────────────────────────────
interface CardKPIProps {
  children: ReactNode
  stagger?: 1 | 2 | 3 | 4
  className?: string
  center?: boolean
}
export function CardKPI({ children, className = '', center = true }: CardKPIProps) {
  return (
    <div
      className={['rounded-2xl card-glass', center ? 'flex flex-col items-center justify-center min-h-[110px]' : '', className].filter(Boolean).join(' ')}
      style={{ background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.30)',boxShadow:'0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 12px' } as CSSProperties}
    >
      {children}
    </div>
  )
}

// Wrapper KPI group
interface CardKPIGroupProps {
  children: ReactNode
  cols?: 2 | 4
  className?: string
}
export function CardKPIGroup({ children, cols = 2, className = '' }: CardKPIGroupProps) {
  return (
    <div className={[`grid grid-cols-${cols} gap-3`, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

// ── CardCountAdmin ─────────────────────────────────────────────────
interface CardCountAdminProps {
  stagger?: 1 | 2 | 3 | 4
  icon: string
  label: string
  primary: ReactNode
  secondary: ReactNode
  primaryLabel: string
  secondaryLabel: string
  primaryColor?: string
  compact?: boolean
  onClick?: () => void
}
export function CardCountAdmin({
  icon, label, primary, secondary,
  primaryLabel, secondaryLabel,
  primaryColor = 'text-white',
  compact = false,
  onClick,
}: CardCountAdminProps) {
  return (
    <div
      className="rounded-2xl flex flex-col items-center justify-center min-h-[110px] card-glass hover-lift"
      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.30)', boxShadow: '0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 12px', cursor: onClick ? 'pointer' : 'default' } as CSSProperties}
      onClick={onClick}
    >
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <span className="text-sm">{icon}</span>
        <span className="text-white text-sm font-bold tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline justify-center gap-1.5">
        <span className={`${primaryColor} ${compact ? 'text-sm' : 'text-lg'} font-bold`}>{primary}</span>
        <span className="text-white/40 text-base font-light">/</span>
        <span className={`text-white ${compact ? 'text-sm' : 'text-lg'} font-bold`}>{secondary}</span>
      </div>
      <div className="flex justify-center gap-4 mt-1">
        <span className="text-white/70 text-sm font-medium">{primaryLabel}</span>
        <span className="text-white/70 text-sm font-medium">{secondaryLabel}</span>
      </div>
    </div>
  )
}

// ── CardDark — contenedores principales ───────────────────────────
interface CardDarkProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}
export function CardDark({ children, className = '', style }: CardDarkProps) {
  return (
    <div
      className={['rounded-2xl', className].filter(Boolean).join(' ')}
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', ...style } as CSSProperties}
    >
      {children}
    </div>
  )
}

export function CardDarkStrong({ children, className = '', style }: CardDarkProps) {
  return (
    <div
      className={['rounded-2xl', className].filter(Boolean).join(' ')}
      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', ...style } as CSSProperties}
    >
      {children}
    </div>
  )
}

// ── Skeleton CardCountAdmin — shimmer en datos, sin fade-up en contenedor ──
export function CardCountAdminSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col items-center justify-center min-h-[110px]"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' } as CSSProperties}
    >
      {/* shimmer en los datos — correcto */}
      <div className="shimmer rounded-full h-4 w-24 mb-3" />
      <div className="flex items-center gap-2 mb-2">
        <div className="shimmer rounded h-6 w-12" />
        <div className="text-white/20 text-base">/</div>
        <div className="shimmer rounded h-6 w-12" />
      </div>
      <div className="flex gap-4">
        <div className="shimmer rounded h-3 w-10" />
        <div className="shimmer rounded h-3 w-10" />
      </div>
    </div>
  )
}

// ── CardSub — sub-items internos ──────────────────────────────────
interface CardSubProps {
  children: ReactNode
  alerta?: boolean
  className?: string
  style?: CSSProperties
}
export function CardSub({ children, alerta = false, className = '', style }: CardSubProps) {
  return (
    <div
      className={['rounded-xl', className].filter(Boolean).join(' ')}
      style={{
        background: alerta ? 'rgba(127,29,29,0.50)' : 'rgba(255,255,255,0.08)',
        border: alerta ? '1px solid rgba(239,68,68,0.30)' : '1px solid rgba(255,255,255,0.30)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.25)',
        borderRadius: 10,
        ...style,
      } as CSSProperties}
    >
      {children}
    </div>
  )
}
