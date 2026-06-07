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
  const cancelarRef  = useRef(false)
  // Ref espejo de pos — siempre tiene el valor actual aunque obtener() esté en un closure viejo
  const posRef = useRef<GpsPos | null>(null)

  const iniciar = useCallback(async () => {
    if (corriendoRef.current) return
    corriendoRef.current = true
    cancelarRef.current  = false
    setEstado('buscando')
    setIntento(0)
    setPos(null)
    posRef.current = null

    for (let i = 1; i <= MAX_INTENTOS; i++) {
      if (cancelarRef.current) { corriendoRef.current = false; return }
      setIntento(i)
      const p = await obtenerGpsAlto()
      if (cancelarRef.current) { corriendoRef.current = false; return }
      if (p) {
        posRef.current = p        // ← actualizar ref ANTES de setPos
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
    cancelarRef.current  = true
    corriendoRef.current = false
    posRef.current       = null
    setEstado('inactivo')
    setIntento(0)
    setPos(null)
  }, [])

  // Devuelve la posición si ya está lista.
  // Si está buscando, espera hasta que termine y lee posRef (no el closure de pos).
  // Si falló o inactivo, intenta un ciclo más.
  const obtener = useCallback(async (): Promise<GpsPos | null> => {
    if (estado === 'ok' && posRef.current) return posRef.current
    if (estado === 'inactivo' || estado === 'fallido') {
      await iniciar()
    }
    // Esperar a que corriendoRef quede en false y leer posRef actualizado
    return await new Promise<GpsPos | null>(resolve => {
      const check = () => {
        if (!corriendoRef.current) {
          resolve(posRef.current)    // ← ref, no closure de pos
        } else {
          setTimeout(check, 200)
        }
      }
      check()
    })
  }, [estado, iniciar])

  return { estado, intento, pos, iniciar, reset, obtener, MAX_INTENTOS }
}
