'use client'
import { useRef, useState, useEffect } from 'react'
import BorderBeam from './BorderBeam'
import { notifyModuleOpen, notifyModuleClose } from '@/lib/moduleEvents'

interface Props {
  onGuardado: () => void
  onClose: () => void
}

function comprimirImagen(base64: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => resolve(base64)
    img.src = base64
  })
}

const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

export default function ModalEvento({ onGuardado, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const eventoId = useRef(crypto.randomUUID())

  useEffect(() => {
    notifyModuleOpen()
    return () => { notifyModuleClose() }
  }, [])

  // Fotos — hasta 4
  const [fotos, setFotos] = useState<{ base64: string; key: string; subiendo: boolean }[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Clientes
  const [clientes, setClientes] = useState<any[]>([])
  const [clienteId, setClienteId] = useState('')
  const [ciudad, setCiudad] = useState('')

  // Campos
  const [tipoEvento, setTipoEvento] = useState('')
  const [fecha, setFecha] = useState(hoyBogota())

  useEffect(() => {
    fetch('/api/impulsar/clientes').then(r => r.json()).then(d => setClientes(d.clientes || []))
  }, [])

  // Auto-fill ciudad al seleccionar cliente
  function seleccionarCliente(id: string) {
    setClienteId(id)
    const cli = clientes.find(c => c.id === id)
    setCiudad((cli as any)?.ciudad || '')
  }

  async function handleFoto(file: File) {
    if (fotos.length >= 4) return
    setSubiendo(true); setError('')
    try {
      let base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      base64 = await comprimirImagen(base64)
      const idx = fotos.length
      setFotos(prev => [...prev, { base64, key: '', subiendo: true }])

      const res = await fetch('/api/impulsar/evento/fotos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoBase64: base64, eventoId: eventoId.current, fotoIdx: idx })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error subiendo')
      setFotos(prev => prev.map((f, i) => i === idx ? { ...f, key: data.key, subiendo: false } : f))
    } catch (e: any) {
      setFotos(prev => prev.slice(0, -1))
      setError('Error subiendo foto: ' + (e?.message || ''))
    } finally {
      setSubiendo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function eliminarFoto(idx: number) {
    setFotos(prev => prev.filter((_, i) => i !== idx))
  }

  async function guardar() {
    if (fotos.length === 0) { setError('Adjunta al menos 1 foto'); return }
    if (fotos.some(f => f.subiendo)) { setError('Espera a que terminen de subir las fotos'); return }
    if (!clienteId) { setError('Selecciona un cliente'); return }
    if (!tipoEvento.trim()) { setError('Ingresa el tipo de evento'); return }
    if (!fecha) { setError('Selecciona una fecha'); return }

    setGuardando(true); setError('')
    try {
      const res = await fetch('/api/impulsar/evento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          ciudad: ciudad || null,
          tipoEvento: tipoEvento.trim(),
          fecha,
          fotos: fotos.map(f => f.key),
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error guardando')
      onGuardado()
    } catch (e: any) {
      setError('Error: ' + (e?.message || ''))
    } finally {
      setGuardando(false)
    }
  }

  const fotosSubiendo = fotos.some(f => f.subiendo)
  const puedeGuardar = fotos.length > 0 && !fotosSubiendo && clienteId && tipoEvento.trim() && fecha

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className={`bb-host${fotosSubiendo ? ' bb-active' : ''}`}
        style={{ position: 'relative', width: '100%', maxWidth: 400, borderRadius: 22, padding: fotosSubiendo ? 2 : 0, background: fotosSubiendo ? undefined : 'transparent', overflow: 'hidden' }}>
        <BorderBeam active={fotosSubiendo} borderRadius={22} duration={4} />
        <div className="w-full p-5 space-y-4 overflow-y-auto"
          style={{ background: '#141c2e', border: fotosSubiendo ? 'none' : '1px solid #1e2a3d', borderRadius: 20, maxHeight: '92vh', position: 'relative', zIndex: 1 }}>

          <h3 className="text-white font-semibold text-base">Registrar Evento</h3>

          {/* Fotos — hasta 4 */}
          <div>
            <label className="text-zinc-400 text-xs font-semibold block mb-2">
              Fotos <span className="text-red-400">*</span>
              <span className="text-zinc-600 ml-1">({fotos.length}/4)</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {fotos.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden" style={{ background: '#0d1220', border: '1px solid #1e2a3d' }}>
                  {f.subiendo
                    ? <div className="w-full h-full flex items-center justify-center"><span className="text-zinc-500 text-xs">⏳</span></div>
                    : <img src={f.base64} alt="" className="w-full h-full object-cover" />
                  }
                  {!f.subiendo && (
                    <button onClick={() => eliminarFoto(i)}
                      className="absolute top-1 right-1 bg-black/60 rounded-full w-5 h-5 flex items-center justify-center text-white text-xs">×</button>
                  )}
                </div>
              ))}
              {fotos.length < 4 && (
                <button onClick={() => fileInputRef.current?.click()}
                  disabled={subiendo}
                  className="aspect-square rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                  style={{ background: '#0d1220', border: '2px dashed rgba(59,130,246,0.3)' }}>
                  <span className="text-xl">+</span>
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={e => { if (e.target.files?.[0]) handleFoto(e.target.files[0]) }} />
          </div>

          {/* Cliente */}
          <div>
            <label className="text-zinc-400 text-xs font-semibold block mb-1">Cliente <span className="text-red-400">*</span></label>
            <select value={clienteId} onChange={e => seleccionarCliente(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500">
              <option value="">— Seleccionar cliente —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          {/* Ciudad — auto, editable */}
          {ciudad && (
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Ciudad</label>
              <input value={ciudad} onChange={e => setCiudad(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>
          )}

          {/* Tipo de evento */}
          <div>
            <label className="text-zinc-400 text-xs font-semibold block mb-1">Tipo de evento <span className="text-red-400">*</span></label>
            <input type="text" value={tipoEvento} onChange={e => setTipoEvento(e.target.value)}
              placeholder="Ej: Degustación, Lanzamiento, Exhibición..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
          </div>

          {/* Fecha */}
          <div>
            <label className="text-zinc-400 text-xs font-semibold block mb-1">Fecha <span className="text-red-400">*</span></label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
              style={{ colorScheme: 'dark' }} />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl transition-colors">
              Cancelar
            </button>
            <button onClick={guardar} disabled={!puedeGuardar || guardando}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors">
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
