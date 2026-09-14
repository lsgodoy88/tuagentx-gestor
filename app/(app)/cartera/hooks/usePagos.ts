'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { mesBogota, anioBogota } from '@/lib/fechas'
import type { PagoListado } from '@/lib/types/cartera'

export function usePagos(vendedores: any[]) {
  const [pagos, setPagos] = useState<PagoListado[]>([])
  const [loadingPagos, setLoadingPagos] = useState(false)
  const [pagosGlobal, setPagosGlobal] = useState<any[]>([])
  const [loadingPagosGlobal, setLoadingPagosGlobal] = useState(false)
  const [busquedaPagos, setBusquedaPagos] = useState('')
  const [vendedorPagoId, setVendedorPagoId] = useState('')
  const [filtroDia, setFiltroDia] = useState(() => {
    try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) } catch { return '' }
  })
  const [pickerDiaAbierto, setPickerDiaAbierto] = useState(false)
  const [mesPagos, setMesPagos] = useState(mesBogota)
  const [anioPagos, setAnioPagos] = useState(anioBogota)
  const [notaPopupId, setNotaPopupId] = useState<string | null>(null)
  const [isDesktopPagos, setIsDesktopPagos] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  )
  const notaPopupIdRef = useRef<string | null>(null)
  const filtroDiaInputRef = useRef<HTMLInputElement>(null)

  // Resize detector
  useEffect(() => {
    const onResize = () => setIsDesktopPagos(window.innerWidth >= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Cerrar nota popup al click fuera
  useEffect(() => {
    notaPopupIdRef.current = notaPopupId
  }, [notaPopupId])
  useEffect(() => {
    const close = () => { if (notaPopupIdRef.current) setNotaPopupId(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // Cerrar picker día al click fuera
  useEffect(() => {
    if (!pickerDiaAbierto) return
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-picker-dia]')) setPickerDiaAbierto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerDiaAbierto])

  // Búsqueda global con debounce
  useEffect(() => {
    if (!busquedaPagos.trim() || busquedaPagos.trim().length < 3) { setPagosGlobal([]); return }
    const q = busquedaPagos.trim()
    const timer = setTimeout(async () => {
      setLoadingPagosGlobal(true)
      try {
        const url = `/api/recaudos?limit=1000${vendedorPagoId ? '&vendedorId=' + vendedorPagoId : ''}&q=${encodeURIComponent(q)}`
        const r = await fetch(url).then(r => r.json()).catch(() => ({ pagos: [] }))
        setPagosGlobal(r.pagos || [])
      } finally { setLoadingPagosGlobal(false) }
    }, 350)
    return () => clearTimeout(timer)
  }, [busquedaPagos, vendedorPagoId])

  const cargarPagos = useCallback(async (
    mes = mesPagos,
    anio = anioPagos,
    vendedorId = vendedorPagoId,
    diaOverride?: string,
  ) => {
    setLoadingPagos(true)
    const diaEfectivo = diaOverride !== undefined ? diaOverride : filtroDia
    try {
      const url = diaEfectivo
        ? `/api/recaudos?limit=200&fecha=${diaEfectivo}${vendedorId ? '&vendedorId=' + vendedorId : ''}`
        : `/api/recaudos?limit=500&mes=${mes}&anio=${anio}${vendedorId ? '&vendedorId=' + vendedorId : ''}`
      const r = await fetch(url).then(r => r.json()).catch(() => ({ pagos: [] }))
      setPagos(r.pagos || [])
    } finally {
      setLoadingPagos(false)
    }
  }, [mesPagos, anioPagos, vendedorPagoId, filtroDia])

  return {
    pagos, setPagos,
    loadingPagos,
    pagosGlobal,
    loadingPagosGlobal,
    busquedaPagos, setBusquedaPagos,
    vendedorPagoId, setVendedorPagoId,
    filtroDia, setFiltroDia,
    pickerDiaAbierto, setPickerDiaAbierto,
    mesPagos, setMesPagos,
    anioPagos, setAnioPagos,
    notaPopupId, setNotaPopupId,
    isDesktopPagos,
    filtroDiaInputRef,
    cargarPagos,
  }
}
