'use client'
import { useState, useEffect, useRef } from 'react'
import InputMoneda from '@/components/InputMoneda'
import CiudadBuscador from '@/components/CiudadBuscador'
import GastoManual from '@/components/GastoManual'

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

// Backend usa valores sin tilde (TIPOS_VALIDOS en route.ts) por compatibilidad
// ASCII en CHECK constraint de BD — se mapea aquí en el límite UI↔API.

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
  const [borradorCiudad, setBorradorCiudad] = useState('')

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const [showManual, setShowManual] = useState(false)
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [tipos, setTipos] = useState<{id:string,label:string}[]>([])
  const [showTipos, setShowTipos] = useState(false)
  const [nuevoTipo, setNuevoTipo] = useState('')
  const camaraInputRef = useRef<HTMLInputElement>(null)
  if (triggerRef) (triggerRef as any).current = () => fileInputRef.current?.click()

  useEffect(() => { if (filtroRapido) setFiltro(filtroRapido) }, [filtroRapido])
  useEffect(() => {
    fetch('/api/gastos/tipos').then(r => r.json()).then(d => { if (d.tipos) setTipos(d.tipos) }).catch(() => {})
  }, [])
  useEffect(() => { cargarGastos() }, [filtro, empleadoFiltro, tipoFiltro, mes, anio])
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
      if (tipoFiltro) sp.set('tipo', tipoFiltro)
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
    setBorradorCiudad(data.datosIA?.ciudad || '')
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
    if (!borradorConcepto.trim() || !borradorValor || !borradorTipo || !borradorCiudad) return
    try {
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepto: borradorConcepto.trim(),
          valor: parseFloat(borradorValor),
          tipo: borradorTipo,
          ciudad: borradorCiudad.trim() || undefined,
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
    setBorradorCiudad('')
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
        <div className="flex items-center gap-3">
          <h1 className="text-white text-xl font-bold">🧾 Gastos</h1>
          <button onClick={() => setShowManual(true)} disabled={subiendo}
            className="w-7 h-7 rounded-full border border-zinc-700 hover:border-zinc-400 flex items-center justify-center text-zinc-500 hover:text-zinc-200 text-base transition-colors">+</button>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}
            className="rounded-lg px-2 py-1 text-zinc-300 outline-none"
            style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', fontSize:'0.8rem'}}>
            <option value="">Todas</option>
            {tipos.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
          </select>
          <button onClick={() => setShowTipos(true)}
            className="text-sm px-2.5 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
            style={{border:'1px solid rgba(255,255,255,0.08)'}}>⚙️</button>
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleArchivo(e.target.files[0]) }} />
          {showTipos && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{background:'rgba(0,0,0,0.6)'}} onClick={() => setShowTipos(false)}>
              <div className="rounded-2xl p-5 space-y-3 w-full max-w-sm" style={{background:'#0f1623', border:'1px solid rgba(255,255,255,0.12)'}} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-white text-sm font-bold">Tipos de gasto</p>
                  <button onClick={() => setShowTipos(false)} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
                </div>
                {tipos.map(t => (
                  <div key={t.id} className="flex items-center gap-2">
                    <input value={t.label} onChange={e => setTipos(prev => prev.map(x => x.id===t.id ? {...x, label: e.target.value} : x))}
                      style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',flex:1,fontSize:13,padding:'5px 8px'}} />
                    <button onClick={async () => {
                      await fetch('/api/gastos/tipos', {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:t.id, label:t.label})})
                      fetch('/api/gastos/tipos').then(r => r.json()).then(d => { if (d.tipos) setTipos(d.tipos) })
                    }} className="text-emerald-400 text-xs px-2 py-1.5 rounded-lg hover:bg-emerald-400/10 transition-colors font-bold">✓</button>
                    <button onClick={async () => {
                      const r = await fetch('/api/gastos/tipos', {method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:t.id})})
                      const d = await r.json()
                      if (d.error) alert(d.error)
                      else fetch('/api/gastos/tipos').then(r => r.json()).then(d => { if (d.tipos) setTipos(d.tipos) })
                    }} className="text-red-400 text-xs px-2 py-1.5 rounded-lg hover:bg-red-400/10 transition-colors">✕</button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
                  <input value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)}
                    placeholder="Nuevo tipo..." style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',flex:1,fontSize:13,padding:'5px 8px'}} />
                  <button onClick={async () => {
                    if (!nuevoTipo.trim()) return
                    await fetch('/api/gastos/tipos', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({label: nuevoTipo.trim()})})
                    setNuevoTipo('')
                    fetch('/api/gastos/tipos').then(r => r.json()).then(d => { if (d.tipos) setTipos(d.tipos) })
                  }} className="text-emerald-400 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors" style={{border:'1px solid rgba(52,211,153,0.30)'}}>+</button>
                </div>
              </div>
            </div>
          )}
          <GastoManual open={showManual} onClose={() => setShowManual(false)} onAdicionado={() => { setShowManual(false); cargarGastos() }} />
        </div>
      </div>

      {!isAdmin && !mes && (
        <div className="flex gap-2">
          {(['hoy','semana','mes'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={"flex-1 py-2 rounded-xl text-sm font-semibold transition-colors " + (filtro === f ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white')}>
              {f === 'hoy' ? 'Hoy' : f === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      )}

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
            className="w-full max-w-sm rounded-2xl p-5 space-y-4 overflow-y-auto"
            style={{ background: '#141c2e', border: '1px solid #1e2a3d', maxHeight: '90vh' }}>
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
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Ciudad</label>
              <CiudadBuscador value={borradorCiudad} onChange={setBorradorCiudad} />
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
                {tipos.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
              </select>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={cerrarPopup}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarAdicionGasto}
                disabled={!borradorConcepto.trim() || !borradorValor || !borradorTipo || !borradorCiudad}
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
              {['FECHA REG.','FECHA DOC.','CONCEPTO','TIPO','CIUDAD','VALOR','VER'].map(h => (
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
                <td style={{ ...tdG, color: '#94a3b8' }}>{g.tipo}</td>
                <td style={{ ...tdG, color: '#6b7280', fontSize: 11 }}>{(g as any).ciudad ? (g as any).ciudad.split('/').pop() : '—'}</td>
                <td style={{ ...tdG, color: '#34d399', fontWeight: 700, textAlign: 'right' }}>{fmt(Number(g.valor))}</td>
                <td style={{ ...tdG, textAlign: 'center' }}><VerEvidencia evidenciaKey={g.evidenciaKey} /></td>
              </tr>
            ))}
            <tr style={{ background: '#0d1220', borderTop: '1px solid #1e2a3d' }}>
              <td colSpan={5} style={{ ...tdG, color: '#6b7280', fontSize: 12 }}>Total · {gastos.length} registros</td>
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
