'use client'
/**
 * DateInput — input[type=date] con picker correcto en PC y mobile.
 *
 * En PC: showPicker() en onFocus (onClick compite con el ícono nativo del browser).
 * En mobile: showPicker() en onFocus también funciona correctamente.
 *
 * Uso:
 *   <DateInput value={desde} onChange={v => setDesde(v)} />
 *   <DateInput value={hasta} onChange={v => setHasta(v)} className="border-red-500" />
 */

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  min?: string
  max?: string
  disabled?: boolean
}

export function DateInput({ value, onChange, className = '', min, max, disabled }: DateInputProps) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      onFocus={e => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
      className={[
        'bg-[#0d1220] rounded-lg px-3 py-2 text-white text-sm focus:outline-none flex-1 min-w-0 cursor-pointer border border-[#1e2a3d]',
        className
      ].filter(Boolean).join(' ')}
      style={{ colorScheme: 'dark' }}
    />
  )
}
