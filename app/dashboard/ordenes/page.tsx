'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const BORDER: Record<string, string> = {
  pendiente:   'border-l-amber-400',
  alistado:    'border-l-emerald-500',
  en_entrega:  'border-l-blue-500',
  en_transito: 'border-l-zinc-500',
  entregado:   'border-l-zinc-600',
}

const BADGE: Record<string, string> = {
  pendiente:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
  alistado:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  en_entrega:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  en_transito: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  entregado:   'bg-zinc-700/30 text-zinc-500 border-zinc-700/30',
}

const LABEL: Record<string, string> = {
  pendiente: 'Pendiente', alistado: 'Alistado', en_entrega: 'En entrega',
  en_transito: 'En tránsito', entregado: 'Entregado',
}

function formatHora(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function nombreCorto(n: string) {
  const parts = n.trim().split(' ')
  const result = parts.slice(0, 3).join(' ')
  return result.length > 22 ? result.slice(0, 22) + '…' : result
}

function formatFechaCorta(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() - 5*60*60*1000)
  const dd = String(d.getUTCDate()).padStart(2,'0')
  const mm = String(d.getUTCMonth()+1).padStart(2,'0')
  const yy = String(d.getUTCFullYear()).slice(2)
  const h = d.getUTCHours() % 12 || 12
  const min = String(d.getUTCMinutes()).padStart(2,'0')
  const ampm = d.getUTCHours() >= 12 ? 'pm' : 'am'
  return dd+'/'+mm+'/'+yy+' '+h+':'+min+ampm
}

function isHoy(iso: string | null | undefined) {
  if (!iso) return false
  const d = new Date(iso)
  const hoy = new Date()
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate()
}

function tiempoDesdeSync(iso: string | null | undefined): { texto: string; alerta: boolean } {
  if (!iso) return { texto: 'Nunca', alerta: true }
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return { texto: 'Ahora', alerta: false }
  if (mins < 60) return { texto: `${mins}min`, alerta: mins > 30 }
  const h = Math.floor(mins / 60)
  return { texto: `${h}h`, alerta: h >= 2 }
}

