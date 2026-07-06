'use client'
import { useState, useEffect } from 'react'
import FirmaCanvas from '@/components/FirmaCanvas'
import { fetchApi, errorMsg } from '@/lib/fetchApi'
import { useGpsContext } from '@/lib/gps-context'
import { obtenerGpsMejor } from '@/lib/gps'
import { useGpsEnDemanda } from '@/components/useGpsEnDemanda'
import { GpsIndicator } from '@/components/GpsIndicator'

const TIPOS = [
  { id: 'visita',  label: 'Visita',   icon: '👁️' },
  { id: 'venta',   label: 'Venta',    icon: '💰' },
  { id: 'cobro',   label: 'Cobro',    icon: '💵' },
  { id: 'entrega', label: 'Entrega',  icon: '📦' },
]

const LIMIT_CLI = 10

interface Cliente {
  id: string
  nombre: string
  nombreComercial?: string
  direccion?: string
  ubicacionReal?: boolean
  lat?: number
  lng?: number
  latTmp?: number
  lngTmp?: number
}

interface Props {
  open: boolean
  onClose: () => void
  onRegistrado?: () => void
  instance?: string
  clienteInicial?: Cliente
  tipoForzado?: string
  puedeCapturarGps?: boolean
  titulo?: string
  distanciaLejos?: boolean
  extraData?: Record<string, any>
  facturaPreset?: string
  empresaOrigen?: string
  clienteNuevo?: boolean
}

