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

const MEDIOS_PAGO = ['BANCO','NEQUI','DAVIPLATA','EFECTIVO','TRANSFERENCIA','PSE']

interface Abono { id: string; valor: number; fecha: string; medioPago?: string; estado?: string; autorizado?: boolean; evidenciaKey?: string }

interface Props {
  egresoId: string | null
  categoriaKey: string
  mes: number
  anio: number
  initialConcepto?: string
  initialFechaReg?: string
  initialValor?: string
  initialRetencion?: string
  initialDescuento?: string
  initialFecha?: string
  initialProveedor?: { id: string; firstName: string; lastName: string | null; aplica_retencion: boolean; porcentaje_retencion: string | null } | null
  onAbonoGuardado?: (abonoPago: number, saldo: number) => void
  onGuardado: (data: {
    evidenciaKey: string
    concepto: string
    valor: string
    retencion: string
    descuento: string
    fecha: string
    saldo: number
    proveedorId: string | null
    proveedorNombre: string | null
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
  initialConcepto = '', initialFechaReg = '', initialValor = '', initialRetencion = '', initialDescuento = '', initialFecha = '', initialProveedor = null,
  onGuardado, onAbonoGuardado, onClose,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    notifyModuleOpen()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { notifyModuleClose(); document.body.style.overflow = prev }
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
  const [descuento, setDescuento] = useState(initialDescuento)

  // Abonos
  const [abonos, setAbonos] = useState<Abono[]>([])
  const [loadingAbonos, setLoadingAbonos] = useState(false)
  const [subiendoPago, setSubiendoPago] = useState(false)
  const [openFormAbono, setOpenFormAbono] = useState(false)
  const [abonoValor, setAbonoValor] = useState('')
  const [abonoFecha, setAbonoFecha] = useState('')
  const [abonoMedio, setAbonoMedio] = useState('')
  const [abonoKey, setAbonoKey] = useState('')
  const [guardandoAbono, setGuardandoAbono] = useState(false)
  const [errorAbono, setErrorAbono] = useState('')
  const fileAbonoRef = useRef<HTMLInputElement>(null)

  // Cargar abonos al abrir (si hay egresoId)
  useEffect(() => {
    if (!egresoId) return
    setLoadingAbonos(true)
    fetch(`/api/egresos/abono?egresoId=${egresoId}`)
      .then(r => r.json())
      .then(d => { setAbonos(d.abonos || []) })
      .finally(() => setLoadingAbonos(false))
  }, [egresoId])

  // Retención: origen — 'ia' | 'proveedor' | 'manual'
  const [retencionOrigen, setRetencionOrigen] = useState<'ia' | 'proveedor' | 'manual'>('manual')

  // Proveedor
  const [busqueda, setBusqueda] = useState(() => {
    const p = initialProveedor as any
    if (!p) return ''
    return p.firstName + (p.lastName ? ' ' + p.lastName : '')
  })
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedorSel, setProveedorSel] = useState<Proveedor | null>(initialProveedor as any || null)
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
        valor: v, retencion: r, descuento: descuentoNum, saldo,
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
        descuento: String(descuentoNum),
        fecha: fechaFinal,
        saldo,
        proveedorId: proveedorSel?.id || null,
        proveedorNombre: proveedorSel ? (proveedorSel.firstName + (proveedorSel.lastName ? ' ' + proveedorSel.lastName : '')) : null,
        medioPago,
      })
    } catch (e: any) {
      setError('Error al guardar: ' + (e?.message || ''))
    } finally {
      setGuardando(false)
    }
  }

  async function handleArchivoPago(file: File) {
    setSubiendoPago(true); setErrorAbono('')
    try {
      let base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.onerror = rej; r.readAsDataURL(file)
      })
      const mimeType = file.type || 'image/jpeg'
      if (!base64.startsWith('data:application/pdf')) base64 = await comprimirImagen(base64)
      const res = await fetch('/api/egresos/voucher', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoBase64: base64, mimeType, egresoId: egresoId || crypto.randomUUID() }),
      })
      const data = await res.json()
      setAbonoKey(data.key || '')
      if (data.datosIA?.valor) setAbonoValor(String(Math.round(data.datosIA.valor)))
      if (data.datosIA?.fecha) setAbonoFecha(data.datosIA.fecha)
      if (data.datosIA?.medioPago) setAbonoMedio(data.datosIA.medioPago)
      setOpenFormAbono(true)
    } catch { setErrorAbono('Error procesando archivo') }
    finally { setSubiendoPago(false); if (fileAbonoRef.current) fileAbonoRef.current.value = '' }
  }

  async function confirmarAbono() {
    if (!abonoValor || !egresoId) return
    setGuardandoAbono(true); setErrorAbono('')
    try {
      const res = await fetch('/api/egresos/abono', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ egresoId, valor: parseFloat(abonoValor), fecha: abonoFecha, evidenciaKey: abonoKey, medioPago: abonoMedio }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setAbonos(prev => [...prev, { id: d.id || crypto.randomUUID(), valor: parseFloat(abonoValor), fecha: abonoFecha, medioPago: abonoMedio, evidenciaKey: abonoKey }])
      if (onAbonoGuardado && d.abonoPago !== undefined) onAbonoGuardado(d.abonoPago, d.saldo)
      setOpenFormAbono(false); setAbonoValor(''); setAbonoFecha(''); setAbonoMedio(''); setAbonoKey('')
    } catch { setErrorAbono('Error al guardar abono') }
    finally { setGuardandoAbono(false) }
  }

  async function verUrl(key: string) {
    const r = await fetch(`/api/egresos/url?key=${encodeURIComponent(key)}`)
    const d = await r.json()
    if (d.url) window.open(d.url, '_blank')
  }

  const fmtF = (f: string) => { if (!f) return ''; return new Date(f.slice(0,10) + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'2-digit' }) }
  const fmtM = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

  const retencionReadonly = retencionOrigen === 'ia' || retencionOrigen === 'proveedor'
  const valorNum = parseFloat(valor) || 0
  const retencionNum = parseFloat(retencion) || 0
  const descuentoNum = parseFloat(descuento) || 0
  const totalAbonos = abonos.reduce((s, a) => s + a.valor, 0)
  const saldo = Math.max(0, valorNum - retencionNum - descuentoNum - totalAbonos)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)', overscrollBehavior: 'contain' }} onClick={onClose}>
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
          style={{ background: '#141c2e', border: subiendo ? 'none' : '1px solid #1e2a3d', borderRadius: 20, maxHeight: '92vh', position: 'relative', zIndex: 1, overscrollBehavior: 'contain' }}>

        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-white font-bold text-base">{initialConcepto || 'Egreso'}</h3>
            {initialFechaReg && <p className="text-zinc-500 text-xs mt-0.5">{fmtF(initialFechaReg)}</p>}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:20,lineHeight:1,padding:'0 0 0 8px',flexShrink:0}} title="Cerrar">✕</button>
        </div>

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

        </div>

        {/* Concepto */}
        <div>
          <label className="text-zinc-400 text-xs font-semibold block mb-1">Concepto</label>
          <input type="text" value={concepto} onChange={e => setConcepto(e.target.value.toUpperCase())}
            placeholder="Ej: Arriendo, factura proveedor..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
        </div>

        {/* Valor + Retención */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-zinc-400 text-xs font-semibold block mb-1">Valor</label>
            <InputMoneda value={valor} onChange={setValor}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="flex-1">
            <label className="text-zinc-400 text-xs font-semibold block mb-1">
              Retención
              {retencionOrigen === 'ia' && <span className="text-blue-400 text-xs ml-1">• IA</span>}
              {retencionOrigen === 'proveedor' && <span className="text-orange-400 text-xs ml-1">• {proveedorSel?.porcentaje_retencion}%</span>}
            </label>
            <InputMoneda value={retencion} onChange={v => { setRetencion(v); setRetencionOrigen('manual') }}
              className={`w-full rounded-lg px-3 py-2 text-white text-sm outline-none ${retencionReadonly ? 'bg-zinc-900 border border-zinc-800 text-zinc-400' : 'bg-zinc-800 border border-zinc-700 focus:border-blue-500'}`} />
          </div>
        </div>

        {/* Descuento + Fecha */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-zinc-400 text-xs font-semibold block mb-1">Descuento</label>
            <InputMoneda value={descuento} onChange={setDescuento}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="flex-1">
            <label className="text-zinc-400 text-xs font-semibold block mb-1">Fecha documento</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
              style={{ colorScheme: 'dark' }} />
          </div>
        </div>

        {/* Adjuntar Pago */}
        {egresoId && (
          <div>
            <label className="text-zinc-400 text-xs font-semibold block mb-1">Pago</label>
            <input ref={fileAbonoRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleArchivoPago(e.target.files[0]) }} />
            <div className="flex gap-2">
              <div
                className="flex-1 flex items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-colors"
                style={{ borderColor:'rgba(59,130,246,0.35)', background:'rgba(59,130,246,0.04)', padding:'9px 0' }}
                onClick={() => { if (!openFormAbono) fileAbonoRef.current?.click() }}>
                {subiendoPago
                  ? <span className="text-zinc-400 text-sm">⏳ Procesando...</span>
                  : <span className="text-zinc-500 text-sm">📎 Adjuntar comprobante</span>}
              </div>
              <button
                onClick={() => setOpenFormAbono(true)}
                disabled={openFormAbono}
                style={{ flexShrink:0, background:'rgba(59,130,246,0.12)', border:'1px solid rgba(59,130,246,0.35)', borderRadius:12, color:'#60a5fa', fontSize:13, fontWeight:600, padding:'9px 14px', cursor:'pointer', whiteSpace:'nowrap', opacity: openFormAbono ? 0.4 : 1 }}>
                ＋ Manual
              </button>
            </div>
          </div>
        )}

        {/* Form abono inline */}
        {openFormAbono && (
          <div className="rounded-xl p-3 space-y-3" style={{background:'rgba(59,130,246,0.07)',border:'1px solid rgba(59,130,246,0.25)'}}>
            <p className="text-blue-400 text-xs font-bold">Pago #{abonos.length + 1}</p>
            {/* Valor + Medio */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-zinc-400 text-xs font-semibold block mb-1">Valor</label>
                <InputMoneda value={abonoValor} onChange={setAbonoValor}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
              </div>
              <div className="flex-1">
                <label className="text-zinc-400 text-xs font-semibold block mb-1">Medio</label>
                <select value={abonoMedio} onChange={e => setAbonoMedio(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500">
                  <option value="">— Medio</option>
                  {MEDIOS_PAGO.map(m => <option key={m} value={m} style={{background:'#1e2030'}}>{m}</option>)}
                </select>
              </div>
            </div>
            {/* Fecha */}
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Fecha</label>
              <input type="date" value={abonoFecha} onChange={e => setAbonoFecha(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
                style={{colorScheme:'dark'}} onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch {} }} />
            </div>
            {errorAbono && <p className="text-red-400 text-xs">{errorAbono}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setOpenFormAbono(false); setAbonoValor(''); setAbonoFecha(''); setAbonoMedio(''); setAbonoKey('') }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold py-2 rounded-xl">Cancelar</button>
              <button onClick={confirmarAbono} disabled={!abonoValor || guardandoAbono}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl">
                {guardandoAbono ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}

        {/* Historial de pagos */}
        {(abonos.length > 0 || loadingAbonos) && (
          <div>
            <p className="text-zinc-400 text-xs font-bold mb-2">Historial de pagos</p>
            {loadingAbonos
              ? <div className="flex justify-center py-2"><span className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
              : <div className="space-y-1">
                  {abonos.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{background:'rgba(255,255,255,0.04)',border:'1px solid #1e2a3d'}}>
                      <span className="text-zinc-500 text-xs flex-shrink-0">#{i+1}</span>
                      <span className="text-white text-sm font-semibold flex-shrink-0">{fmtM(a.valor)}</span>
                      <span className="text-zinc-400 text-xs flex-shrink-0">{fmtF(a.fecha)}</span>
                      {a.medioPago && <span className="text-violet-400 text-xs flex-shrink-0">{a.medioPago}</span>}
                      <span className="flex-1" />
                      {a.evidenciaKey && (
                        <button onClick={() => verUrl(a.evidenciaKey!)}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize:14,padding:0,color:'#94a3b8'}}>📎</button>
                      )}
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* Saldo a pagar */}
        {valorNum > 0 && (
          <div className="flex justify-between items-center px-1 py-2 rounded-xl" style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.20)'}}>
            <span className="text-zinc-400 text-sm font-semibold">Saldo a pagar</span>
            <span className="text-amber-400 font-bold text-lg">{fmtM(saldo)}</span>
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1 pb-safe" style={{paddingBottom:"max(24px, env(safe-area-inset-bottom))"}}>
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
