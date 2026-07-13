// hooks/useOrdenesData.ts
'use client'
import { useState } from 'react'
import { getOrdenesCache, setOrdenesCache, clearOrdenesCache } from '@/lib/ordenes-cache'

export type TabOrdenes = 'pendiente' | 'alistado' | 'despachado'

export function useOrdenesData(origenForzado: string) {
  const [despachosPorTab, setDespachosPorTab] = useState<Record<string, any[]>>(() => {
    if (typeof window === 'undefined') return { pendiente: [], alistado: [], despachado: [] }
    return getOrdenesCache(origenForzado)?.despachosPorTab ?? { pendiente: [], alistado: [], despachado: [] }
  })
  const [cargando, setCargando] = useState(() => {
    if (typeof window === 'undefined') return true
    return !getOrdenesCache(origenForzado)
  })
  const [cursores, setCursores] = useState<Record<string, string | null>>({ pendiente: null, alistado: null, despachado: null })
  const [hayMasPorTab, setHayMasPorTab] = useState<Record<string, boolean>>({ pendiente: false, alistado: false, despachado: false })
  const [cargandoMasTab, setCargandoMasTab] = useState(false)
  const [ciudadLocal, setCiudadLocal] = useState<string | null>(null)
  const [bodegaPuedeEnviar, setBodegaPuedeEnviar] = useState(false)
  const [ultimaSync, setUltimaSync] = useState<string | null>(null)

  async function cargarTab(
    tab: TabOrdenes,
    origen: string,
    reset = false,
    busqueda = '',
    cursoresActuales?: Record<string, string | null>
  ) {
    if (reset) {
      setCursores(p => ({ ...p, [tab]: null }))
      setDespachosPorTab(p => ({ ...p, [tab]: [] }))
    }
    try {
      const params = new URLSearchParams()
      if (origen !== 'propia') params.set('origenId', origen)
      params.set('estado', tab)
      const cur = cursoresActuales ? cursoresActuales[tab] : null
      if (!reset && cur) params.set('cursor', cur)
      if (busqueda) params.set('q', busqueda)
      const res = await fetch(`/api/bodega/despachos?${params}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.error) return
      setDespachosPorTab(p => ({ ...p, [tab]: reset ? (data.despachos || []) : [...(p[tab] || []), ...(data.despachos || [])] }))
      setCursores(p => ({ ...p, [tab]: data.nextCursor || null }))
      setHayMasPorTab(p => ({ ...p, [tab]: !!data.hayMas }))
      if (data.ciudadLocal) setCiudadLocal(data.ciudadLocal)
      if (data.bodegaPuedeEnviar !== undefined) setBodegaPuedeEnviar(data.bodegaPuedeEnviar)
      if (data.ultimaSyncBodega) setUltimaSync(data.ultimaSyncBodega)
    } catch { /* silencioso */ }
  }

  async function cargarDatos(origen: string, busqueda = '') {
    setCargando(true)
    clearOrdenesCache(origen)
    try {
      await Promise.all([
        cargarTab('pendiente', origen, true, busqueda),
        cargarTab('alistado', origen, true, busqueda),
        cargarTab('despachado', origen, true, busqueda),
      ])
      setDespachosPorTab(prev => {
        setOrdenesCache(origen, { despachosPorTab: prev })
        return prev
      })
    } finally {
      setCargando(false)
    }
  }

  async function cargarMasTab(tab: TabOrdenes, origen: string, busqueda = '') {
    if (!hayMasPorTab[tab] || cargandoMasTab) return
    setCargandoMasTab(true)
    try { await cargarTab(tab, origen, false, busqueda, cursores) }
    finally { setCargandoMasTab(false) }
  }

  function actualizarOrden(id: string, cambios: any) {
    setDespachosPorTab(prev => {
      const next = { ...prev }
      for (const tab of Object.keys(next) as TabOrdenes[]) {
        next[tab] = next[tab].map((d: any) => d.id === id ? { ...d, ...cambios } : d)
      }
      return next
    })
  }

  function moverOrdenEntreTab(id: string, deTab: TabOrdenes, aTab: TabOrdenes, cambios: any) {
    setDespachosPorTab(prev => {
      const next = { ...prev }
      const orden = next[deTab]?.find((d: any) => d.id === id)
      if (!orden) return prev
      next[deTab] = next[deTab].filter((d: any) => d.id !== id)
      next[aTab] = [{ ...orden, ...cambios }, ...(next[aTab] || [])]
      return next
    })
  }

  return {
    despachosPorTab, setDespachosPorTab,
    cargando,
    cursores, hayMasPorTab, cargandoMasTab,
    ciudadLocal, bodegaPuedeEnviar, ultimaSync,
    cargarTab, cargarDatos, cargarMasTab,
    actualizarOrden, moverOrdenEntreTab,
    limpiarCache: () => clearOrdenesCache(origenForzado),
  }
}
