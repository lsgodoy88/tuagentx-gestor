'use client'
import { useState, useCallback } from 'react'

export const EDADES = ['0-30', '31-60', '61-90', '91-120', '+120'] as const
export type Edad = typeof EDADES[number]

export function useEdadesCartera() {
  const [porEdadApi, setPorEdadApi] = useState<Record<string, number>>({})
  const [porEdadVendedorApi, setPorEdadVendedorApi] = useState<Record<string, Record<string, number>>>({})
  const [edadesCargadas, setEdadesCargadas] = useState(false)
  const [cargandoEdades, setCargandoEdades] = useState(false)

  const cargarEdades = useCallback(async () => {
    setCargandoEdades(true)
    try {
      const r = await fetch('/api/cartera/edades')
      const d = await r.json()
      if (d.porEdad) setPorEdadApi(d.porEdad)
      if (d.porEdadVendedor) setPorEdadVendedorApi(d.porEdadVendedor)
      setEdadesCargadas(true)
    } catch (e) {
      console.error(e)
    } finally {
      setCargandoEdades(false)
    }
  }, [])

  return {
    porEdadApi,
    porEdadVendedorApi,
    edadesCargadas,
    cargandoEdades,
    cargarEdades,
  }
}
