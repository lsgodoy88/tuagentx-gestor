'use client'
import { useState, useEffect, useRef } from 'react'
import InputMoneda from '@/components/InputMoneda'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

// fechaDoc es una fecha PURA (día calendario del documento, sin hora/timezone
// real) — formatearla con new Date()+timeZone le aplica un offset que puede
// restar un día (ej. 2024-12-16 medianoche UTC se vuelve 15 dic en Bogotá).
// Se parsea el string YYYY-MM-DD directo, sin pasar por conversión de zona.
function fmtFechaDoc(iso: string): string {
  const soloFecha = iso.slice(0, 10) // YYYY-MM-DD, descarta hora si la tiene
  const [anio, mes, dia] = soloFecha.split('-').map(Number)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`
}

// fechaAgregacion SÍ tiene hora real (createdAt del servidor) — se formatea
// en hora Bogotá (correcto usar timeZone aquí, a diferencia de fechaDoc).
function fmtFechaAgregacion(iso: string): string {
  const d = new Date(iso)
  const partes = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d)
  const dia = partes.find(p => p.type === 'day')?.value
  const mes = partes.find(p => p.type === 'month')?.value
  const anio = partes.find(p => p.type === 'year')?.value
  return `${dia}/${mes}/${anio}`
}

const TIPOS_GASTO = ['Viáticos', 'Eventos', 'Papelería', 'Otros'] as const
// Backend usa valores sin tilde (TIPOS_VALIDOS en route.ts) por compatibilidad
// ASCII en CHECK constraint de BD — se mapea aquí en el límite UI↔API.
const TIPO_UI_A_API: Record<string, string> = { 'Viáticos': 'Viaticos', 'Eventos': 'Eventos', 'Papelería': 'Papeleria', 'Otros': 'Otros' }
const TIPO_API_A_UI: Record<string, string> = { 'Viaticos': 'Viáticos', 'Eventos': 'Eventos', 'Papeleria': 'Papelería', 'Otros': 'Otros' }

type Gasto = {
  id: string
  fechaAgregacion: string
  fechaDoc: string | null
  concepto: string
  tipo: string
  valor: string | number
  evidenciaKey: string
  empleado: { id: string; nombre: string }
}

type DatosIAGasto = { valor: number | null; fecha: string | null; concepto: string | null }

/**
 * Módulo completo de gastos (lista + adjuntar + popup IA). Reusado en dos
 * lugares: página independiente /gastos (vendedor/impulsadora) y como tab
 * dentro de /egresos (admin/supervisor) — mismo componente, mismo
 * comportamiento, sin duplicar lógica.
 */
export default function ModuloGastos({ isAdmin, hideButton = false, triggerRef, mes, anio }: { isAdmin: boolean, hideButton?: boolean, triggerRef?: React.RefObject<(() => void) | null>, mes?: number, anio?: number }) {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [subiendo, setSubiendo] = useState(false)
  const [popupAbierto, setPopupAbierto] = useState(false)
  const [evidenciaKey, setEvidenciaKey] = useState('')
  const [datosIA, setDatosIA] = useState<DatosIAGasto | null>(null)
  const [borradorConcepto, setBorradorConcepto] = useState('')
  const [borradorValor, setBorradorValor] = useState('')
  const [borradorFechaDoc, setBorradorFechaDoc] = useState('')
  const [borradorTipo, setBorradorTipo] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  if (triggerRef) (triggerRef as any).current = () => fileInputRef.current?.click()

  useEffect(() => { cargarGastos() }, [mes, anio])

  async function cargarGastos() {
    setLoading(true)
    try {
      const params = mes && anio ? `?mes=${mes}&anio=${anio}` : ''
      const res = await fetch(`/api/gastos${params}`)
      const data = await res.json()
      setGastos(data.gastos || [])
    } finally {
      setLoading(false)
    }
  }

  async function handleArchivo(file: File) {
    setSubiendo(true)
    setError('')
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
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`HTTP ${res.status}: ${txt}`)
      }
      const data = await res.json()
      setEvidenciaKey(data.key)
      setDatosIA(data.datosIA)
      setBorradorConcepto(data.datosIA?.concepto || '')
      setBorradorValor(data.datosIA?.valor ? String(Math.round(data.datosIA.valor)) : '')
      setBorradorFechaDoc(data.datosIA?.fecha || '')
      setPopupAbierto(true)
    } catch (e: any) {
      console.error('[gastos] error subiendo evidencia:', e)
      setError('No se pudo procesar el archivo. Intenta de nuevo.')
    } finally {
      setSubiendo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function confirmarAdicionGasto() {
    if (!borradorConcepto.trim() || !borradorValor || !borradorTipo) return
    try {
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepto: borradorConcepto.trim(),
          valor: parseFloat(borradorValor),
          tipo: TIPO_UI_A_API[borradorTipo] || borradorTipo,
          fechaDoc: borradorFechaDoc || null,
          evidenciaKey,
          datosIA,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      cerrarPopup()
      cargarGastos()
    } catch (e) {
      console.error('[gastos] error creando gasto:', e)
      setError('No se pudo agregar el gasto. Intenta de nuevo.')
    }
  }

  function cerrarPopup() {
    setPopupAbierto(false)
    setEvidenciaKey('')
    setDatosIA(null)
    setBorradorConcepto('')
    setBorradorValor('')
    setBorradorFechaDoc('')
    setBorradorTipo('')
  }

  // Admin: una tabla por empleado (igual patrón que /egresos por categoría).
  // Vendedor/impulsadora: una sola tabla con sus propios gastos.
  const gruposPorEmpleado = isAdmin
    ? Object.values(
        gastos.reduce((acc: Record<string, { empleado: { id: string; nombre: string }; gastos: Gasto[] }>, g) => {
          const id = g.empleado?.id || 'sin-empleado'
          if (!acc[id]) acc[id] = { empleado: g.empleado, gastos: [] }
          acc[id].gastos.push(g)
          return acc
        }, {})
      ).sort((a, b) => (a.empleado?.nombre || '').localeCompare(b.empleado?.nombre || ''))
    : null

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white text-xl font-bold">🧾 Gastos</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            {isAdmin ? 'Gastos de todo el equipo' : 'Tus gastos registrados'}
          </p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleArchivo(e.target.files[0]) }} />
          {!hideButton && <button
            onClick={() => fileInputRef.current?.click()}
            disabled={subiendo}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            {subiendo ? 'Analizando con IA...' : '📎 Adjuntar gasto'}
          </button>}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-zinc-500 text-sm text-center py-10">Cargando...</p>
      ) : gastos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-10 text-center">
          <p className="text-zinc-400 text-sm">Sin gastos registrados todavía</p>
          <p className="text-zinc-500 text-xs mt-1">Adjunta una factura o recibo para empezar</p>
        </div>
      ) : isAdmin ? (
        <div className="space-y-5">
          {gruposPorEmpleado!.map(grupo => (
            <div key={grupo.empleado?.id || 'sin-empleado'} className="space-y-1">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold text-white">👤 {grupo.empleado?.nombre || 'Sin empleado'}</h2>
                <span className="text-sm font-bold text-amber-400">
                  {fmt(grupo.gastos.reduce((s, g) => s + Number(g.valor), 0))}
                </span>
              </div>
              <TablaGasto gastos={grupo.gastos} />
            </div>
          ))}
        </div>
      ) : (
        <TablaGasto gastos={gastos} />
      )}

      {/* Popup confirmación de gasto reconocido por IA */}
      {popupAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={cerrarPopup}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{ background: '#141c2e', border: '1px solid #1e2a3d' }}>
            <h3 className="text-white font-semibold text-base">Confirmar gasto</h3>
            {!datosIA?.concepto && !datosIA?.valor && (
              <p className="text-amber-400 text-xs bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                ⚠️ No se pudo leer el documento automáticamente — completa los datos manualmente
              </p>
            )}

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Concepto</label>
              <input
                type="text"
                value={borradorConcepto}
                onChange={e => setBorradorConcepto(e.target.value)}
                placeholder="Ej: Combustible, peaje, papelería..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Valor</label>
              <InputMoneda value={borradorValor} onChange={setBorradorValor}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Fecha del documento</label>
              <input
                type="date"
                value={borradorFechaDoc}
                onChange={e => setBorradorFechaDoc(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Tipo</label>
              <select
                value={borradorTipo}
                onChange={e => setBorradorTipo(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500">
                <option value="">Selecciona un tipo</option>
                {TIPOS_GASTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={cerrarPopup}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarAdicionGasto}
                disabled={!borradorConcepto.trim() || !borradorValor || !borradorTipo}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors">
                Adicionar gasto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TablaGasto({ gastos }: { gastos: Gasto[] }) {
  return (
    <div className="overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-2xl">
      <table className="w-full text-sm" style={{ minWidth: 680 }}>
        <thead>
          <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
            <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', textAlign: 'left', whiteSpace: 'nowrap' }}>Fecha</th>
            <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', textAlign: 'left', whiteSpace: 'nowrap' }}>Concepto</th>
            <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', textAlign: 'right', whiteSpace: 'nowrap' }}>Valor</th>
            <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', textAlign: 'left', whiteSpace: 'nowrap' }}>Fecha doc</th>
            <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', textAlign: 'center', whiteSpace: 'nowrap' }}>Evidencia</th>
            <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', textAlign: 'left', whiteSpace: 'nowrap' }}>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {gastos.map((g, i) => (
            <tr key={g.id} style={{ background: i % 2 === 0 ? '#141c2e' : '#141c2e', borderBottom: '1px solid #1e2a3d' }}>
              <td className="px-3.5 py-2.5 text-zinc-300 whitespace-nowrap">
                {fmtFechaAgregacion(g.fechaAgregacion)}
              </td>
              <td className="px-3.5 py-2.5 text-white whitespace-nowrap">{g.concepto}</td>
              <td className="px-3.5 py-2.5 text-emerald-400 font-semibold text-right whitespace-nowrap">{fmt(Number(g.valor))}</td>
              <td className="px-3.5 py-2.5 text-zinc-400 whitespace-nowrap">
                {g.fechaDoc ? fmtFechaDoc(g.fechaDoc) : '—'}
              </td>
              <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                <VerEvidencia evidenciaKey={g.evidenciaKey} />
              </td>
              <td className="px-3.5 py-2.5 text-zinc-300 whitespace-nowrap">
                {TIPO_API_A_UI[g.tipo] || g.tipo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VerEvidencia({ evidenciaKey }: { evidenciaKey: string }) {
  const [cargando, setCargando] = useState(false)

  async function abrir() {
    setCargando(true)
    try {
      const res = await fetch(`/api/gastos/evidencia?key=${encodeURIComponent(evidenciaKey)}`)
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank')
    } finally {
      setCargando(false)
    }
  }

  return (
    <button onClick={abrir} disabled={cargando} className="text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50">
      {cargando ? '...' : '🖼️ Ver'}
    </button>
  )
}
