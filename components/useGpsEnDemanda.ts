'use client'
import { useState, useRef, useCallback } from 'react'
import { obtenerGpsAlto, type GpsPos } from '@/lib/gps'

export type GpsEstado = 'inactivo' | 'buscando' | 'ok' | 'fallido'

const MAX_INTENTOS = 3
const PAUSA_ENTRE_INTENTOS = 1000

export function useGpsEnDemanda() {
  const [estado, setEstado] = useState<GpsEstado>('inactivo')
  const [intento, setIntento] = useState(0)
  const [pos, setPos] = useState<GpsPos | null>(null)
  const corriendoRef = useRef(false)
  const cancelarRef = useRef(false)

  const iniciar = useCallback(async () => {
    if (corriendoRef.current) return
    corriendoRef.current = true
    cancelarRef.current = false
    setEstado('buscando')
    setIntento(0)
    setPos(null)

    for (let i = 1; i <= MAX_INTENTOS; i++) {
      if (cancelarRef.current) { corriendoRef.current = false; return }
      setIntento(i)
      const p = await obtenerGpsAlto()
      if (cancelarRef.current) { corriendoRef.current = false; return }
      if (p) {
        setPos(p)
        setEstado('ok')
        corriendoRef.current = false
        return
      }
      if (i < MAX_INTENTOS) {
        await new Promise(r => setTimeout(r, PAUSA_ENTRE_INTENTOS))
      }
    }
    setEstado('fallido')
    corriendoRef.current = false
  }, [])

  const reset = useCallback(() => {
    cancelarRef.current = true
    corriendoRef.current = false
    setEstado('inactivo')
    setIntento(0)
    setPos(null)
  }, [])

  // Devuelve la posicion si esta lista. Si esta buscando, espera. Si fallo, devuelve null.
  const obtener = useCallback(async (): Promise<GpsPos | null> => {
    if (estado === 'ok' && pos) return pos
    if (estado === 'inactivo' || estado === 'fallido') {
      // Disparar intento sincronico final
      await iniciar()
    }
    // Esperar al final del proceso si esta buscando
    return await new Promise<GpsPos | null>(resolve => {
      const check = () => {
        if (!corriendoRef.current) {
          resolve(pos)
        } else {
          setTimeout(check, 200)
        }
      }
      check()
    })
  }, [estado, pos, iniciar])

  return { estado, intento, pos, iniciar, reset, obtener, MAX_INTENTOS }
}
