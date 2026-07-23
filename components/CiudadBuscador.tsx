'use client'
import React, { useState, useEffect } from 'react'

interface Props {
  value: string
  onChange: (ciudad: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export default function CiudadBuscador({ value, onChange, placeholder = 'Buscar ciudad... ej: Tolima/Ibagué', autoFocus }: Props) {
  const [colombiaData, setColombiaData] = useState<any[]>([])
  const [query, setQuery] = useState(value || '')
  const [sugeridas, setSugeridas] = useState<string[]>([])

  useEffect(() => {
    fetch('/colombia.json').then(r => r.json()).then(d => setColombiaData(d)).catch(() => {})
  }, [])

  useEffect(() => { setQuery(value || '') }, [value])

  function buscar(q: string) {
    setQuery(q)
    if (q.length < 2) { setSugeridas([]); return }
    const resultados: string[] = []
    colombiaData.forEach((dep: any) => {
      dep.ciudades?.forEach((c: string) => {
        const texto = dep.departamento + '/' + c
        if (texto.toLowerCase().includes(q.toLowerCase())) resultados.push(texto)
      })
    })
    setSugeridas(resultados.slice(0, 8))
  }

  function seleccionar(ciudad: string) {
    setQuery(ciudad)
    setSugeridas([])
    onChange(ciudad)
  }

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={e => buscar(e.target.value)}
        onBlur={() => setTimeout(() => setSugeridas([]), 150)}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
        style={{ background: '#0d1220', border: '1px solid #1e2a3d' }}
      />
      {sugeridas.length > 0 && (
        <div className="absolute z-20 w-full mt-1 rounded-xl overflow-hidden shadow-xl" style={{ background: '#0d1220', border: '1px solid #1e2a3d' }}>
          {sugeridas.map(c => (
            <button key={c} type="button" onMouseDown={() => seleccionar(c)}
              className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors">
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