export default function OrdenesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  const [subTab, setSubTab] = useState<'pendientes' | 'alistados' | 'entregados'>('pendientes')
  const [despachos, setDespachos] = useState<any[]>([])
  const [ciudadLocal, setCiudadLocal] = useState<string | null>(null)
  const [bodegaPuedeEnviar, setBodegaPuedeEnviar] = useState(false)
  const [ultimaSync, setUltimaSync] = useState<string | null>(null)
  const [origenId, setOrigenId] = useState<string>('propia')
  const [empresasOrigen, setEmpresasOrigen] = useState<any[]>([])
  const [repartidores, setRepartidores] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msgSync, setMsgSync] = useState('')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editTransporte, setEditTransporte] = useState<Record<string, { transportadora: string; guia: string }>>({})
  const [editRepartidor, setEditRepartidor] = useState<Record<string, string>>({})
  const [galeria, setGaleria] = useState<{ fotos: string[], index: number } | null>(null)
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [camaraOrdenId, setCamaraOrdenId] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [soportaZoom, setSoportaZoom] = useState(false)
  const [asignarTodasRepartidor, setAsignarTodasRepartidor] = useState('')
  const [asignandoTodas, setAsignandoTodas] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  const esAdmin = user?.role === 'empresa' || user?.role === 'supervisor'

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    if (!['empresa', 'supervisor', 'bodega'].includes(user?.role)) { router.push('/dashboard'); return }
    cargarDatos('propia')
    fetch('/api/bodega/empresas-origen').then(r => r.json()).then(setEmpresasOrigen).catch(() => {})
    fetch('/api/empleados?rol=entregas')
      .then(r => r.json())
      .then(d => setRepartidores(d.empleados || []))
      .catch(() => {})
  }, [status])

  async function cargarDatos(origen?: string) {
    setCargando(true)
    const id = origen ?? origenId
    try {
      const res = await fetch(`/api/bodega/despachos${id !== 'propia' ? `?origenId=${id}` : ''}`)
      const data = await res.json()
      setDespachos(data.despachos || [])
      setCiudadLocal(data.ciudadLocal || null)
      setBodegaPuedeEnviar(data.bodegaPuedeEnviar ?? false)
      setUltimaSync(data.ultimaSyncBodega || null)
    } finally {
      setCargando(false)
    }
  }

  async function sync() {
    setSyncing(true); setMsgSync('')
    try {
      const res = await fetch('/api/bodega/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setMsgSync(`✅ ${data.sincronizados} sincronizadas`)
        await cargarDatos(origenId)
      } else {
        setMsgSync(data.error || 'Error al sincronizar')
      }
    } catch { setMsgSync('Error de conexión') }
    finally {
      setSyncing(false)
      setTimeout(() => setMsgSync(''), 4000)
    }
  }

  async function patchOrden(id: string, body: Record<string, unknown>) {
    setSaving(p => ({ ...p, [id]: true }))
    try {
      const res = await fetch(`/api/bodega/despachos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.orden) {
        setDespachos(prev => prev.map(d => d.id === id ? { ...d, ...data.orden } : d))
      }
    } finally {
      setSaving(p => ({ ...p, [id]: false }))
    }
  }

  async function abrirCamara(ordenId: string) {
    setCamaraOrdenId(ordenId)
    setCamaraActiva(true)
    setPreview(null)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    streamRef.current = stream
    const track = stream.getVideoTracks()[0]
    trackRef.current = track
    setZoomLevel(1)
    const capabilities = track.getCapabilities() as any
    setSoportaZoom(!!capabilities.zoom)
    if (videoRef.current) videoRef.current.srcObject = stream
  }

  async function aplicarZoom(nivel: number) {
    const track = trackRef.current
    if (!track) return
    const capabilities = track.getCapabilities() as any
    const min = capabilities.zoom?.min ?? 1
    const max = capabilities.zoom?.max ?? 5
    const nuevo = Math.min(max, Math.max(min, nivel))
    await track.applyConstraints({ advanced: [{ zoom: nuevo } as any] })
    setZoomLevel(nuevo)
  }

  function capturarFoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.7)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setPreview(base64)
  }

  async function usarFoto() {
    if (!preview || !camaraOrdenId) return
    setSaving(p => ({ ...p, [camaraOrdenId]: true }))
    try {
      const res = await fetch('/api/bodega/foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordenId: camaraOrdenId, fotoBase64: preview }),
      }).then(r => r.json())
      if (res.orden) setDespachos(prev => prev.map(d => d.id === camaraOrdenId ? { ...d, ...res.orden } : d))
    } finally {
      setSaving(p => ({ ...p, [camaraOrdenId!]: false }))
      setCamaraActiva(false)
      setCamaraOrdenId(null)
      setPreview(null)
    }
  }

  function cerrarCamara() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    setCamaraActiva(false)
    setCamaraOrdenId(null)
    setPreview(null)
  }

  function toggleExpanded(id: string) {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
  }

  async function marcarAlistado(id: string) {
    await patchOrden(id, { estado: 'alistado' })
  }

  async function asignarRepartidor(id: string) {
    const rid = editRepartidor[id]
    if (!rid) return
    await patchOrden(id, { repartidorId: rid, estado: 'en_entrega' })
    setEditRepartidor(p => { const n = { ...p }; delete n[id]; return n })
    setExpanded(p => ({ ...p, [id]: false }))
  }

  async function asignarTodas() {
    if (!asignarTodasRepartidor) return
    setAsignandoTodas(true)
    const alistadas = despachos.filter(d => d.estado === 'alistado')
    for (const d of alistadas) {
      await patchOrden(d.id, { repartidorId: asignarTodasRepartidor, estado: 'en_entrega' })
    }
    setAsignandoTodas(false)
    setAsignarTodasRepartidor('')
  }

  async function guardarTransporte(id: string) {
    const t = editTransporte[id]
    if (!t) return
    await patchOrden(id, { transportadora: t.transportadora, guiaTransporte: t.guia, estado: 'en_transito' })
    setEditTransporte(p => { const n = { ...p }; delete n[id]; return n })
    setExpanded(p => ({ ...p, [id]: false }))
  }

  if (status === 'loading' || cargando) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-zinc-400 text-sm">Cargando...</span>
      </div>
    )
  }

  const puedeEnviar = esAdmin || bodegaPuedeEnviar
  const cPendientes = despachos.filter(d => d.estado === 'pendiente').length
  const cAlistados  = despachos.filter(d => d.estado === 'alistado').length
  const cEntregadosHoy = despachos.filter(d => d.estado === 'entregado' && isHoy(d.entregadoEl)).length
  const sync_ = tiempoDesdeSync(ultimaSync)

  return (
    <div className="max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Órdenes</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Alistamiento y despacho</p>
        </div>
      </div>

      {/* Selector empresa origen */}
      {empresasOrigen.length > 1 && (
        <select
          value={origenId}
          onChange={e => { setOrigenId(e.target.value); cargarDatos(e.target.value) }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm">
          {empresasOrigen.map(e => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
      )}

      {/* Sub-tabs + toolbar */}
      <div className="space-y-2">
        {(() => {
          const cEntregados = despachos.filter(d => ['en_entrega','en_transito','entregado'].includes(d.estado)).length
          const pills: { id: typeof subTab; label: string; count: number; active: string; inactive: string; badge: string }[] = [
            { id: 'pendientes', label: 'Pendientes', count: cPendientes,
              active: 'bg-amber-500 border-amber-500 text-white',
              inactive: 'bg-zinc-800 border-zinc-700 text-amber-400 hover:bg-zinc-700',
              badge: 'bg-amber-600/60' },
            { id: 'alistados',  label: 'Alistados',  count: cAlistados,
              active: 'bg-emerald-600 border-emerald-600 text-white',
              inactive: 'bg-zinc-800 border-zinc-700 text-emerald-400 hover:bg-zinc-700',
              badge: 'bg-emerald-700/60' },
            { id: 'entregados', label: 'Entregados', count: cEntregados,
              active: 'bg-blue-600 border-blue-600 text-white',
              inactive: 'bg-zinc-800 border-zinc-700 text-blue-400 hover:bg-zinc-700',
              badge: 'bg-blue-700/60' },
          ]
          return (
            <div className="flex gap-2">
              {pills.map(p => (
                <button key={p.id} onClick={() => setSubTab(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    subTab === p.id ? p.active : p.inactive
                  }`}>
                  {p.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${p.badge}`}>{p.count}</span>
                </button>
              ))}
            </div>
          )
        })()}

        {/* Sync line */}
        <div className="flex items-center gap-2">
          <p className="text-zinc-500 text-xs flex-1">
            {despachos.length} orden{despachos.length !== 1 ? 'es' : ''}
            {' · '}
            <span className={sync_.alerta ? 'text-amber-400' : 'text-zinc-500'}>
              Sync hace {sync_.texto}{sync_.alerta ? ' ⚠️' : ''}
            </span>
          </p>
          {msgSync && <span className="text-xs text-emerald-400">{msgSync}</span>}
          <button onClick={sync} disabled={syncing}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors">
            <span className={syncing ? 'animate-spin inline-block' : ''}>🔄</span>
            {syncing ? 'Sincronizando...' : 'Sync'}
          </button>
        </div>
      </div>

      {despachos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-10 text-center">
          <p className="text-zinc-500 text-sm">Sin órdenes en el período configurado</p>
        </div>
      ) : (() => {
        const despachosVisibles = despachos.filter(d => {
          if (subTab === 'pendientes') return d.estado === 'pendiente'
          if (subTab === 'alistados')  return d.estado === 'alistado'
          return ['en_entrega','en_transito','entregado'].includes(d.estado)
        })
        return (
          <div className="space-y-2">
            {subTab === 'alistados' && despachosVisibles.length > 0 && puedeEnviar && (
              <div className="flex gap-2 items-center">
                <select value={asignarTodasRepartidor} onChange={e => setAsignarTodasRepartidor(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-xs">
                  <option value="">— Repartidor —</option>
                  {repartidores.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
                <button onClick={asignarTodas} disabled={asignandoTodas || !asignarTodasRepartidor}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-2 rounded-xl text-xs font-semibold">
                  {asignandoTodas ? '...' : '🚚 Asignar todas'}
                </button>
              </div>
            )}
            {despachosVisibles.map(d => {
              const ciudadRaw = d.ciudad || null
              const ciudadNombre = ciudadRaw ? ciudadRaw.split('/').pop()?.trim().replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? ciudadRaw : null
              const border = BORDER[d.estado] ?? BORDER.pendiente
              const isSaving = saving[d.id]
              const isExpanded = expanded[d.id]
              const esLocalidad = ciudadLocal && d.ciudad &&
                d.ciudad.split('/').pop()?.trim().toLowerCase() === ciudadLocal.trim().toLowerCase()
              const horaOrden = d.fechaOrden ? formatFechaCorta(d.fechaOrden) : formatFechaCorta(d.createdAt)
              const fotoKey = d.fotoAlistamiento
              const fotos: string[] = (d.fotosAlistamiento as string[] | null) || (fotoKey ? [fotoKey] : [])
              const tieneFotos = fotos.length > 0
              const btnFoto = tieneFotos ? (
                <button
                  onClick={() => setGaleria({ fotos, index: 0 })}
                  className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs">
                  🖼️ {fotos.length > 1 ? `${fotos.length} fotos` : formatFechaCorta(d.alistadoEl)}
                </button>
              ) : null

              return (
                <div key={d.id} className={`bg-zinc-900 border border-zinc-800 border-l-4 ${border} rounded-2xl overflow-hidden`}>
                  <div className="px-4 py-3 flex items-center gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                      <span className="text-white font-mono text-xs flex-shrink-0">#{d.numeroOrden}</span>
                      <span className="text-zinc-700 flex-shrink-0">·</span>
                      <span className="text-white font-semibold text-sm truncate flex-1">{nombreCorto(d.clienteNombre)}</span>
                      {ciudadNombre && <span className="text-zinc-400 text-xs flex-shrink-0 ml-1">{ciudadNombre}</span>}
                    </div>
                  </div>

                  {d.estado === 'pendiente' && (
                    <div className="px-4 pb-3 pt-1 flex items-center gap-2 border-t border-zinc-800/60">
                      <span className="text-white text-xs flex-shrink-0">{horaOrden}</span>
                      {tieneFotos ? (
                        btnFoto
                      ) : (
                        <button onClick={() => abrirCamara(d.id)} disabled={isSaving}
                          className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                          📷 Foto
                        </button>
                      )}
                      <button onClick={() => marcarAlistado(d.id)} disabled={isSaving || !tieneFotos}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                        {isSaving ? '⏳' : '✓ Listo'}
                      </button>
                    </div>
                  )}

                  {d.estado === 'alistado' && (
                    <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60">
                      <div className="flex items-center gap-3 mt-1">
                        {btnFoto}
                        {puedeEnviar ? (
                          <button onClick={() => toggleExpanded(d.id)}
                            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                            🚚 Enviar {isExpanded ? '▲' : '▼'}
                          </button>
                        ) : (
                          <span className="text-zinc-600 text-xs italic">esperando envío...</span>
                        )}
                      </div>

                      {isExpanded && puedeEnviar && (
                        <div className="mt-3 space-y-3">
                          {esLocalidad ? (
                            <div className="space-y-2">
                              <p className="text-zinc-500 text-xs font-semibold">Asignar repartidor</p>
                              <div className="flex gap-2">
                                <select
                                  value={editRepartidor[d.id] ?? ''}
                                  onChange={e => setEditRepartidor(p => ({ ...p, [d.id]: e.target.value }))}
                                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-500">
                                  <option value="">— Seleccionar —</option>
                                  {repartidores.map((r: any) => (
                                    <option key={r.id} value={r.id}>{r.nombre}</option>
                                  ))}
                                </select>
                                <button onClick={() => asignarRepartidor(d.id)}
                                  disabled={isSaving || !editRepartidor[d.id]}
                                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold px-3 py-2 rounded-xl text-xs transition-colors">
                                  {isSaving ? '...' : 'Asignar'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-zinc-500 text-xs font-semibold">Envío nacional</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-zinc-600 text-xs block mb-1">Transportadora</label>
                                  <input
                                    value={editTransporte[d.id]?.transportadora ?? ''}
                                    onChange={e => setEditTransporte(p => ({ ...p, [d.id]: { ...p[d.id], transportadora: e.target.value } }))}
                                    placeholder="Servientrega"
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-orange-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-zinc-600 text-xs block mb-1"># Guía</label>
                                  <input
                                    value={editTransporte[d.id]?.guia ?? ''}
                                    onChange={e => setEditTransporte(p => ({ ...p, [d.id]: { ...p[d.id], guia: e.target.value } }))}
                                    placeholder="123456789"
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-orange-500"
                                  />
                                </div>
                              </div>
                              <button onClick={() => guardarTransporte(d.id)}
                                disabled={isSaving || (!editTransporte[d.id]?.transportadora && !editTransporte[d.id]?.guia)}
                                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold px-4 py-1.5 rounded-xl text-xs transition-colors">
                                {isSaving ? 'Guardando...' : 'Confirmar envío'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {d.estado === 'en_entrega' && (
                    <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60 flex items-center gap-3 mt-1">
                      {btnFoto}
                      <span className="text-zinc-400 text-xs">🚚 {d.repartidor?.nombre ?? '—'} · {formatHora(d.alistadoEl)}</span>
                    </div>
                  )}

                  {d.estado === 'en_transito' && (
                    <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60 flex items-center gap-3 flex-wrap mt-1">
                      {btnFoto}
                      <span className="text-zinc-400 text-xs">🚛 {d.transportadora} <span className="font-mono text-zinc-500">#{d.guiaTransporte}</span></span>
                    </div>
                  )}

                  {d.estado === 'entregado' && (
                    <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60 flex items-center gap-3 mt-1">
                      {btnFoto}
                      <span className="text-emerald-500 text-xs">✅ {formatFechaCorta(d.entregadoEl)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Modal cámara fullscreen */}
      {camaraActiva && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden touch-none">
          {!preview ? (
            <>
              <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover w-full" style={{ touchAction: 'pinch-zoom' }} />
              <div className="fixed bottom-0 left-0 right-0 p-6 flex items-center justify-between bg-black/80 z-10">
                <button onClick={cerrarCamara} className="text-white text-sm">✕ Cancelar</button>
                <button onClick={capturarFoto} className="w-16 h-16 rounded-full bg-white border-4 border-zinc-400" />
                {soportaZoom ? (
                  <div className="flex items-center gap-2">
                    <button onClick={() => aplicarZoom(zoomLevel - 0.5)}
                      className="w-10 h-10 rounded-full bg-zinc-700 text-white text-xl">−</button>
                    <span className="text-white text-xs w-8 text-center">{zoomLevel.toFixed(1)}x</span>
                    <button onClick={() => aplicarZoom(zoomLevel + 0.5)}
                      className="w-10 h-10 rounded-full bg-zinc-700 text-white text-xl">+</button>
                  </div>
                ) : (
                  <div className="w-16" />
                )}
              </div>
            </>
          ) : (
            <div className="fixed inset-0 bg-black z-50 flex flex-col">
              <img src={preview} className="flex-1 w-full object-contain" />
              <div className="fixed bottom-0 left-0 right-0 p-6 flex gap-4 bg-black/80">
                <button onClick={() => { setPreview(null); abrirCamara(camaraOrdenId!) }}
                  className="flex-1 bg-zinc-800 text-white py-3 rounded-xl">🔄 Repetir</button>
                <button onClick={usarFoto}
                  className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-semibold">✓ Usar foto</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal galería fullscreen */}
      {galeria && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-400 text-sm">{galeria.index + 1} / {galeria.fotos.length}</span>
            <button onClick={() => setGaleria(null)} className="text-white text-2xl">✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center relative overflow-hidden">
            <img src={galeria.fotos[galeria.index]} className="max-w-full max-h-full object-contain" />
            {galeria.index > 0 && (
              <button onClick={() => setGaleria(g => g ? { ...g, index: g.index - 1 } : null)}
                className="absolute left-2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">‹</button>
            )}
            {galeria.index < galeria.fotos.length - 1 && (
              <button onClick={() => setGaleria(g => g ? { ...g, index: g.index + 1 } : null)}
                className="absolute right-2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">›</button>
            )}
          </div>
          {galeria.fotos.length > 1 && (
            <div className="flex gap-2 p-3 overflow-x-auto">
              {galeria.fotos.map((f, i) => (
                <button key={i} onClick={() => setGaleria(g => g ? { ...g, index: i } : null)}
                  className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ${i === galeria.index ? 'border-emerald-500' : 'border-transparent'}`}>
                  <img src={f} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
