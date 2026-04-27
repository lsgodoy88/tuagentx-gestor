'use client'
import { useState } from 'react'

interface Props {
  label?: string
  className?: string
}

export default function ReportePDFBtn({ label = 'Descargar PDF', className = '' }: Props) {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  return (
    <div className={'flex items-center gap-2 ' + className}>
      <input
        type="month"
        value={mes}
        onChange={e => setMes(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
      />
      <button
        onClick={() => window.open('/pdf-impulso?fecha=' + mes + '-01', '_blank')}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
      >
        📄 {label}
      </button>
    </div>
  )
}
