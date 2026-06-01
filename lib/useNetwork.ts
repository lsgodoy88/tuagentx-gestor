'use client'
/**
 * useNetwork — testigo de red real (no navigator.onLine)
 *
 * Hace ping a /api/health cada 15s.
 * Requiere 2 fallos consecutivos para marcar offline → evita falsos positivos.
 * online=true  → red OK
 * online=false → 2+ pings fallidos
 * lastOnline   → timestamp del último ping exitoso
 */
import { useEffect, useRef, useState } from 'react'

const PING_INTERVAL  = 15_000  // 15s
const PING_TIMEOUT   =  8_000  // 8s — más tolerante con latencia real
const FALLOS_MINIMOS =  2      // fallos consecutivos antes de marcar offline

export function useNetwork() {
  const [online, setOnline]         = useState(true)
  const [lastOnline, setLastOnline] = useState<Date | null>(null)
  const timer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const fallos  = useRef(0)

  async function ping() {
    try {
      const ctrl = new AbortController()
      const id = setTimeout(() => ctrl.abort(), PING_TIMEOUT)
      const res = await fetch('/api/health', {
        signal: ctrl.signal,
        cache: 'no-store',
        headers: { 'x-ping': '1' },
      })
      clearTimeout(id)
      if (res.ok) {
        fallos.current = 0
        setOnline(true)
        setLastOnline(new Date())
      } else {
        fallos.current += 1
        if (fallos.current >= FALLOS_MINIMOS) setOnline(false)
      }
    } catch {
      fallos.current += 1
      if (fallos.current >= FALLOS_MINIMOS) setOnline(false)
    }
  }

  useEffect(() => {
    ping()
    timer.current = setInterval(ping, PING_INTERVAL)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [])

  return { online, lastOnline }
}
