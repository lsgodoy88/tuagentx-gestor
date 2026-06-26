'use client'
/**
 * useNetwork — testigo de red real (no navigator.onLine)
 *
 * Hace ping a /api/ping cada 15s.
 * Requiere 2 fallos consecutivos para declarar offline (evita falsos
 * positivos por latencia puntual en datos móviles); 1 éxito basta para
 * volver a online (recuperación rápida).
 * online=true  → red OK
 * online=false → 2+ fallos consecutivos sin respuesta
 * lastOnline   → timestamp del último ping exitoso
 */
import { useEffect, useRef, useState } from 'react'

const PING_INTERVAL = 15_000   // 15s
const PING_TIMEOUT  =  8_000   // 8s — más realista en 3G/4G real
const FAILS_TO_OFFLINE = 2     // fallos consecutivos antes de marcar offline

export function useNetwork() {
  const [online, setOnline]         = useState(true)
  const [lastOnline, setLastOnline] = useState<Date | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const consecutiveFails = useRef(0)

  async function ping() {
    try {
      const ctrl = new AbortController()
      const id = setTimeout(() => ctrl.abort(), PING_TIMEOUT)
      const res = await fetch('/api/ping', {
        signal: ctrl.signal,
        cache: 'no-store',
        headers: { 'x-ping': '1' },
      })
      clearTimeout(id)
      if (res.ok) {
        consecutiveFails.current = 0
        setOnline(true)
        setLastOnline(new Date())
      } else {
        registrarFallo()
      }
    } catch {
      registrarFallo()
    }
  }

  function registrarFallo() {
    consecutiveFails.current += 1
    if (consecutiveFails.current >= FAILS_TO_OFFLINE) {
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
