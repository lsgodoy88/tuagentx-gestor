'use client'
import React, { useState, useEffect } from 'react'
import { formatCOP, parseCOP } from '../_lib/utils'

export function NumInput({ value, onChange, onBlur, width = 90 }: { value: string; onChange: (v: string) => void; onBlur?: () => void; width?: number }) {
  const [display, setDisplay] = useState(value ? formatCOP(value) : '')
  useEffect(() => { setDisplay(value ? formatCOP(value) : '') }, [value])
  return (
    <input
      value={display}
      onChange={e => { const raw = parseCOP(e.target.value); setDisplay(formatCOP(raw)); onChange(raw) }}
      onBlur={onBlur}
      style={{ background:'transparent', color:'inherit', border:'none', outline:'none', width, fontSize:13 }}
    />
  )
}
