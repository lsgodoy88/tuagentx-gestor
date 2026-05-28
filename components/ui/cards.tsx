/**
 * TuAgentX — Card Components
 * Fuente de verdad: tipo de card → visual + efectos atados.
 * Nunca usar inline styles sueltos para cards. Usar estos componentes.
 *
 * CardKPIGroup + CardKPI    → glass blur genérico, hover-lift, fade-up, stagger
 * CardCountAdmin            → glass blur admin — icon/label + X/Y + sublabels (CONGELADO)
 * CardDark                  → dark azul, contenedores, listas
 * CardDarkStrong            → dark azul énfasis, turno activo, acciones
 * CardSub                   → sub-item dentro de CardDark
 */
import type { CSSProperties, ReactNode } from 'react'

// ── KPI Glass genérico ─────────────────────────────────────────────
// CRÍTICO: siempre debe vivir dentro de CardKPIGroup (wrapper sin bg)
// para que el blur atraviese al fondo de la página.
interface CardKPIProps {
  children: ReactNode
  stagger?: 1 | 2 | 3 | 4
  className?: string
  center?: boolean
}
export function CardKPI({ children, stagger = 1, className = '', center = true }: CardKPIProps) {
  return (
    <div
      className={[
        'rounded-2xl hover-lift',
        center ? 'flex flex-col items-center justify-center min-h-[110px]' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{ background: 'rgba(148,160,185,0.22)', border: '1px solid rgba(148,180,255,0.35)', borderRadius: 14, padding: '10px 12px' } as CSSProperties}
    >
      {children}
    </div>
  )
}

// Wrapper para grupos de KPIs — sin background, solo blur + overflow hidden.
// Sin este wrapper el blur de los hijos no puede atravesar al fondo de página.
interface CardKPIGroupProps {
  children: ReactNode
  cols?: 2 | 4
  className?: string
}
export function CardKPIGroup({ children, cols = 2, className = '' }: CardKPIGroupProps) {
  return (
    <div
      className={[`grid grid-cols-${cols} gap-3`, className].filter(Boolean).join(' ')}
      style={{overflow: 'hidden',
        borderRadius: 16,
      } as CSSProperties}
    >
      {children}
    </div>
  )
}

// ── CardCountAdmin — glass blur admin ──────────────────────────────
// CONGELADO: este es el diseño de referencia del dashboard admin.
// Estructura: icon + label | valor primario / valor secundario | sublabel1 / sublabel2
// Colores semánticos: primaryColor controla el número activo/hoy.
// NUNCA modificar sin aprobar un nuevo diseño primero.
//
// Uso:
//   <CardKPIGroup>
//     <CardCountAdmin
//       stagger={1}
//       icon="🛍️"
//       label="Vendedores"
//       primary={stats.vendedoresActivos}
//       secondary={stats.totalVendedores}
//       primaryLabel="en turno"
//       secondaryLabel="activos"
//       primaryColor="text-white"
//     />
//   </CardKPIGroup>
interface CardCountAdminProps {
  stagger?: 1 | 2 | 3 | 4
  icon: string
  label: string
  primary: ReactNode        // valor izquierdo (activo/hoy)
  secondary: ReactNode      // valor derecho (total/mes)
  primaryLabel: string      // sublabel del valor primario
  secondaryLabel: string    // sublabel del valor secundario
  primaryColor?: string     // clase tailwind del color primario, ej: "text-amber-400"
  compact?: boolean         // true → text-lg para valores monetarios largos
}
export function CardCountAdmin({
  stagger = 1,
  icon,
  label,
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  primaryColor = 'text-white',
  compact = false,
}: CardCountAdminProps) {
  return (
    <div
      className={`rounded-2xl hover-lift flex flex-col items-center justify-center min-h-[110px]`}
      style={{ background: 'rgba(148,160,185,0.22)', border: '1px solid rgba(148,180,255,0.35)', borderRadius: 14, padding: '10px 12px' } as CSSProperties}
    >
      {/* Icon + label — más prominente */}
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <span className="text-base">{icon}</span>
        <span className="text-white text-sm font-bold tracking-widest uppercase">{label}</span>
      </div>
      {/* Valores X / Y — más pequeños */}
      <div className="flex items-baseline justify-center gap-1.5">
        <span className={`${primaryColor} ${compact ? 'text-sm' : 'text-lg'} font-bold`}>{primary}</span>
        <span className="text-white/40 text-base font-light">/</span>
        <span className={`text-white ${compact ? 'text-sm' : 'text-lg'} font-bold`}>{secondary}</span>
      </div>
      {/* Sub-labels — más grandes */}
      <div className="flex justify-center gap-4 mt-1">
        <span className="text-white/70 text-sm font-medium">{primaryLabel}</span>
        <span className="text-white/70 text-sm font-medium">{secondaryLabel}</span>
      </div>
    </div>
  )
}

// ── Dark Azul — contenedores principales, listas ──────────────────
interface CardDarkProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}
export function CardDark({ children, className = '', style }: CardDarkProps) {
  return (
    <div
      className={['rounded-2xl fade-up', className].filter(Boolean).join(' ')}
      style={{
        background: 'rgba(148,160,185,0.22)',
        border: '1px solid rgba(148,180,255,0.35)',
        ...style,
      } as CSSProperties}
    >
      {children}
    </div>
  )
}

// ── Dark Azul énfasis — turno activo, acciones importantes ─────────
export function CardDarkStrong({ children, className = '', style }: CardDarkProps) {
  return (
    <div
      className={['rounded-2xl fade-up', className].filter(Boolean).join(' ')}
      style={{
        background: 'rgba(148,160,185,0.28)',
        border: '1px solid rgba(148,180,255,0.45)',
        ...style,
      } as CSSProperties}
    >
      {children}
    </div>
  )
}


// ── Skeleton de CardCountAdmin — misma forma, shimmer ──────────────
export function CardCountAdminSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="rounded-2xl p-4 fade-up flex flex-col items-center justify-center min-h-[110px]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)',
      } as CSSProperties}
    >
      {/* Icon + label */}
      <div className="shimmer rounded-full h-4 w-24 mb-3" />
      {/* Valores */}
      <div className="flex items-center gap-2 mb-2">
        <div className="shimmer rounded h-6 w-12" />
        <div className="text-white/20 text-base">/</div>
        <div className="shimmer rounded h-6 w-12" />
      </div>
      {/* Sublabels */}
      <div className="flex gap-4">
        <div className="shimmer rounded h-3 w-10" />
        <div className="shimmer rounded h-3 w-10" />
      </div>
    </div>
  )
}

// ── Sub-card — ítems internos dentro de CardDark ──────────────────
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
        background: alerta ? 'rgba(127,29,29,0.50)' : 'rgba(148,160,185,0.22)',
        border: alerta
          ? '1px solid rgba(239,68,68,0.30)'
          : '1px solid rgba(148,180,255,0.25)',
        borderRadius: 10,
        ...style,
      } as CSSProperties}
    >
      {children}
    </div>
  )
}
