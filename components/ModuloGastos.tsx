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
export default function ModuloGastos({ isAdmin, hideButton = false, triggerRef, mes, anio, filtroRapido }: { isAdmin: boolean, hideButton?: boolean, triggerRef?: React.RefObject<(() => void) | null>, mes?: number, anio?: number, filtroRapido?: 'hoy'|'semana' }) {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<'hoy'|'semana'|'mes'>(filtroRapido ?? 'semana')
  const [empleadoFiltro, setEmpleadoFiltro] = useState('')
  const [empleados, setEmpleados] = useState<{id:string,nombre:string}[]>([])

  const [subiendo, setSubiendo] = useState(false)
  const [popupAbierto, setPopupAbierto] = useState(false)
  const [evidenciaKey, setEvidenciaKey] = useState('')
  const [datosIA, setDatosIA] = useState<DatosIAGasto | null>(null)
  const [borradorConcepto, setBorradorConcepto] = useState('')
  const [borradorValor, setBorradorValor] = useState('')
  const [borradorFechaDoc, setBorradorFechaDoc] = useState('')
  const [borradorTipo, setBorradorTipo] = useState('')

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const camaraInputRef = useRef<HTMLInputElement>(null)
  if (triggerRef) (triggerRef as any).current = () => fileInputRef.current?.click()

  useEffect(() => { if (filtroRapido) setFiltro(filtroRapido) }, [filtroRapido])
  useEffect(() => { cargarGastos() }, [filtro, empleadoFiltro, mes, anio])
  useEffect(() => {
    if (isAdmin) {
      fetch('/api/empleados?rol=vendedor&activo=true').then(r=>r.json()).then(d=>{
        if(Array.isArray(d?.empleados)) setEmpleados(d.empleados)
        else if(Array.isArray(d)) setEmpleados(d)
      }).catch(()=>{})
    }
  }, [isAdmin])

  async function cargarGastos() {
    setLoading(true)
    try {
      const sp = new URLSearchParams()
      if (filtro !== 'mes' && !mes) sp.set('filtro', filtro)
      else if (mes && anio) { sp.set('mes', String(mes)); sp.set('anio', String(anio)) }
      if (empleadoFiltro) sp.set('empleadoId', empleadoFiltro)
      const res = await fetch('/api/gastos?' + sp.toString())
      const data = await res.json()
      setGastos(data.gastos || [])
    } finally {
      setLoading(false)
    }
  }


  async function comprimirImagen(base64: string, maxW = 1280, quality = 0.75): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(base64) // fallback sin comprimir
      img.src = base64
    })
  }

  async function handleArchivo(file: File) {
    setSubiendo(true)
    setError('')
    try {
      let archivoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      // Comprimir si es imagen (no PDF)
      if (!archivoBase64.startsWith('data:application/pdf')) {
        archivoBase64 = await comprimirImagen(archivoBase64)
      }
      const gastoIdTemp = crypto.randomUUID()
      const res = await fetch('/api/gastos/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoBase64, mimeType: file.type || (archivoBase64.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg'), gastoId: gastoIdTemp }),
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
      setError('Error: ' + (e?.message || 'No se pudo procesar el archivo'))
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

const thG: React.CSSProperties = {
  padding: '8px 10px', fontSize: 13, fontWeight: 500, color: 'white',
  whiteSpace: 'nowrap', overflow: 'hidden', borderRight: '1px solid #1e2a3d',
  background: '#0d1220', userSelect: 'none',
}
const tdG: React.CSSProperties = {
  padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #131c2e',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

function TablaGasto({ gastos }: { gastos: Gasto[] }) {
  const total = gastos.reduce((s, g) => s + Number(g.valor), 0)
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 600, background: '#0a0f1a' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e2a3d' }}>
              {['FECHA REG.','FECHA DOC.','CONCEPTO','TIPO','VALOR','VER'].map(h => (
                <th key={h} style={{ ...thG, textAlign: h === 'VALOR' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gastos.map(g => (
              <tr key={g.id} style={{ background: '#0a0f1a' }}>
                <td style={{ ...tdG, color: '#94a3b8' }}>{fmtFechaAgregacion(g.fechaAgregacion)}</td>
                <td style={{ ...tdG, color: '#6b7280' }}>{g.fechaDoc ? fmtFechaDoc(g.fechaDoc) : '—'}</td>
                <td style={{ ...tdG, color: 'white', fontWeight: 500, maxWidth: 200 }}>{g.concepto}</td>
                <td style={{ ...tdG, color: '#94a3b8' }}>{TIPO_API_A_UI[g.tipo] || g.tipo}</td>
                <td style={{ ...tdG, color: '#34d399', fontWeight: 700, textAlign: 'right' }}>{fmt(Number(g.valor))}</td>
                <td style={{ ...tdG, textAlign: 'center' }}><VerEvidencia evidenciaKey={g.evidenciaKey} /></td>
              </tr>
            ))}
            <tr style={{ background: '#0d1220', borderTop: '1px solid #1e2a3d' }}>
              <td colSpan={4} style={{ ...tdG, color: '#6b7280', fontSize: 12 }}>Total · {gastos.length} registros</td>
              <td style={{ ...tdG, color: '#fbbf24', fontWeight: 700, textAlign: 'right' }}>{fmt(total)}</td>
              <td style={tdG}/>
            </tr>
          </tbody>
        </table>
      </div>
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
