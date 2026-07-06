'use client'
import { useRef, useState } from 'react'
import InputMoneda from './InputMoneda'

const CATEGORIAS_EGRESO = [
  { key: 'nomina',        label: 'Nómina' },
  { key: 'gastos_fijos',  label: 'Gastos Fijos' },
  { key: 'gastos_varios', label: 'Gastos Varios' },
  { key: 'proveedores',   label: 'Proveedores' },
]

interface Props {
  mes: number
  anio: number
  onAdicionado: () => void
}

export default function AdjuntarEgreso({ mes, anio, onAdicionado }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo]               = useState(false)
  const [popupAbierto, setPopupAbierto]       = useState(false)
  const [evidenciaKey, setEvidenciaKey]       = useState('')
  const [datosIA, setDatosIA]                 = useState<any>(null)
  const [concepto, setConcepto]               = useState('')
  const [valor, setValor]                     = useState('')
  const [retencion, setRetencion]             = useState('')
  const [fechaDoc, setFechaDoc]               = useState('')
  const [categoria, setCategoria]             = useState('')
  const [error, setError]                     = useState('')
  const [guardando, setGuardando]             = useState(false)

  function cerrar() {
    setPopupAbierto(false)
    setConcepto(''); setValor(''); setRetencion(''); setFechaDoc(''); setCategoria('')
    setEvidenciaKey(''); setDatosIA(null); setError('')
  }

  async function handleArchivo(file: File) {
    setSubiendo(true); setError('')
    try {
      const archivoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const gastoIdTemp = crypto.randomUUID()
      const res = await fetch('/api/gastos/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoBase64, mimeType: file.type, gastoId: gastoIdTemp }),
      })
      const data = await res.json()
      setEvidenciaKey(data.key || '')
      setDatosIA(data.datosIA)
      setConcepto(data.datosIA?.concepto || '')
      setValor(data.datosIA?.valor ? String(Math.round(data.datosIA.valor)) : '')
      const rawFecha = data.datosIA?.fecha || ''
      // Normalizar DD/MM/YYYY → YYYY-MM-DD
      let fechaNorm = rawFecha
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawFecha)) {
        const [d,m,y] = rawFecha.split('/')
        fechaNorm = `${y}-${m}-${d}`
      }
      setFechaDoc(fechaNorm)
      setPopupAbierto(true)
    } catch {
      setError('No se pudo procesar el archivo.')
    } finally {
      setSubiendo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function confirmar() {
    if (!concepto.trim() || !valor || !categoria) return
    setGuardando(true)
    try {
      const hoy = new Date()
      const v = parseFloat(valor) || 0
      const r = parseFloat(retencion) || 0
      const saldo = Math.max(0, v - r)
      const res = await fetch('/api/egresos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepto: concepto.trim(),
          valor: v,
          retencion: r,
          saldo,
          fecha: fechaDoc || hoy.toISOString().split('T')[0],
          categoria,
          mes,
          anio,
          evidenciaKey,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      cerrar()
      onAdicionado()
    } catch (e: any) {
      setError('Error al guardar el egreso.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleArchivo(e.target.files[0]) }} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={subiendo}
        className="flex items-center justify-center disabled:opacity-50 transition-colors h-full flex-shrink-0" style={{ background:'none', border:'none', cursor:'pointer', fontSize:22, padding:'0 4px' }}>
        {subiendo ? '⏳' : '📎'}
      </button>

      {error && !popupAbierto && (
        <div className="fixed bottom-4 left-4 right-4 z-50 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-400 text-sm">
          {error}
        </div>
      )}

      {popupAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={cerrar}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{ background: '#141c2e', border: '1px solid #1e2a3d' }}>
            <h3 className="text-white font-semibold text-base">Confirmar egreso</h3>
            {!datosIA?.concepto && !datosIA?.valor && (
              <p className="text-amber-400 text-xs bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                ⚠️ No se pudo leer el documento — completa los datos manualmente
              </p>
            )}

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Categoría</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500">
                <option value="">Selecciona categoría</option>
                {CATEGORIAS_EGRESO.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Concepto</label>
              <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)}
                placeholder="Ej: Arriendo, nómina, factura proveedor..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Valor</label>
              <InputMoneda value={valor} onChange={setValor}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Retención (opcional)</label>
              <InputMoneda value={retencion} onChange={setRetencion}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Fecha del documento</label>
              <input type="date" value={fechaDoc} onChange={e => setFechaDoc(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={cerrar}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={confirmar} disabled={!concepto.trim() || !valor || !categoria || guardando}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors">
                {guardando ? 'Guardando...' : 'Adicionar egreso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
