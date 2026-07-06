'use client'
import { useRef, useState } from 'react'
import InputMoneda from './InputMoneda'

const MEDIOS = ['BANCO','NEQUI','DAVIPLATA','EFECTIVO','TRANSFERENCIA','PSE']

interface Abono { id: string; valor: number; fecha: string; evidenciaKey?: string }
interface Props {
  egresoId: string
  abonosCount: number
  saldo: number
  onGuardado: (totalAbono: number, nuevoSaldo: number, count: number, medioPago: string, fechaPago: string) => void
}

export default function AbonoEgreso({ egresoId, abonosCount, saldo, onGuardado }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [openForm, setOpenForm] = useState(false)
  const [openList, setOpenList] = useState(false)
  const [abonos, setAbonos] = useState<Abono[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [valor, setValor] = useState('')
  const [fecha, setFecha] = useState('')
  const [medioPago, setMedioPago] = useState('')
  const [evidenciaKey, setEvidenciaKey] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function cerrarForm() { setOpenForm(false); setValor(''); setFecha(''); setMedioPago(''); setEvidenciaKey(''); setError('') }

  async function abrirLista() {
    setLoadingList(true); setOpenList(true)
    const res = await fetch(`/api/egresos/abono?egresoId=${egresoId}`)
    const d = await res.json()
    setAbonos(d.abonos || [])
    setLoadingList(false)
  }

  async function handleArchivo(file: File) {
    setSubiendo(true); setError('')
    try {
      const archivoBase64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.onerror = rej; r.readAsDataURL(file)
      })
      const res = await fetch('/api/gastos/voucher', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoBase64, mimeType: file.type, gastoId: crypto.randomUUID() }),
      })
      const data = await res.json()
      setEvidenciaKey(data.key || '')
      if (data.datosIA?.valor) setValor(String(Math.round(data.datosIA.valor)))
      if (data.datosIA?.fecha) {
        let f = data.datosIA.fecha
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(f)) { const [d,m,y] = f.split('/'); f = `${y}-${m}-${d}` }
        setFecha(f)
      }
      if (data.datosIA?.medioPago) setMedioPago(data.datosIA.medioPago)
      setOpenForm(true)
    } catch { setError('No se pudo procesar el archivo.') }
    finally { setSubiendo(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  async function confirmar() {
    if (!valor) return
    setGuardando(true)
    try {
      const res = await fetch('/api/egresos/abono', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ egresoId, valor: parseFloat(valor), fecha, evidenciaKey, medioPago }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      cerrarForm()
      onGuardado(d.abonoPago, d.saldo, d.countAbonos, medioPago, fecha)
    } catch { setError('Error al guardar.') }
    finally { setGuardando(false) }
  }

  async function verComprobante(key: string) {
    const res = await fetch(`/api/egresos/url?key=${encodeURIComponent(key)}`)
    const d = await res.json()
    if (d.url) window.open(d.url, '_blank')
  }

  const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO')
  const fmtF = (f: string) => { if (!f) return ''; const d = f.slice(0,10); return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'2-digit' }) }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleArchivo(e.target.files[0]) }} />

      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {abonosCount > 0 && (
          <button onClick={abrirLista}
            style={{ background:'rgba(52,211,153,0.15)', border:'1px solid rgba(52,211,153,0.3)', borderRadius:8,
              color:'#34d399', fontWeight:700, fontSize:13, padding:'2px 8px', cursor:'pointer', whiteSpace:'nowrap' }}>
            [{abonosCount}]📎
          </button>
        )}
        {saldo > 0 && (
          <button onClick={() => fileInputRef.current?.click()} disabled={subiendo}
            title="Agregar abono"
            style={{ background:'none', border:'1px solid #334155', borderRadius:8,
              color: subiendo ? '#64748b' : '#94a3b8', fontSize:16, padding:'2px 6px', cursor:'pointer', lineHeight:1 }}>
            {subiendo ? '⏳' : '📎'}
          </button>
        )}
        {abonosCount === 0 && saldo <= 0 && (
          <span style={{ color:'#34d399', fontSize:12, fontWeight:700 }}>OK</span>
        )}
      </div>

      {/* Lista de abonos */}
      {openList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background:'rgba(0,0,0,0.6)' }}
          onClick={() => setOpenList(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl p-5 space-y-3"
            style={{ background:'#141c2e', border:'1px solid #1e2a3d' }}>
            <h3 className="text-white font-semibold text-sm">Comprobantes ({abonosCount})</h3>
            {loadingList && <p className="text-zinc-400 text-xs">Cargando...</p>}
            {abonos.map((a, i) => (
              <div key={a.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-zinc-800">
                <span className="text-zinc-400 text-sm">#{i+1}</span>
                <span className="text-white text-sm font-semibold">{fmt(a.valor)}</span>
                <span className="text-zinc-400 text-sm">{fmtF(a.fecha)}</span>
                {a.evidenciaKey
                  ? <button onClick={() => verComprobante(a.evidenciaKey!)}
                      className="text-blue-400 text-sm underline">ver</button>
                  : <span className="text-zinc-500 text-sm">sin archivo</span>}
              </div>
            ))}
            <button onClick={() => setOpenList(false)}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold py-2 rounded-xl">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Form nuevo abono */}
      {openForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background:'rgba(0,0,0,0.6)' }}
          onClick={cerrarForm}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-5 space-y-4"
            style={{ background:'#141c2e', border:'1px solid #1e2a3d' }}>
            <h3 className="text-white font-semibold text-sm">Abono #{abonosCount + 1}</h3>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Valor</label>
              <InputMoneda value={valor} onChange={setValor}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Medio de pago</label>
              <select value={medioPago} onChange={e => setMedioPago(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500">
                <option value="">— Selecciona</option>
                {MEDIOS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2">
              <button onClick={cerrarForm} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl">Cancelar</button>
              <button onClick={confirmar} disabled={!valor || guardando}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
