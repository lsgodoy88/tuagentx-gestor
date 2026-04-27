'use client'

interface Tab {
  id: string
  label: string
  activeColor?: string
}

interface Props {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export default function TabsNav({ tabs, active, onChange }: Props) {
  return (
    <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={
            "flex-1 py-2 rounded-lg text-sm font-medium transition-colors " +
            (active === tab.id
              ? (tab.activeColor || "bg-zinc-700") + " text-white"
              : "text-zinc-500 hover:text-zinc-300")
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
