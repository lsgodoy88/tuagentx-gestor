'use client'

interface Tab {
  id: string
  label: string
  icon?: string
  activeColor?: string  // legacy — ignorado, usa tab-active
}

interface Props {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/**
 * TabsNav — Componente de tabs unificado
 * - Ancho igual por tab (flex-1)
 * - Misma altura en mobile y desktop (py-3)
 * - Fondo glass oscuro (tab-pills)
 * - Tab activo: tab-active (blanco/22 + blur)
 * - Texto blanco en todos los estados
 */
export default function TabsNav({ tabs, active, onChange, className = '' }: Props) {
  return (
    <div className={`flex gap-1 tab-pills rounded-xl p-1 ${className}`}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={
            'flex-1 py-2 text-sm font-semibold transition-colors ' +
            (active === tab.id ? 'tab-active' : 'text-white hover:text-white')
          }
        >
          {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