export default function ModalVisita({
  open, onClose, onRegistrado,
  clienteInicial, tipoForzado,
  puedeCapturarGps = false,
  titulo, extraData = {}, distanciaLejos, facturaPreset, empresaOrigen,
  clienteNuevo = false
}: Props) {
  const [cliente, setCliente] = useState<Cliente | null>(clienteInicial || null)
  const gpsDemand = useGpsEnDemanda()
  const [tipo, setTipo] = useState(tipoForzado || 'visita')
  const [nombreLibre, setNombreLibre] = useState('')
  const [modoNuevo, setModoNuevo] = useState(clienteNuevo)
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [factura, setFactura] = useState('')
  const [firma, setFirma] = useState<string | null>(null)
  const [capturarGps, setCapturarGps] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exito, setExito] = useState(false)
  const [obteniendo, setObteniendo] = useState(false)
  const [gpsProgress, setGpsProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Buscador clientes
  const [buscar, setBuscar] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [totalCli, setTotalCli] = useState(0)
  const [pageCli, setPageCli] = useState(1)
  const [loadingCli, setLoadingCli] = useState(false)

  const { setSincronizandoGps } = useGpsContext()
  const isEntregas = tipoForzado === 'entrega' || tipo === 'entrega'

  useEffect(() => {
    if (open) {
      if (!clienteInicial) {
        setCliente(null)
        setClientes([])
      } else {
        setCliente(clienteInicial)
      }
      setTipo(tipoForzado || 'visita')
      setMonto(''); setNota('')
      setFactura(facturaPreset || '')
      setFirma(null); setError(null)
      setBuscar(''); setPageCli(1)
    }
  }, [open])

  useEffect(() => {
    if (cliente && puedeCapturarGps) {
      setCapturarGps(!cliente.ubicacionReal)
    }
  }, [cliente, puedeCapturarGps])

  async function loadClientes(q: string, p: number) {
    setLoadingCli(true)
    const data = await fetchApi(`/api/clientes?q=${encodeURIComponent(q)}&page=${p}&limit=${LIMIT_CLI}`)
    setClientes(data?.clientes || [])
    setTotalCli(data?.total || 0)
    setLoadingCli(false)
  }

  async function getUbicacion(): Promise<{ lat: number; lng: number } | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
      )
    })
  }

  async function registrar() {
    const cl = cliente || clienteInicial
    if (!cl) return

    // Esperar GPS solo si puede capturar y el cliente aún no tiene coordenadas
    const esperarGps = puedeCapturarGps === true && !cl.lat && !cl.lng

    setLoading(true)
    let ubicacion: { lat: number; lng: number } | null = null
    // Esperar GPS en demanda (lanzado al abrir el modal)
    if (gpsDemand.estado === 'buscando' || (esperarGps && gpsDemand.estado !== 'ok')) {
      setObteniendo(true)
      const p = await gpsDemand.obtener()
      setObteniendo(false)
      if (p) {
        ubicacion = { lat: p.lat, lng: p.lng }
      } else if (esperarGps) {
        // Tras 3 intentos fallidos: preguntar
        const ok = window.confirm('No se pudo obtener tu ubicación tras 3 intentos. ¿Guardar sin GPS?')
        if (!ok) { setLoading(false); return }
      }
    } else if (gpsDemand.estado === 'ok' && gpsDemand.pos) {
      ubicacion = { lat: gpsDemand.pos.lat, lng: gpsDemand.pos.lng }
    }
    setError(null)

    const data = await fetchApi('/api/visitas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: modoNuevo ? '__PROSPECTO__' : cl.id,
        clienteNombreLibre: modoNuevo ? (nombreLibre.trim() || null) : null,
        tipo: tipoForzado || tipo,
        monto: monto || null,
        nota: nota || null,
        factura: factura || null,
        firma: firma || null,
        capturarGps: esperarGps ? capturarGps : false,
        ...extraData,
        ...(ubicacion || {}),
      })
    })
    setLoading(false)

    if (!data || data.error) {
      setError(errorMsg(data, 'Error al registrar visita'))
      return
    }
    if (data.alertaDistancia) {
      alert('Visita registrada. Estás a ' + data.alertaDistancia + 'm del cliente')
    }
    setExito(true)
    setTimeout(() => {
      setExito(false)
      onClose()
      onRegistrado?.()
    }, 900)

    // GPS en background para los casos donde no se esperó
    if (!esperarGps) {
      const visitaId = data.visita?.id
      const clienteId = cl.id
      const tieneCoordsDef = !!(cl.lat && cl.lng)
      if (visitaId) {
        setSincronizandoGps(true)
        obtenerGpsMejor()
          .then(async pos => {
            if (pos) {
              await fetchApi(`/api/visitas/${visitaId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
              })
              if (!tieneCoordsDef) {
                await fetchApi(`/api/clientes/${clienteId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ latTmp: pos.lat, lngTmp: pos.lng }),
                })
              }
            }
          })
          .catch(() => {})
          .finally(() => setSincronizandoGps(false))
      }
    }
  }

  useEffect(() => {
    if (open) { gpsDemand.iniciar(); setNombreLibre(clienteNuevo && clienteInicial?.nombre ? clienteInicial.nombre : ''); setModoNuevo(clienteNuevo) }
    else gpsDemand.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const clienteActual = cliente ?? clienteInicial ?? null

  if (!open) return null
  const tituloFinal = titulo || (tipoForzado === 'entrega' ? 'Registrar entrega' : 'Registrar visita')
  const puedeGuardar = !loading && !(isEntregas && (!firma || !factura))


  return (
    <div className="fixed inset-0 flex items-start justify-center z-[1000] pt-4 px-4 pb-4" style={{background:"#0f1729"}}>
      <div className="rounded-2xl w-full max-w-md p-6 pb-6 space-y-4 max-h-[88vh] overflow-y-auto overscroll-contain" style={{background:"#0f172a",border:"1px solid rgba(59,130,246,0.50)"}}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">{tituloFinal}</h3>
          <div className="flex items-center gap-2">
            {!clienteInicial && !cliente && !modoNuevo && (
              <button onClick={() => { setNombreLibre(''); setModoNuevo(true) }} className="text-indigo-300 text-xs font-semibold px-2 py-1 rounded-lg" style={{background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.35)'}}>✨ ¿Cliente Nuevo?</button>
            )}
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
          </div>
        </div>

        {/* Paso 1: buscar cliente (nunca si clienteInicial está definido) */}
        {!clienteInicial && !cliente ? (
          <div className="space-y-3">
            {modoNuevo ? (
              <div className="space-y-3">
                <input
                  value={nombreLibre}
                  onChange={e => setNombreLibre(e.target.value)}
                  placeholder="Nombre del prospecto (opcional)"
                  autoFocus
                  className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}}
                />
                {(() => { const valido = nombreLibre.trim().split(/\s+/).filter(Boolean).length >= 2; return (
                <button onClick={() => setCliente({ id: '__PROSPECTO__', nombre: nombreLibre.trim() })} disabled={!valido}
                  className={"w-full font-semibold py-2.5 rounded-xl text-sm transition-colors " + (valido ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-emerald-600 text-white cursor-not-allowed opacity-40")}>
                  Continuar →
                </button>) })()}
                <button onClick={() => setModoNuevo(false)} className="text-zinc-500 text-xs text-center w-full">← Buscar cliente existente</button>
              </div>
            ) : (
            <>
            <input
              value={buscar}
              onChange={e => { setBuscar(e.target.value); setPageCli(1); loadClientes(e.target.value, 1) }}
              placeholder="Buscar cliente..."
              className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}}
            />
            <div className="space-y-2">
              {loadingCli && <p className="text-zinc-500 text-xs text-center py-2">Cargando...</p>}
              {clientes.map((c: Cliente) => (
                <button key={c.id} onClick={() => setCliente(c)}
                  className="w-full rounded-xl p-3 text-left transition-colors" style={{background:"#3f3f46",border:"1px solid rgba(59,130,246,0.25)"}}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{c.nombre}</p>
                      {c.nombreComercial && <p className="text-zinc-400 text-xs">{c.nombreComercial}</p>}
                      {c.direccion && <p className="text-zinc-500 text-xs truncate">{c.direccion}</p>}
                    </div>
                    {c.lat && c.lng && (
                      <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`}
                        target="_blank"
                        onClick={e => e.stopPropagation()}
                        className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg text-xs flex-shrink-0 hover:bg-emerald-500/20">
                        📍
                      </a>
                    )}
                  </div>
                </button>
              ))}
              {totalCli > LIMIT_CLI && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-zinc-600 text-xs">{((pageCli-1)*LIMIT_CLI)+1}–{Math.min(pageCli*LIMIT_CLI,totalCli)} de {totalCli}</p>
                  <div className="flex gap-2">
                    <button onClick={() => { const p = pageCli-1; setPageCli(p); loadClientes(buscar, p) }} disabled={pageCli===1}
                      className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">← Ant</button>
                    <button onClick={() => { const p = pageCli+1; setPageCli(p); loadClientes(buscar, p) }} disabled={pageCli*LIMIT_CLI>=totalCli}
                      className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg">Sig →</button>
                  </div>
                </div>
              )}
            </div>
            </>
            )}
          </div>
        ) : (
          /* Paso 2: formulario */
          <div className="space-y-4">

            {/* Cliente seleccionado */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{modoNuevo ? (nombreLibre || (clienteInicial?.nombre && clienteInicial.nombre !== '__PROSPECTO__' ? clienteInicial.nombre : 'Prospecto')) : clienteActual!.nombre}</p>
                {clienteActual!.nombreComercial && <p className="text-zinc-400 text-xs">{clienteActual!.nombreComercial}</p>}
                {distanciaLejos && <p className="text-amber-400 text-xs mt-1">⚠️ Estás lejos del cliente</p>}
              </div>
              {!clienteInicial && (
                <button onClick={() => setCliente(null)} className="text-zinc-300 text-xs bg-zinc-500/40 border border-blue-500/25 px-2 py-1 rounded-lg">Cambiar</button>
              )}
            </div>

            {/* Tipo (solo si no está forzado) */}
            {!tipoForzado && (
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Tipo de gestión</label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS.map(t => (
                    <button key={t.id} onClick={() => setTipo(t.id)}
                      className={"py-2.5 rounded-xl text-sm font-semibold border transition-all " + (tipo === t.id ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-500/40 border-blue-500/25 text-zinc-300")}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Monto */}
            {!isEntregas && tipo === 'cobro' && (
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Monto ($)</label>
                <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
                  placeholder="Ej: 44000"
                  className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
              </div>
            )}

            {/* Factura */}
            {isEntregas && (
              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Número de factura</label>
                {facturaPreset ? (
                  <div className="rounded-xl px-4 py-2.5 flex items-center gap-2" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}}>
                    <span className="text-lg">📦</span>
                    <span className="text-white text-sm font-semibold">{empresaOrigen ? `${empresaOrigen}: #${facturaPreset}` : `Factura: #${facturaPreset}`}</span>
                  </div>
                ) : (
                  <input value={factura} onChange={e => setFactura(e.target.value)}
                    placeholder="Ej: FAC-001234"
                    className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
                )}
              </div>
            )}

            {/* Nota */}
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1.5">
                {isEntregas ? 'Novedad (opcional)' : 'Nota (opcional)'}
              </label>
              <textarea value={nota} onChange={e => setNota(e.target.value)}
                rows={2} placeholder="Observaciones..."
                className="w-full  rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500 resize-none" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}} />
            </div>

            {/* Firma */}
            {isEntregas && <FirmaCanvas onFirma={setFirma} firma={firma} />}

            {/* GPS capture */}
            {(() => {
              const sinGpsReal = !clienteActual!.lat && !clienteActual!.lng
              const sinGpsTmp = !clienteActual!.latTmp && !clienteActual!.lngTmp
              const esPrimera = sinGpsReal && sinGpsTmp
              return (
                <div className="space-y-2">
                  {/* Aviso primera visita — para impulsadora (sin puedeCapturarGps) */}
                  {!puedeCapturarGps && esPrimera && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 space-y-2">
                      <p className="text-blue-300 text-sm font-medium">📍 Primera visita a este cliente</p>
                      <p className="text-zinc-400 text-xs">Tu ubicación GPS se guardará como punto de referencia para futuras comparaciones.</p>
                      {obteniendo && (
                        <div className="space-y-1">
                          <div className="h-1.5 bg-zinc-500/40 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all duration-300"
                              style={{width: gpsProgress + '%'}} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Checkbox solo para vendedor autorizado */}
                  {puedeCapturarGps && !modoNuevo && (
                    <div className="flex items-center gap-3  rounded-xl px-4 py-3" style={{background:"#1e2030",border:"1px solid rgba(59,130,246,0.20)"}}>
                      <input type="checkbox" id="capturarGpsModal" checked={capturarGps}
                        onChange={e => setCapturarGps(e.target.checked)}
                        className="w-4 h-4 accent-emerald-500" />
                      <label htmlFor="capturarGpsModal" className="text-zinc-300 text-sm cursor-pointer">
                        {clienteActual!.ubicacionReal ? 'Actualizar ubicación de este cliente' : 'Guardar ubicación de este cliente'}
                      </label>
                    </div>
                  )}
                  {/* Barra progreso GPS en background (vendedor) */}
                  {puedeCapturarGps && obteniendo && (
                    <div className="space-y-1">
                      <div className="h-1.5 bg-zinc-500/40 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{width: gpsProgress + '%'}} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <p className="text-zinc-500 text-xs">📡 Se guardará tu ubicación GPS automáticamente</p>

            {/* Indicador GPS */}
            <div className="flex justify-center mb-1">
              <GpsIndicator estado={gpsDemand.estado} intento={gpsDemand.intento} max={gpsDemand.MAX_INTENTOS} pos={gpsDemand.pos} />
            </div>

            {/* Botones */}
            <div className="flex gap-2">
              {!clienteInicial && (
                <button onClick={() => setCliente(null)} className="flex-1 text-white text-sm py-3 rounded-xl" style={{background:"#3f3f46",border:"1px solid rgba(59,130,246,0.25)"}}>Atrás</button>
              )}
              {clienteInicial && (
                <button onClick={onClose} className="flex-1 text-white text-sm py-3 rounded-xl" style={{background:"#3f3f46",border:"1px solid rgba(59,130,246,0.25)"}}>Cancelar</button>
              )}
              <button onClick={registrar} disabled={!puedeGuardar}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl">
                {obteniendo ? '📡 GPS...' : loading ? 'Guardando...' : '✅ Registrar'}
              </button>
            </div>

            {isEntregas && !factura && <p className="text-yellow-400 text-xs text-center">Ingresa el número de factura</p>}
            {isEntregas && factura && !firma && <p className="text-yellow-400 text-xs text-center">Se requiere firma del cliente</p>}
          </div>
        )}
      </div>
    </div>
  )
}
