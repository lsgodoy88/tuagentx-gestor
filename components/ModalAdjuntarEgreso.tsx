'use client'
import { useRef, useState, useEffect } from 'react'
import InputMoneda from './InputMoneda'
import BorderBeam from './BorderBeam'
import { notifyModuleOpen, notifyModuleClose } from '@/lib/moduleEvents'

type Proveedor = {
  id: string
  firstName: string
  lastName: string | null
  document: string | null
  aplica_retencion: boolean
  porcentaje_retencion: string | null
}

type DatosIA = {
  valor: number | null
  retencion: number | null
  fecha: string | null
  concepto: string | null
  medioPago: string | null
}

interface Props {
  egresoId: string | null        // null = fila nueva sin guardar aún
  categoriaKey: string
  mes: number
  anio: number
  initialConcepto?: string
  initialValor?: string
  initialRetencion?: string
  initialFecha?: string
  onGuardado: (data: {
    evidenciaKey: string
    concepto: string
    valor: string
    retencion: string
    fecha: string
    proveedorId: string | null
    medioPago: string | null
  }) => void
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
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.onerror = () => resolve(base64)
    img.src = base64
  })
}

export default function ModalAdjuntarEgreso({
  egresoId, categoriaKey, mes, anio,
  initialConcepto = '', initialValor = '', initialRetencion = '', initialFecha = '',
  onGuardado, onClose,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    notifyModuleOpen()
    return () => { notifyModuleClose() }
  }, [])

  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const [evidenciaKey, setEvidenciaKey] = useState('')
  const [datosIA, setDatosIA] = useState<DatosIA | null>(null)

  const [concepto, setConcepto] = useState(initialConcepto)
  const [valor, setValor] = useState(initialValor)
  const [retencion, setRetencion] = useState(initialRetencion)
  const [fecha, setFecha] = useState(initialFecha)
  const [medioPago, setMedioPago] = useState<string | null>(null)

  // Retención: origen — 'ia' | 'proveedor' | 'manual'
  const [retencionOrigen, setRetencionOrigen] = useState<'ia' | 'proveedor' | 'manual'>('manual')

  // Proveedor
  const [busqueda, setBusqueda] = useState('')
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedorSel, setProveedorSel] = useState<Proveedor | null>(null)
  const [buscando, setBuscando] = useState(false)

  // Buscar proveedores
  useEffect(() => {
    if (!busqueda.trim()) { setProveedores([]); return }
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/proveedores?modo=todos&q=${encodeURIComponent(busqueda)}`)
        const d = await r.json()
        setProveedores(d.proveedores || [])
      } finally { setBuscando(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  // Al seleccionar proveedor: calcular retención si IA no la detectó
  function seleccionarProveedor(p: Proveedor) {
    setProveedorSel(p)
    setBusqueda(`${p.firstName}${p.lastName ? ' ' + p.lastName : ''}`)
    setProveedores([])
    if (retencionOrigen !== 'ia' && p.aplica_retencion && p.porcentaje_retencion) {
      const pct = parseFloat(p.porcentaje_retencion) || 0
      const v = parseFloat(valor) || 0
      if (v > 0 && pct > 0) {
        setRetencion(String(Math.round(v * pct / 100)))
        setRetencionOrigen('proveedor')
      }
    }
  }

  // Recalcular retención por proveedor si cambia el valor (solo si origen es proveedor)
  useEffect(() => {
    if (retencionOrigen === 'proveedor' && proveedorSel?.aplica_retencion && proveedorSel.porcentaje_retencion) {
      const pct = parseFloat(proveedorSel.porcentaje_retencion) || 0
      const v = parseFloat(valor) || 0
      setRetencion(v > 0 && pct > 0 ? String(Math.round(v * pct / 100)) : '')
    }
  }, [valor, retencionOrigen, proveedorSel])

  async function handleArchivo(file: File) {
    setSubiendo(true); setError('')
    try {
      let base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const mimeType = file.type || 'image/jpeg'
      if (!base64.startsWith('data:application/pdf')) {
        base64 = await comprimirImagen(base64)
      }
      const res = await fetch('/api/egresos/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoBase64: base64, mimeType, egresoId: egresoId || crypto.randomUUID() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error subiendo')
      const ia: DatosIA = data.datosIA || {}
      setEvidenciaKey(data.key || '')
      setDatosIA(ia)
      // Autocompletar campos vacíos
      if (!concepto.trim() && ia.concepto) setConcepto(ia.concepto.toUpperCase())
      if (!valor && ia.valor) setValor(String(Math.round(ia.valor)))
      if (!fecha && ia.fecha) setFecha(ia.fecha)
      if (ia.medioPago) setMedioPago(ia.medioPago)
      // Retención: IA tiene prioridad
      if (ia.retencion && ia.retencion > 0) {
        setRetencion(String(Math.round(ia.retencion)))
        setRetencionOrigen('ia')
      }
    } catch (e: any) {
      setError('Error: ' + (e?.message || 'No se pudo procesar'))
    } finally {
      setSubiendo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function guardar() {
    if (!concepto.trim() || !valor) return
    setGuardando(true); setError('')
    try {
      const fechaFinal = fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      const v = parseFloat(valor) || 0
      const r = parseFloat(retencion) || 0
      const saldo = Math.max(0, v - r)
      const body: Record<string, any> = {
        concepto: concepto.trim().toUpperCase(),
        valor: v, retencion: r, saldo,
        fecha: fechaFinal,
        ...(evidenciaKey ? { evidenciaKey } : {}),
        ...(proveedorSel ? { proveedorId: proveedorSel.id } : {}),
        ...(medioPago ? { medioPago } : {}),
      }

      if (egresoId) {
        // Egreso existente → PATCH
        await fetch('/api/egresos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: egresoId, ...body }),
        })
      } else {
        // Fila nueva → POST
        const res = await fetch('/api/egresos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, categoria: categoriaKey, mes, anio }),
        })
        if (!res.ok) throw new Error(await res.text())
      }

      onGuardado({
        evidenciaKey,
        concepto: body.concepto,
        valor: String(v),
        retencion: String(r),
        fecha: fechaFinal,
        proveedorId: proveedorSel?.id || null,
        medioPago,
      })
    } catch (e: any) {
      setError('Error al guardar: ' + (e?.message || ''))
    } finally {
      setGuardando(false)
    }
  }

  const retencionReadonly = retencionOrigen === 'ia' || retencionOrigen === 'proveedor'
  const valorNum = parseFloat(valor) || 0
  const retencionNum = parseFloat(retencion) || 0
  const saldo = Math.max(0, valorNum - retencionNum)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div
          onClick={e => e.stopPropagation()}
          className={`bb-host${subiendo ? ' bb-active' : ''}`}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 384,
            borderRadius: 22,
            padding: subiendo ? 2 : 0,
            background: subiendo ? undefined : 'transparent',
            overflow: 'hidden',
          }}>
        <BorderBeam active={subiendo} borderRadius={22} duration={4} />
        <div
          className="w-full p-5 space-y-4 overflow-y-auto"
          style={{ background: '#141c2e', border: subiendo ? 'none' : '1px solid #1e2a3d', borderRadius: 20, maxHeight: '92vh', position: 'relative', zIndex: 1 }}>

        <h3 className="text-white font-semibold text-base">Egreso</h3>

        {/* Zona adjunto */}
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
          className="hidden" onChange={e => { if (e.target.files?.[0]) handleArchivo(e.target.files[0]) }} />
        <div
          className="flex items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-colors"
          style={{ borderColor: evidenciaKey ? '#34d399' : 'rgba(52,211,153,0.45)', background: evidenciaKey ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.03)', padding: '11px 0' }}
          onClick={() => fileInputRef.current?.click()}>
          {subiendo
            ? <span className="text-zinc-400 text-sm">⏳ Analizando...</span>
            : evidenciaKey
              ? <span className="text-emerald-400 text-sm font-semibold">✅ Adjunto cargado — toca para cambiar</span>
              : <span className="text-zinc-500 text-sm">📎 Adjuntar factura</span>
          }
        </div>

        {/* Proveedor */}
        <div className="relative">
          <label className="text-zinc-400 text-xs font-semibold block mb-1">Proveedor <span className="text-zinc-600">(opcional)</span></label>
          <input
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); if (!e.target.value) { setProveedorSel(null); if (retencionOrigen === 'proveedor') { setRetencion(''); setRetencionOrigen('manual') } } }}
            placeholder="Buscar proveedor..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
          />
          {proveedores.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-xl overflow-hidden border border-zinc-700"
              style={{ background: '#0f1623', maxHeight: 160, overflowY: 'auto' }}>
              {buscando
                ? <p className="text-zinc-500 text-xs px-3 py-2">Buscando...</p>
                : proveedores.map(p => (
                  <button key={p.id} onClick={() => seleccionarProveedor(p)}
                    className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-700 transition-colors">
                    {p.firstName}{p.lastName ? ' ' + p.lastName : ''}
                    {p.document ? <span className="text-zinc-500 text-xs ml-2">{p.document}</span> : null}
                    {p.aplica_retencion && p.porcentaje_retencion
                      ? <span className="text-orange-400 text-xs ml-2">Ret. {p.porcentaje_retencion}%</span>
                      : null}
                  </button>
                ))
              }
            </div>
          )}
          {proveedorSel && (
            <p className="text-emerald-400 text-xs mt-1">
              ✓ {proveedorSel.firstName}{proveedorSel.lastName ? ' ' + proveedorSel.lastName : ''}
              {proveedorSel.aplica_retencion && proveedorSel.porcentaje_retencion
                ? ` — Retención ${proveedorSel.porcentaje_retencion}%`
                : ' — Sin retención'}
            </p>
          )}
        </div>

        {/* Concepto */}
        <div>
          <label className="text-zinc-400 text-xs font-semibold block mb-1">Concepto</label>
          <input type="text" value={concepto} onChange={e => setConcepto(e.target.value.toUpperCase())}
            placeholder="Ej: Arriendo, factura proveedor..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
        </div>

        {/* Valor */}
        <div>
          <label className="text-zinc-400 text-xs font-semibold block mb-1">Valor</label>
          <InputMoneda value={valor} onChange={setValor}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
        </div>

        {/* Retención */}
        <div>
          <label className="text-zinc-400 text-xs font-semibold block mb-1">
            Retención
            {retencionOrigen === 'ia' && <span className="text-blue-400 text-xs ml-2">• del documento</span>}
            {retencionOrigen === 'proveedor' && <span className="text-orange-400 text-xs ml-2">• calculada ({proveedorSel?.porcentaje_retencion}%)</span>}
          </label>
          <InputMoneda value={retencion} onChange={v => { setRetencion(v); setRetencionOrigen('manual') }}
            className={`w-full rounded-lg px-3 py-2 text-white text-sm outline-none ${retencionReadonly ? 'bg-zinc-900 border border-zinc-800 text-zinc-400' : 'bg-zinc-800 border border-zinc-700 focus:border-blue-500'}`} />
        </div>

        {/* Fecha */}
        <div>
          <label className="text-zinc-400 text-xs font-semibold block mb-1">Fecha del documento</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
            style={{ colorScheme: 'dark' }} />
        </div>

        {/* Saldo calculado */}
        {valorNum > 0 && (
          <div className="flex justify-between text-xs px-1">
            <span className="text-zinc-500">Saldo a pagar</span>
            <span className="text-amber-400 font-bold">
              ${saldo.toLocaleString('es-CO')}
            </span>
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl transition-colors">
            Cancelar
          </button>
          <button onClick={guardar}
            disabled={!concepto.trim() || !valor || guardando}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
