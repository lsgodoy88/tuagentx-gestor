'use client'

interface Props {
  value: string
  onChange: (val: string) => void
  className?: string
}

export default function SelectorMes({ value, onChange, className }: Props) {
  const anioActual = new Date().getFullYear()
  const opciones: { val: string; label: string }[] = []

  for (const anio of [anioActual - 1, anioActual]) {
    for (let i = 0; i < 12; i++) {
      const d = new Date(anio, i, 15)
      const val = d.toISOString().slice(0, 7)
      const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
        .replace(' de ', ' ')
        .replace(/^\w/, c => c.toUpperCase())
      opciones.push({ val, label })
    }
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className || "bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500"}
    >
      {opciones.map(o => (
        <option key={o.val} value={o.val}>{o.label}</option>
      ))}
    </select>
  )
}
