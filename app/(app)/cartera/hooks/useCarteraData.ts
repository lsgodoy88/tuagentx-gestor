'use client'
import { useState, useRef, useCallback } from 'react'
import { saveCache, loadCache } from '@/lib/offlineCache'

type TotalReal = { saldoPendiente: number; saldoTotal: number; clientes: number }

export function useCarteraData(
  filtroDia: string,
  vendedorPagoId: string,
  setPagos: (pagos: any[]) => void,
  userRole: string | undefined,
) {
  const [carteras, setCarteras] = useState<any[]>([])
  const [metas, setMetas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [cacheAgeCartera, setCacheAgeCartera] = useState<number | null>(null)
  const [loadingBusqueda, setLoadingBusqueda] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [hayMas, setHayMas] = useState(false)
  const [paginaActual, setPaginaActual] = useState(1)
  const [totalReal, setTotalReal] = useState<TotalReal | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargarDatos = useCallback(async (q = '') => {
    setPaginaActual(1)
    const url = q ? `/api/cartera?limit=500&q=${encodeURIComponent(q)}` : '/api/cartera?limit=500'
    const recaudosUrl = filtroDia
      ? `/api/recaudos?limit=200&fecha=${filtroDia}${vendedorPagoId ? '&vendedorId=' + vendedorPagoId : ''}`
      : `/api/recaudos?limit=200${vendedorPagoId ? '&vendedorId=' + vendedorPagoId : ''}`

    if (!q) {
      const cached = loadCache<any>('cartera')
      if (cached) {
        const { r1, r2, r3 } = cached.data
        setCarteras(r1.carteras || [])
        setHayMas((r1.pages ?? 1) > 1)
        setPagos(r2.pagos || [])
        setMetas(r3.metas || [])
        const age = Math.floor((Date.now() - cached.savedAt) / 60_000)
        setCacheAgeCartera(age)
        setLoading(false)
        Promise.all([
          fetch(url).then(r => r.json()),
          fetch(recaudosUrl).then(r => r.json()).catch(() => ({ pagos: [] })),
          fetch('/api/cartera/metas').then(r => r.json()).catch(() => ({ metas: [] })),
        ]).then(([nr1, nr2, nr3]) => {
          if (nr1.carteras) {
            saveCache('cartera', { r1: nr1, r2: nr2, r3: nr3 })
            setCarteras(nr1.carteras || [])
            setHayMas((nr1.pages ?? 1) > 1)
            if (nr1.totalSaldoPendiente !== undefined) setTotalReal({ saldoPendiente: nr1.totalSaldoPendiente, saldoTotal: nr1.totalSaldoTotal, clientes: nr1.total || 0 })
            setPagos(nr2.pagos || [])
            setMetas(nr3.metas || [])
            setOffline(false)
            setCacheAgeCartera(null)
          }
        }).catch(() => { setOffline(true) })
        return
      }
      setLoading(true)
    } else {
      setLoadingBusqueda(true)
    }

    let r1: any, r2: any, r3: any
    try {
      ;[r1, r2, r3] = await Promise.all([
        fetch(url).then(r => r.json()),
        fetch(recaudosUrl).then(r => r.json()).catch(() => ({ pagos: [] })),
        fetch('/api/cartera/metas').then(r => r.json()).catch(() => ({ metas: [] })),
      ])
      if (!q && r1.carteras) {
        saveCache('cartera', { r1, r2, r3 })
        setOffline(false)
        setCacheAgeCartera(null)
      }
    } catch {
      if (q) { setLoadingBusqueda(false); return }
      setOffline(true)
      setLoading(false)
      return
    }
    setCarteras(r1.carteras || [])
    setHayMas((r1.pages ?? 1) > 1)
    if (r1.totalSaldoPendiente !== undefined) setTotalReal({ saldoPendiente: r1.totalSaldoPendiente, saldoTotal: r1.totalSaldoTotal, clientes: r1.total || 0 })
    setPagos(r2.pagos || [])
    setMetas(r3.metas || [])
    setLoading(false)
    setLoadingBusqueda(false)
  }, [filtroDia, vendedorPagoId, setPagos])

  const cargarMas = useCallback(async () => {
    if (cargandoMas || !hayMas) return
    setCargandoMas(true)
    const sig = paginaActual + 1
    const url = buscar
      ? `/api/cartera?limit=15&page=${sig}&q=${encodeURIComponent(buscar)}`
      : `/api/cartera?limit=15&page=${sig}`
    const data = await fetch(url).then(r => r.json())
    setCarteras(prev => [...prev, ...(data.carteras || [])])
    setPaginaActual(sig)
    setHayMas(sig < (data.pages ?? 1))
    setCargandoMas(false)
  }, [cargandoMas, hayMas, paginaActual, buscar])

  const onBuscarChange = useCallback((valor: string) => {
    setBuscar(valor)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => cargarDatos(valor), 400)
  }, [cargarDatos])

  // inicializar recibe setVendedores para evitar dependencia circular con usePagos
  const inicializar = useCallback(async (setVendedores: (v: any[]) => void) => {
    await cargarDatos()
    if (userRole !== 'vendedor') {
      fetch('/api/empleados?rol=vendedor')
        .then(r => r.json())
        .then(d => setVendedores(d.empleados || []))
        .catch(() => {})
    }
  }, [cargarDatos, userRole])

  return {
    carteras,
    metas,
    loading,
    offline,
    cacheAgeCartera,
    loadingBusqueda,
    buscar, setBuscar,
    hayMas, setHayMas,
    paginaActual, setPaginaActual,
    totalReal,
    cargandoMas,
    cargarDatos,
    cargarMas,
    onBuscarChange,
    inicializar,
    setMetas,
  }
}
