'use client'
import { useState, useEffect } from 'react'

function formatCOP(val: string | number): string {
  const num = typeof val === 'string' ? parseFloat(val.replace(/\./g, '').replace(',', '.')) : val
  if (isNaN(num) || num === 0) return ''
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num)
}

function parseCOP(val: string): string {
  return val.replace(/\./g, '').replace(/[^0-9]/g, '')
}

interface Props {
  value: string | number
  onChange: (val: string) => void
  placeholder?: string
  className?: string
  readOnly?: boolean
  prefix?: string
}

export default function InputMoneda({ value, onChange, placeholder = '0', className = '', readOnly = false, prefix = '$' }: Props) {
  const [display, setDisplay] = useState('')

  useEffect(() => {
    if (value === '' || value === 0 || value === '0') { setDisplay(''); return }
    setDisplay(formatCOP(String(value)))
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseCOP(e.target.value)
    setDisplay(raw ? formatCOP(raw) : '')
    onChange(raw)
  }

  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">{prefix}</span>}
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`${prefix ? 'pl-6' : ''} ${className}`}
      />
    </div>
  )
}
