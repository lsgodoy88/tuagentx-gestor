'use client'
import { saveCache, loadCache } from '@/lib/offlineCache'
import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { checkPermiso } from '@/lib/permisos'
import type { Pago, Vendedor } from './tipos'
import { PAGE_SIZE } from './tipos'

export function useRecaudos() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const user    = session?.user as any

  const [tab,                 setTab]                 = useState<'pendiente' | 'enviado' | 'revisar'>('pendiente')
  const [fecha,               setFecha]               = useState<string>('')
  const [modalAjuste, setModalAjuste] = useState(null as {syncDeudaId:string;montoSugerido:number;cliente:string;factura:number}|null)
  const [ajusteMonto, setAjusteMonto] = useState("")
  const [ajusteNota, setAjusteNota] = useState("")
  const [ajusteLoading, setAjusteLoading] = useState(false)
  const [ajusteMsg, setAjusteMsg] = useState("")
  const [pagos,               setPagos]               = useState<Pago[]>([])
  const [nextCursor,          setNextCursor]          = useState<string | null>(null)
  const [hasMore,             setHasMore]             = useState(false)
  const [loading,             setLoading]             = useState(false)
  const [loadingMore,         setLoadingMore]         = useState(false)
  const [page,                setPage]                = useState(0)
  const [vendedorId,          setVendedorId]          = useState('')
  const [marcadoEliminar,     setMarcadoEliminar]     = useState<string | null>(null)
  const [modalEliminarPaso,   setModalEliminarPaso]   = useState<'cerrado' | 'pedir' | 'confirmar'>('cerrado')
  const [reciboBuscado,       setReciboBuscado]       = useState('')
  const [pagoEncontrado,      setPagoEncontrado]      = useState<Pago | null>(null)
  const [buscandoRecibo,      setBuscandoRecibo]       = useState(false)
  const [errorBusquedaRecibo, setErrorBusquedaRecibo]  = useState('')
  const [eliminando,          setEliminando]          = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [vendedores,          setVendedores]          = useState<Vendedor[]>([])
  const [enviando,            setEnviando]            = useState<Set<string>>(new Set())
  const [detalleVariacion,    setDetalleVariacion]    = useState<string | null>(null)
  const [abiertos,            setAbiertos]            = useState<string[]>([])
  const [voucherUrls,         setVoucherUrls]         = useState<Record<string, string>>({})
  const [lightboxUrl,         setLightboxUrl]         = useState<string | null>(null)
  const [seleccionados,       setSeleccionados]       = useState<Set<string>>(new Set())
  const [enviandoSeleccionados, setEnviandoSeleccionados] = useState(false)
  const [isDesktop,           setIsDesktop]           = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : false)
  const fechaInputRef = useRef<HTMLInputElement>(null)
  const [fechaOpen, setFechaOpen] = useState(false)

  const isAdmin = user?.role === 'empresa' || user?.role === 'supervisor'
  const puedeEditarRecaudos = user?.role === 'empresa' || checkPermiso(session, 'editarRecaudos')
  const puedeAdminRecaudos  = user?.role === 'empresa' || checkPermiso(session, 'adminRecaudos')

  const cargarVoucherUrl = async (pagoId: string, voucherKey: string) => {
    if (voucherUrls[pagoId]) return
    const res = await fetch('/api/firma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firma: voucherKey }),
    }).then(r => r.json())
    if (res.url) setVoucherUrls(prev => ({ ...prev, [pagoId]: res.url }))
  }

  const toggleAbierto = (id: string, voucherKey?: string | null) => {
    setAbiertos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    if (voucherKey) cargarVoucherUrl(id, voucherKey)
  }

  const toggleSeleccion = (id: string) =>
    setSeleccionados(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })

  useEffect(() => {
    if (status === 'authenticated' && !isAdmin) router.push('/inicio')
  }, [status, isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/empleados?rol=vendedor&limit=100')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.empleados)) setVendedores(d.empleados) })
      .catch(() => {})
  }, [isAdmin])

  // Cerrar popover eliminar al hacer click fuera
  useEffect(() => {
    if (modalEliminarPaso === 'cerrado') return
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-popover-eliminar]')) cerrarModalEliminar()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [modalEliminarPaso])

  const tabRef = useRef(tab)
  useEffect(() => { tabRef.current = tab }, [tab])

  async function ejecutarAjuste() {
    if (!modalAjuste || !ajusteMonto || !ajusteNota.trim()) return
    setAjusteLoading(true); setAjusteMsg("")
    const res = await fetch("/api/recaudos/ajuste", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({syncDeudaId:modalAjuste.syncDeudaId,monto:Number(ajusteMonto),nota:ajusteNota.trim()})})
    const data = await res.json()
    setAjusteLoading(false)
    if (data.error) { setAjusteMsg("Error: " + data.error); return }
    setAjusteMsg("✅ Ajuste aplicado")
    setTimeout(() => { setModalAjuste(null); setAjusteMonto(""); setAjusteNota(""); setAjusteMsg(""); fetchPagos(null) }, 1500)
  }

    const fetchPagos = useCallback(async (cursor: string | null = null) => {
    if (!isAdmin) return
    const tabSnapshot = tab // capturar tab al inicio del fetch
    const params = new URLSearchParams()
    if (vendedorId) params.set('vendedorId', vendedorId)
    params.set('estado', tabSnapshot)
    if (fecha) params.set('fecha', fecha)
    if (cursor) params.set('cursor', cursor)

    // Stale-while-revalidate: mostrar caché al instante (solo carga inicial sin filtros)
    const cacheKey = `recaudos:${tabSnapshot}:${vendedorId}:${fecha}`
    if (!cursor) {
      const cached = loadCache<any>(cacheKey)
      if (cached?.data?.pagos) {
        if (tabRef.current !== tabSnapshot) return // tab cambió — descartar
        setPagos(cached.data.pagos)
        setNextCursor(cached.data.nextCursor ?? null)
        setHasMore(cached.data.hasMore ?? false)
        setSeleccionados(new Set()); setPage(0)
        // Refrescar en background sin spinner
        fetch(`/api/recaudos?${params}`).then(r => r.json()).then(data => {
          if (tabRef.current !== tabSnapshot) return // tab cambió — descartar
          const nuevos = data.pagos ?? []
          saveCache(cacheKey, { pagos: nuevos, nextCursor: data.nextCursor, hasMore: data.hasMore })
          setPagos(nuevos)
          setNextCursor(data.nextCursor ?? null)
          setHasMore(data.hasMore ?? false)
        }).catch(() => {})
        return
      }
      setLoading(true); setSeleccionados(new Set()); setPage(0)
    } else setLoadingMore(true)

    try {
      const res  = await fetch(`/api/recaudos?${params}`)
      const data = await res.json()
      if (tabRef.current !== tabSnapshot) { // tab cambió mientras cargaba — descartar
        setLoading(false); setLoadingMore(false); return
      }
      const nuevos = data.pagos ?? []
      if (!cursor) saveCache(cacheKey, { pagos: nuevos, nextCursor: data.nextCursor, hasMore: data.hasMore })
      setPagos(!cursor ? nuevos : prev => [...prev, ...nuevos])
      setNextCursor(data.nextCursor ?? null)
      setHasMore(data.hasMore ?? false)
    } catch {
      // Error silencioso — no invalidar otras tabs
    } finally {
      if (tabRef.current === tabSnapshot) {
        if (!cursor) setLoading(false); else setLoadingMore(false)
      } else {
        setLoading(false); setLoadingMore(false)
      }
    }
  }, [tab, vendedorId, fecha, isAdmin])

  useEffect(() => { fetchPagos(null) }, [fetchPagos])

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function iniciarLongPress(pagoId: string) {
    if (tab === 'revisar') return
    longPressTimer.current = setTimeout(() => { if (puedeAdminRecaudos) setMarcadoEliminar(pagoId) }, 600)
  }
  function cancelarLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  async function eliminarPago(pagoId: string) {
    setEliminando(true)
    try {
      const res = await fetch(`/api/recaudos/${pagoId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setPagos(prev => prev.filter(p => p.id !== pagoId))
        setMarcadoEliminar(null)
        if (data.advertencia) alert(data.advertencia)
      }
    } finally {
      setEliminando(false)
    }
  }

  function abrirModalEliminar() {
    setModalEliminarPaso('pedir')
    setReciboBuscado('')
    setPagoEncontrado(null)
    setErrorBusquedaRecibo('')
  }

  function cerrarModalEliminar() {
    setModalEliminarPaso('cerrado')
    setReciboBuscado('')
    setPagoEncontrado(null)
    setErrorBusquedaRecibo('')
  }

  async function buscarPorRecibo() {
    const numero = reciboBuscado.trim()
    if (!numero) return
    setBuscandoRecibo(true)
    setErrorBusquedaRecibo('')
    try {
      const local = pagos.find(p => p.numeroRecibo === numero)
      if (local) {
        setPagoEncontrado(local)
        setModalEliminarPaso('confirmar')
        return
      }
      const res = await fetch(`/api/recaudos?numeroRecibo=${encodeURIComponent(numero)}&page=1&limit=1`)
      const data = await res.json()
      const encontrado = Array.isArray(data.pagos) && data.pagos.length > 0 ? data.pagos[0] : null
      if (encontrado) {
        setPagoEncontrado(encontrado)
        setModalEliminarPaso('confirmar')
      } else {
        setErrorBusquedaRecibo('Recibo no encontrado')
      }
    } catch {
      setErrorBusquedaRecibo('Error al buscar el recibo')
    } finally {
      setBuscandoRecibo(false)
    }
  }

  async function confirmarEliminarPorRecibo() {
    if (!pagoEncontrado) return
    setEliminando(true)
    try {
      const res = await fetch(`/api/recaudos/${pagoEncontrado.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setPagos(prev => prev.filter(p => p.id !== pagoEncontrado.id))
        cerrarModalEliminar()
        if (data.advertencia) alert(data.advertencia)
      } else {
        setErrorBusquedaRecibo(data.error || 'No se pudo eliminar')
      }
    } catch {
      setErrorBusquedaRecibo('Error al eliminar')
    } finally {
      setEliminando(false)
    }
  }

  async function enviarPago(pagoId: string) {
    setEnviando(prev => new Set(prev).add(pagoId))
    try {
      const res  = await fetch(`/api/recaudos/${pagoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'enviar' }),
      })
      const data = await res.json()
      if (data.ok) {
        setPagos(prev =>
          tab === 'pendiente'
            ? prev.filter(p => p.id !== pagoId)
            : prev.map(p => p.id === pagoId
                ? { ...p, envioEstado: data.envioEstado, envioFecha: new Date().toISOString(), envioRef: data.envioRef }
                : p)
        )
      }
    } finally {
      setEnviando(prev => { const s = new Set(prev); s.delete(pagoId); return s })
    }
  }

  async function enviarSeleccionados() {
    setEnviandoSeleccionados(true)
    for (const id of [...seleccionados]) {
      const pago = pagos.find(p => p.id === id)
      if (pago && pago.envioEstado === 'pendiente') await enviarPago(id)
    }
    setSeleccionados(new Set())
    setEnviandoSeleccionados(false)
  }

  const haySeleccion      = seleccionados.size > 0

  const pagedPagos  = pagos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages  = Math.max(1, Math.ceil(pagos.length / PAGE_SIZE))

  return {
    session, status, router, user,
    tab, setTab,
    fecha, setFecha,
    modalAjuste, setModalAjuste,
    ajusteMonto, setAjusteMonto,
    ajusteNota, setAjusteNota,
    ajusteLoading, setAjusteLoading,
    ajusteMsg, setAjusteMsg,
    pagos, setPagos,
    nextCursor, setNextCursor,
    hasMore, setHasMore,
    loading, setLoading,
    loadingMore, setLoadingMore,
    page, setPage,
    vendedorId, setVendedorId,
    marcadoEliminar, setMarcadoEliminar,
    modalEliminarPaso, setModalEliminarPaso,
    reciboBuscado, setReciboBuscado,
    pagoEncontrado, setPagoEncontrado,
    buscandoRecibo, setBuscandoRecibo,
    errorBusquedaRecibo, setErrorBusquedaRecibo,
    eliminando, setEliminando,
    longPressTimer,
    vendedores, setVendedores,
    enviando, setEnviando,
    detalleVariacion, setDetalleVariacion,
    abiertos, setAbiertos,
    voucherUrls, setVoucherUrls,
    lightboxUrl, setLightboxUrl,
    seleccionados, setSeleccionados,
    enviandoSeleccionados, setEnviandoSeleccionados,
    isDesktop, setIsDesktop,
    fechaInputRef,
    fechaOpen, setFechaOpen,
    isAdmin, puedeEditarRecaudos, puedeAdminRecaudos,
    cargarVoucherUrl, toggleAbierto, toggleSeleccion,
    ejecutarAjuste, fetchPagos,
    iniciarLongPress, cancelarLongPress,
    eliminarPago, abrirModalEliminar, cerrarModalEliminar,
    buscarPorRecibo, confirmarEliminarPorRecibo,
    enviarPago, enviarSeleccionados,
    haySeleccion, pagedPagos, totalPages,
  }
}

export type UseRecaudos = ReturnType<typeof useRecaudos>
