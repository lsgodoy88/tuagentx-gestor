'use client'
import { useEffect, useState, useCallback } from 'react'

function pad(n: number) { return String(n).padStart(2, '0') }
function fmt(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
function getInicioMs(turno: { inicio: string; inicioBogota?: string | null }) {
  if (turno.inicioBogota) {
    const [hh, mm] = turno.inicioBogota.split(':').map(Number)
    const bog = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
    bog.setHours(hh, mm, 0, 0)
    if (bog.getTime() > Date.now()) bog.setDate(bog.getDate() - 1)
    return bog.getTime()
  }
  return new Date(turno.inicio).getTime()
}

// Re-render confinado aquí — el padre (811 líneas) no se toca cada segundo
export function TurnoTimer({
  turno,
  className = 'font-mono font-semibold text-emerald-400 text-sm tabular-nums',
}: {
  turno: { inicio: string; inicioBogota?: string | null }
  className?: string
}) {
  const calc = useCallback(() => {
    const diff = Math.max(0, Math.floor((Date.now() - getInicioMs(turno)) / 1000))
    return fmt(diff)
  }, [turno])

  const [display, setDisplay] = useState(calc)

  useEffect(() => {
    setDisplay(calc())
    const id = setInterval(() => setDisplay(calc()), 1000)
    return () => clearInterval(id)
  }, [calc])

  return <span className={className}>{display}</span>
}

// Monta solo en pausa — mismo aislamiento
export function PausaTimer({
  pausaInicio,
  pausaDuracionMin,
  onExpired,
}: {
  pausaInicio: string
  pausaDuracionMin: number
  onExpired: () => void
}) {
  const calc = useCallback(() => {
    const ini = new Date(pausaInicio).getTime()
    const fin = ini + pausaDuracionMin * 60000
    const ahora = Date.now()
    const restante = Math.max(0, Math.floor((fin - ahora) / 1000))
    return { restante: fmt(restante), expired: restante === 0 }
  }, [pausaInicio, pausaDuracionMin])

  const [state, setState] = useState(calc)

  useEffect(() => {
    setState(calc())
    const id = setInterval(() => {
      const next = calc()
      setState(next)
      if (next.expired) { clearInterval(id); onExpired() }
    }, 1000)
    return () => clearInterval(id)
  }, [calc, onExpired])

  return (
    <span className="font-mono font-bold text-amber-400 text-lg flex-1 tabular-nums">
      {state.restante}
    </span>
  )
}
