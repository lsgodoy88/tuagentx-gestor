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
    <div className="flex gap-1 tab-pills rounded-xl p-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={
            "flex-1 py-2 text-sm font-medium transition-colors " +
            (active === tab.id ? "tab-active" : "text-white hover:text-white")
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
