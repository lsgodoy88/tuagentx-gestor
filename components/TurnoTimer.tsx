'use client'
import { useEffect, useState, useCallback } from 'react'

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

function fmtMinutos(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

// Re-render cada 60s — no cada 1s
export function TurnoTimer({
  turno,
  className = 'font-mono font-semibold text-emerald-400 text-sm tabular-nums',
}: {
  turno: { inicio: string; inicioBogota?: string | null }
  className?: string
}) {
  const calc = useCallback(() =>
    fmtMinutos(Date.now() - getInicioMs(turno)),
  [turno])

  const [display, setDisplay] = useState(calc)

  useEffect(() => {
    setDisplay(calc())
    const id = setInterval(() => setDisplay(calc()), 60000)
    return () => clearInterval(id)
  }, [calc])

  return <span className={className}>{display}</span>
}

// Pausa — countdown en minutos, interval 60s
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
    const fin = new Date(pausaInicio).getTime() + pausaDuracionMin * 60000
    const restanteMs = fin - Date.now()
    const restanteMin = Math.max(0, Math.ceil(restanteMs / 60000))
    return { display: `${restanteMin}m`, expired: restanteMs <= 0 }
  }, [pausaInicio, pausaDuracionMin])

  const [state, setState] = useState(calc)

  useEffect(() => {
    setState(calc())
    const id = setInterval(() => {
      const next = calc()
      setState(next)
      if (next.expired) { clearInterval(id); onExpired() }
    }, 60000)
    return () => clearInterval(id)
  }, [calc, onExpired])

  return (
    <span className="font-mono font-bold text-amber-400 text-lg flex-1 tabular-nums">
      {state.display}
    </span>
  )
}
