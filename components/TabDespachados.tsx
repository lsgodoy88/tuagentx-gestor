'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import ModalEscaner from '@/components/ModalEscaner'
import { formatFechaCorta } from '@/lib/fechas'
import IconBarcode from '@/components/IconBarcode'

type Rol = 'bodega' | 'admin' | 'vendedor'

interface Props {
  rol: Rol
  empresaId: string
  origenId?: string
  ciudadLocal?: string
  onGaleriaAbrir?: (fotos: string[], fecha: string | null) => void
  onFirmaAbrir?: (url: string) => void
  filtroEnvio?: 'todos' | 'local' | 'guia'
  filtroFecha?: string
  filtroCiudad?: string
  filtroOrden?: 'asc' | 'desc' | null
  busquedaExterna?: string
  onLogsLoaded?: (ciudades: string[]) => void
}

export default function TabDespachados({ rol, empresaId, origenId, ciudadLocal, onGaleriaAbrir, onFirmaAbrir, filtroEnvio = 'todos', filtroFecha = '', filtroCiudad = '', filtroOrden = null, busquedaExterna, onLogsLoaded }: Props) {
  const { data: session } = useSession()
  const esAdmin = rol === 'admin'
  const esBodega = rol === 'bodega'

  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hayMas, setHayMas] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [guiaPopup, setGuiaPopup] = useState<string | null>(null)
  const [guiaEditando, setGuiaEditando] = useState<string | null>(null)
  const [editGuia, setEditGuia] = useState<Record<string, string>>({})
  const [savingGuia, setSavingGuia] = useState<Record<string, boolean>>({})
  const [obsPopup, setObsPopup] = useState<string | null>(null)
  const [escanerLogId, setEscanerLogId] = useState<string | null>(null)
  const [escanerOrdenId, setEscanerOrdenId] = useState<string | null>(null)
  const [modalFirmaUrl, setModalFirmaUrl] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [envioFiltro, setEnvioFiltro] = useState('todos')
  const [numerosDeOtros, setNumerosDeOtros] = useState<Set<number>>(new Set())

  const cursorRef = useRef<string | null>(null)
  const huecoVerificadosRef = useRef<Set<number>>(new Set())
  const rangeRef = useRef<{min:number,max:number}|null>(null)
  const presenteRef = useRef<Set<number>>(new Set())

  const cargar = useCallback(async (reset = false) => {
    if (reset) { setLoading(true); cursorRef.current = null; setCursor(null); setNumerosDeOtros(new Set()); huecoVerificadosRef.current = new Set(); rangeRef.current = null; presenteRef.current = new Set() }
    try {
      const params = new URLSearchParams()
      if (origenId && origenId !== 'propia') params.set('origenId', origenId)
      if (!reset && cursorRef.current) params.set('cursor', cursorRef.current)
      const res = await fetch(`/api/bodega/despacho-log?${params}`)
      if (!res.ok) return
      const data = await res.json()
      const incoming = data.data || []
      if (reset) {
        setLogs(incoming)
      } else {
        setLogs(prev => {
          const merged = [...prev, ...incoming]
          if (onLogsLoaded) {
            const ciudades = [...new Set(merged.map((l: any) => l.ciudad?.trim()).filter(Boolean))].sort() as string[]
            onLogsLoaded(ciudades)
          }
          return merged
        })
      }
      if (reset && onLogsLoaded) {
        const ciudades = [...new Set(incoming.map((l: any) => l.ciudad?.trim()).filter(Boolean))].sort() as string[]
        onLogsLoaded(ciudades)
      }
      setHayMas(data.hayMas ?? false)
      cursorRef.current = data.nextCursor ?? null
      setCursor(data.nextCursor ?? null)
      // Verificar solo huecos NUEVOS — rango trackeado en ref, O(incoming) no O(allLogs)
      if (rol === 'vendedor' && incoming.length > 0) {
        // Actualizar rango incremental con solo los nuevos logs
        const nums = incoming.map((l: any) => parseInt(l.numeroFactura) || 0).filter((n: number) => n > 0)
        if (nums.length === 0) return  // sin facturas numéricas, nada que verificar
        const inMax = nums.reduce((a: number, b: number) => a > b ? a : b)
        const inMin = nums.reduce((a: number, b: number) => a < b ? a : b)
        const prevRange = rangeRef.current
        const newMax = prevRange ? Math.max(prevRange.max, inMax) : inMax
        const newMin = prevRange ? Math.min(prevRange.min, inMin) : inMin
        rangeRef.current = { min: newMin, max: newMax }

        // Actualizar ref de presentes con incoming — sin depender del state stale
        incoming.forEach((l: any) => {
          const n = parseInt(l.numeroFactura) || 0
          if (n > 0) presenteRef.current.add(n)
        })
        const presente = presenteRef.current

        // Solo huecos nuevos del rango extendido
        const huecoNuevos: number[] = []
        for (let n = newMax; n >= newMin; n--) {
          if (!presente.has(n) && !huecoVerificadosRef.current.has(n)) huecoNuevos.push(n)
        }
        if (huecoNuevos.length > 0) {
          const r2 = await fetch('/api/bodega/despacho-log/verificar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ huecos: huecoNuevos, origenId: origenId || 'propia' }),
          })
          if (r2.ok) {
            const { deOtros } = await r2.json()
            huecoNuevos.forEach(n => huecoVerificadosRef.current.add(n))
            if (deOtros.length > 0) {
              setNumerosDeOtros(prev => {
                const next = new Set(prev)
                ;(deOtros as number[]).forEach((n: number) => next.add(n))
                return next
              })
            }
          }
        }
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false); setCargandoMas(false) }
  }, [origenId])

  useEffect(() => { if (empresaId) cargar(true) }, [origenId, empresaId])

  const guardarGuia = async (ordenId: string, logId: string, guia: string) => {
    setSavingGuia(p => ({ ...p, [logId]: true }))
    try {
      const res = await fetch(`/api/bodega/despachos/${ordenId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guiaTransporte: guia || null }),
      })
      await res.json()
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, guiaTransporte: guia || null } : l))
      setGuiaPopup(null)
      setGuiaEditando(null)
      setEditGuia(p => { const n = { ...p }; delete n[logId]; return n })
    } catch (e) { console.error(e) }
    finally { setSavingGuia(p => ({ ...p, [logId]: false })) }
  }

  const busquedaEfectiva = busquedaExterna !== undefined ? busquedaExterna : busqueda
  const logsOrdenados = [...logs].sort((a, b) => {
    if (filtroOrden !== null) {
      const ta = a.despachadoEl ? new Date(a.despachadoEl).getTime() : 0
      const tb = b.despachadoEl ? new Date(b.despachadoEl).getTime() : 0
      return filtroOrden === 'asc' ? ta - tb : tb - ta
    }
    const na = parseInt(a.numeroFactura) || 0
    const nb = parseInt(b.numeroFactura) || 0
    return nb - na
  })

  const logsVisibles = logsOrdenados.filter(log => {
    if (busquedaEfectiva) {
      const q = busquedaEfectiva.toLowerCase()
      const match = (log.clienteNombre || '').toLowerCase().includes(q) ||
        (log.numeroFactura || '').toString().includes(q) ||
        (log.ciudad || '').toLowerCase().includes(q) ||
        (log.guiaTransporte || '').toLowerCase().includes(q)
      if (!match) return false
    }
    if (filtroCiudad && (log.ciudad?.trim() || '') !== filtroCiudad) return false
    if (filtroEnvio !== 'todos') {
      const ciudadOrden = log.ciudad?.split('/').pop()?.trim().toLowerCase() ?? ''
      const esLocal = ciudadLocal ? ciudadOrden === ciudadLocal.trim().toLowerCase() : false
      if (filtroEnvio === 'local' && !esLocal) return false
      if (filtroEnvio === 'guia' && esLocal) return false
    }
    if (filtroFecha) {
      if (!log.despachadoEl) return false
      const d = new Date(log.despachadoEl)
      const bogota = new Date(d.getTime() - 5 * 60 * 60 * 1000)
      const yy = bogota.getUTCFullYear()
      const mm = String(bogota.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(bogota.getUTCDate()).padStart(2, '0')
      if (`${yy}-${mm}-${dd}` !== filtroFecha) return false
    }
    return true
  })

  const ciudades = [...new Set(logs.map((l: any) => l.ciudad?.trim()).filter(Boolean))].sort() as string[]

  // Generar rango consecutivo desde logs acumulados — sin solapamientos entre páginas
  const controlFacturas = (() => {
    if (logsOrdenados.length === 0) return []
    // Solo usar rango consecutivo cuando no hay filtroOrden
    if (filtroOrden !== null) return logsOrdenados.map(l => ({ numero: parseInt(l.numeroFactura) || 0, log: l, hueco: false }))
    const mapaFacturas = new Map(logsOrdenados.map(l => [parseInt(l.numeroFactura) || 0, l]))
    const rangeMax = parseInt(logsOrdenados[0].numeroFactura) || 0
    const rangeMin = parseInt(logsOrdenados[logsOrdenados.length - 1].numeroFactura) || 0
    const result = []
    for (let n = rangeMax; n >= rangeMin; n--) {
      const r = mapaFacturas.get(n)
      // Vendedor: omitir números que pertenecen a otros vendedores
      if (!r && numerosDeOtros.has(n)) continue
      result.push({ numero: n, log: r || null, hueco: !r })
    }
    return result
  })()

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <span className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Filtros */}
      {busquedaExterna === undefined && (
        <div className="flex gap-2 min-w-0">
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="# orden o cliente..."
            className="min-w-0 flex-1 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-zinc-600" />
        </div>
      )}

      {/* Lista */}
      <div className="space-y-1">
        {controlFacturas.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-10">Sin despachos</div>
        )}
        {(() => {
          const hayFiltro = !!(busquedaExterna || busqueda || filtroEnvio !== 'todos' || filtroFecha || filtroCiudad)
          return controlFacturas.filter(cf => {
            // Con filtro activo: ocultar huecos — solo mostrar despachadas que cumplan
            if (cf.hueco) return !hayFiltro
            const log = cf.log
            const busq = (busquedaExterna !== undefined ? busquedaExterna : busqueda) || ''
            if (busq) {
              const b = busq.toLowerCase()
              if (!log.numeroFactura?.toLowerCase().includes(b) && !log.clienteNombre?.toLowerCase().includes(b)) return false
            }
            if (filtroEnvio !== 'todos') {
              if (filtroEnvio === 'local' && log.modo !== 'repartidor') return false
              if (filtroEnvio === 'guia' && log.modo !== 'transportadora') return false
            }
            if (filtroCiudad) {
              const ciudad = log.ciudad?.split('/').pop()?.trim().toLowerCase() || ''
              if (!ciudad.includes(filtroCiudad.toLowerCase())) return false
            }
            if (filtroFecha) {
              if (!log.despachadoEl) return false
              const d = new Date(log.despachadoEl)
              const bogota = new Date(d.getTime() - 5 * 60 * 60 * 1000)
              const yy = bogota.getUTCFullYear()
              const mm = String(bogota.getUTCMonth() + 1).padStart(2, '0')
              const dd = String(bogota.getUTCDate()).padStart(2, '0')
              if (`${yy}-${mm}-${dd}` !== filtroFecha) return false
            }
            return true
          })
        })().map(cf => {
          // Hueco: orden no despachada aún
          if (cf.hueco) return (
            <div key={`hueco-${cf.numero}`}
              className="bg-zinc-900 border border-zinc-800 border-l-4 border-l-zinc-700 rounded-2xl overflow-hidden">
              <div className="px-4 py-3">
                <span className="text-zinc-500 font-mono text-xs">F_{cf.numero}</span>
              </div>
            </div>
          )
          const log = cf.log
          let fotosRaw = log.fotosAlistamiento
          if (typeof fotosRaw === 'string') { try { fotosRaw = JSON.parse(fotosRaw) } catch { fotosRaw = null } }
          const fotos: string[] = (Array.isArray(fotosRaw) ? fotosRaw : null) || (log.fotoAlistamiento ? [log.fotoAlistamiento] : [])
          const ciudad = log.ciudad?.split('/').pop()?.trim() || null
          const isExp = expanded[log.id] || false
          const guiaVal = editGuia[log.id] ?? log.guiaTransporte ?? ''
          const urlSeguimiento = log.urlSeguimiento ?? null

          return (
            <div key={log.id} className={`bg-zinc-900 border-t border-r border-b border-zinc-800 border-l-4 ${log.entregadoEl ? 'border-l-emerald-600' : log.modo === 'repartidor' ? 'border-l-cyan-400' : 'border-l-orange-400'} rounded-2xl overflow-hidden`}>
              {/* Header */}
              <div className="px-3 py-3 flex items-start gap-2 cursor-pointer"
                onClick={() => setExpanded(p => ({ ...p, [log.id]: !p[log.id] }))}>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5 overflow-hidden">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-white font-mono text-xs flex-shrink-0">F_{log.numeroFactura}</span>
                    <span className="text-zinc-700 flex-shrink-0">·</span>
                    <span className="text-white font-semibold text-xs truncate flex-1">{log.clienteNombre}</span>
                    {ciudad && <span className="text-zinc-400 text-xs flex-shrink-0">{ciudad}</span>}
                  </div>
                  {log.direccion && <span className="text-zinc-500 text-xs truncate block">{log.direccion}</span>}
                </div>
                <span className="text-xs mt-0.5 flex-shrink-0">
                  {isExp ? '▲' : log.entregadoEl ? '✅' : log.modo === 'personal' ? '🤝' : log.modo === 'repartidor' ? '🚚' : (
                    <span className="relative inline-flex">
                      🚛{log.guiaTransporte && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-zinc-900" />}
                    </span>
                  )}
                </span>
              </div>

              {/* Timeline */}
              {isExp && (
                <div className="px-3 pb-3 space-y-0.5 border-t border-zinc-800/40 pt-2">
                  {[
                    { icon: '📋', label: 'Orden', fecha: log.fechaOrden, quien: log.vendedorNombre ? log.vendedorNombre.split(' ')[0].charAt(0).toUpperCase() + log.vendedorNombre.split(' ')[0].slice(1).toLowerCase() : null },
                    { icon: '🧾', label: 'Facturado', fecha: log.fechaFactura, quien: 'Admin' },
                    { icon: '📦', label: 'Alistado', fecha: log.alistadoEl, quien: log.alistadoPor?.nombre || null, fotos },
                    ...(log.modo === 'personal' ? [] : [{
                      icon: log.modo === 'repartidor' ? '🚚' : '🚛',
                      label: log.modo === 'repartidor' ? 'Despacho' : 'Transporte',
                      fecha: log.despachadoEl,
                      quien: [log.despachadoPorNombre || log.repartidor?.nombre, log.num_cajas > 0 && !log.firmaEntrega ? `${log.num_cajas} caja${log.num_cajas > 1 ? 's' : ''}` : null].filter(Boolean).join(' · '),
                      esDespacho: true,
                      firmaEntrega: log.firmaEntrega,
                      observacion: log.observacion,
                    }]),
                    { icon: '✅', label: 'Entregado', fecha: log.entregadoEl, quien: null },
                  ].map((e: any, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <span className="text-base flex-shrink-0">{e.icon}</span>
                      <span className="text-zinc-400 text-xs w-[60px] flex-shrink-0">{e.label}</span>
                      <span className="text-white text-xs flex-shrink-0">{e.fecha ? formatFechaCorta(e.fecha) : '—'}</span>
                      {e.quien && (
                        e.esDespacho
                          ? <span className="text-xs truncate flex-1">
                              {e.quien.split(' · ').map((part: string, pi: number) => (
                                <span key={pi} className={pi === 0 ? 'text-zinc-500' : 'text-white'}>
                                  {pi > 0 ? ' · ' : ''}{part}
                                </span>
                              ))}
                            </span>
                          : <span className="text-zinc-500 text-xs truncate flex-1">{e.quien}</span>
                      )}
                      {e.fotos?.length > 0 && (
                        <button onClick={ev => { ev.stopPropagation(); onGaleriaAbrir ? onGaleriaAbrir(e.fotos, log.alistadoEl) : null }}
                          className="text-zinc-400 hover:text-white text-base flex-shrink-0">🖼️</button>
                      )}
                      {e.firmaEntrega && (
                        <button onClick={() => onFirmaAbrir ? onFirmaAbrir(e.firmaEntrega) : setModalFirmaUrl(e.firmaEntrega)}
                          className="text-zinc-400 hover:text-white text-base flex-shrink-0">🤝</button>
                      )}
                      {!e.firmaEntrega && e.observacion && (
                        <button onClick={() => setObsPopup(obsPopup === log.id ? null : log.id)}
                          className={`text-base flex-shrink-0 ${obsPopup === log.id ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>✍🏼</button>
                      )}
                      {/* Barcode/Guía — solo en etapa despacho */}
                      {e.esDespacho && log.modo === 'transportadora' && (
                        urlSeguimiento ? (
                          <button onClick={() => window.open(urlSeguimiento, '_blank')}
                            className="flex-shrink-0 text-lg">🔗</button>
                        ) : (esAdmin || esBodega) ? (
                          <button onClick={ev => { ev.stopPropagation(); setGuiaPopup(guiaPopup === log.id ? null : log.id); setGuiaEditando(null); setEditGuia(p => ({ ...p, [log.id]: log.guiaTransporte ?? '' })) }}
                            className="flex-shrink-0 relative text-zinc-500 hover:text-white"
                            style={{ color: log.guiaTransporte ? '#fb923c' : undefined }}>
                            <IconBarcode />
                            {log.guiaTransporte && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-zinc-900" />}
                          </button>
                        ) : log.guiaTransporte ? (
                          <span className="text-zinc-600">
                            <IconBarcode />
                          </span>
                        ) : null
                      )}
                    </div>
                  ))}

                  {/* Popup observación */}
                  {obsPopup === log.id && log.observacion && (
                    <div className="flex gap-1.5 items-center mt-2 pt-2 border-t border-zinc-800/40">
                      <span className="text-base flex-shrink-0">✍🏼</span>
                      <p className="flex-1 text-white text-xs bg-blue-950/30 border border-blue-500/20 rounded-xl px-3 py-2">{log.observacion}</p>
                    </div>
                  )}

                  {/* Popup guía */}
                  {guiaPopup === log.id && !urlSeguimiento && (
                    <div className="flex gap-1.5 items-center mt-2 pt-2 border-t border-zinc-800/40">
                      {log.guiaTransporte && guiaEditando !== log.id ? (
                        <>
                          <span className="flex-1 text-white text-xs font-mono bg-zinc-800 border border-orange-500/30 rounded-xl px-3 py-2">{guiaVal}</span>
                          <button onClick={() => setGuiaEditando(log.id)}
                            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-zinc-300 rounded-xl flex items-center justify-center flex-shrink-0 text-xs">✏️</button>
                        </>
                      ) : (
                        <>
                          <input autoFocus type="text" placeholder="Número de guía..."
                            value={guiaVal}
                            onChange={e => setEditGuia(p => ({ ...p, [log.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') guardarGuia(log.ordenId || log.id, log.id, editGuia[log.id] ?? '') }}
                            className="flex-1 bg-orange-950/30 border border-orange-500/30 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none focus:border-orange-400" />
                          <button title="Escanear" onClick={() => { setEscanerOrdenId(log.ordenId || log.id); setEscanerLogId(log.id) }}
                            className="w-9 h-9 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                            <IconBarcode />
                          </button>
                          <button onClick={() => guardarGuia(log.ordenId || log.id, log.id, editGuia[log.id] ?? '')}
                            disabled={savingGuia[log.id] || !(editGuia[log.id] ?? '').trim()}
                            className="w-9 h-9 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                            💾
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Cargar más */}
      {hayMas && (
        <button onClick={() => { setCargandoMas(true); cargar(false) }} disabled={cargandoMas}
          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold py-3 rounded-2xl hover:text-white disabled:opacity-40 transition-colors">
          {cargandoMas ? <span className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin inline-block" /> : 'Cargar más'}
        </button>
      )}

      {/* Modal firma */}
      {modalFirmaUrl && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4"
          onClick={() => setModalFirmaUrl(null)}>
          <img src={modalFirmaUrl} alt="Firma" className="max-w-sm w-full rounded-2xl border border-zinc-700" />
        </div>
      )}

      {/* Modal escaner */}
      {escanerOrdenId && (
        <ModalEscaner
          onDetect={(codigo) => {
            if (escanerLogId) setEditGuia(p => ({ ...p, [escanerLogId]: codigo }))
            setEscanerOrdenId(null)
            setEscanerLogId(null)
          }}
          onClose={() => { setEscanerOrdenId(null); setEscanerLogId(null) }}
        />
      )}
    </div>
  )
}
