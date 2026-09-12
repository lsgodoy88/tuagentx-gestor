'use client'
import React from 'react'

interface Props {
  value: string
  onChange: (val: string) => void
  className?: string
  style?: React.CSSProperties
}

export default function SelectorMes({ value, onChange, className, style }: Props) {
  const anioActual = new Date().getFullYear()
  const opciones: { val: string; label: string }[] = []

  const mesActual = new Date().getMonth()
  for (const anio of [anioActual - 1, anioActual]) {
    for (let i = 0; i < 12; i++) {
      if (anio === anioActual && i > mesActual) continue
      const d = new Date(anio, i, 15)
      const val = d.toISOString().slice(0, 7)
      const mesCorto = d.toLocaleDateString('es-CO', { month: 'short', timeZone: 'America/Bogota' }).replace('.','').replace(/^\w/, c => c.toUpperCase())
      const anioLabel = d.getFullYear()
      const label = `${mesCorto} ${anioLabel}`
      opciones.push({ val, label })
    }
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className || "modal-inner-card rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500"}
      style={style}
    >
      {opciones.map(o => (
        <option key={o.val} value={o.val}>{o.label}</option>
      ))}
    </select>
  )
}
