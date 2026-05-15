/**
 * useNetwork — testigo de red real (no navigator.onLine)
 *
 * Hace ping a /api/health cada 15s.
 * online=true  → red OK
 * online=false → sin respuesta
 * lastOnline   → timestamp del último ping exitoso
 */
'use client'
import { useEffect, useRef, useState } from 'react'

const PING_INTERVAL = 15_000   // 15s
const PING_TIMEOUT  =  5_000   // 5s para considerar fallo

export function useNetwork() {
  const [online, setOnline]         = useState(true)
  const [lastOnline, setLastOnline] = useState<Date | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

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
        setOnline(true)
        setLastOnline(new Date())
      } else {
        setOnline(false)
      }
    } catch {
      setOnline(false)
    }
  }

  useEffect(() => {
    ping()
    timer.current = setInterval(ping, PING_INTERVAL)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [])

  return { online, lastOnline }
}
