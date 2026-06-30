'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import ModuloGastos from '@/components/ModuloGastos'

const CATEGORIAS = [
  { key: 'nomina',        label: '👥 Nómina' },
  { key: 'gastos_fijos',  label: '🏢 Gastos Fijos' },
  { key: 'gastos_varios', label: '📦 Gastos Varios' },
  { key: 'proveedores',   label: '🤝 Proveedores' },
]
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MEDIOS = ['BANCO','NEQUI','DAVIPLATA','EFECTIVO','TRANSFERENCIA','PSE']

const thStyle: React.CSSProperties = { padding: '10px 10px', fontSize: 12, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d', background: '#0a1020' }
const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 13, fontWeight: 500, color: 'white', borderBottom: '1px solid #1e2a3d', whiteSpace: 'nowrap' }

function fmt(n: number | string) {
  const v = typeof n === 'string' ? parseFloat(n.replace(/\./g,'').replace(/[^0-9-]/g,'')) : n
  if (!v || isNaN(v)) return '$0'
  return '$' + Math.abs(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function formatCOP(raw: string): string {
  const n = parseInt(raw.replace(/\./g,'').replace(/[^0-9]/g,'') || '0')
  return isNaN(n) ? '' : new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}
function parseCOP(val: string): string { return val.replace(/\./g,'').replace(/[^0-9]/g,'') }
function fmtFecha(f: string | null | undefined) {
  if (!f) return ''
  return new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'2-digit' })
}
function filaVacia(categoria: string) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return { id: null as string | null, fecha: hoy, concepto: '', valor: '', retencion: '', abonoPago: '', descuento: '', saldo: '', fechaPago: '', medioPago: '', estado: 'pendiente', autorizado: false, categoria, esNueva: true }
}
type Fila = ReturnType<typeof filaVacia>

function NumInput({ value, onChange, onBlur, width = 90 }: { value: string; onChange: (v: string) => void; onBlur?: () => void; width?: number }) {
  const [display, setDisplay] = useState(value ? formatCOP(value) : '')
  useEffect(() => { setDisplay(value ? formatCOP(value) : '') }, [value])
  return (
    <input
      value={display}
      onChange={e => { const raw = parseCOP(e.target.value); setDisplay(formatCOP(raw)); onChange(raw) }}
      onBlur={onBlur}
      style={{ background:'transparent', color:'inherit', border:'none', outline:'none', width, fontSize:13 }}
    />
  )
}

function Tabla({ cat, mes, anio }: { cat: { key: string; label: string }; mes: number; anio: number }) {
  const [filas, setFilas] = useState<Fila[]>([])
  const [editando, setEditando] = useState<Record<number, boolean>>({})
  const [saved, setSaved] = useState<Record<number, boolean>>({})

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/egresos?categoria=${cat.key}&mes=${mes}&anio=${anio}`)
    const d = await res.json()
    const rows: Fila[] = (d.egresos || []).map((e: any) => ({
      id: e.id, fecha: e.fecha?.split('T')[0] || '', concepto: e.concepto,
      valor: String(Math.round(parseFloat(e.valor)||0)),
      retencion: String(Math.round(parseFloat(e.retencion)||0)),
      abonoPago: String(Math.round(parseFloat(e.abonoPago)||0)),
      descuento: String(Math.round(parseFloat(e.descuento)||0)),
      saldo: String(Math.round(parseFloat(e.saldo)||0)),
      fechaPago: e.fechaPago?.split('T')[0] || '', medioPago: e.medioPago || '',
      estado: e.estado, autorizado: e.autorizado, categoria: cat.key, esNueva: false,
    }))
    setFilas(rows)
  }, [cat.key, mes, anio])

  useEffect(() => { cargar() }, [cargar])

  // beforeunload — guardar al cerrar/navegar
  useEffect(() => {
    const handler = () => {
      filasRef.current.forEach((f, idx) => {
        if ((f.concepto || f.valor) && (f.esNueva || editando[idx])) {
          const body = { ...f, categoria: cat.key }
          const url = '/api/egresos'
          const data = JSON.stringify(body)
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url + '?method=' + (f.id ? 'PATCH' : 'POST'), new Blob([data], { type: 'application/json' }))
          }
        }
      })
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [editando, cat.key])

  // Guardar filas pendientes al desmontar (navegación sin onBlur)
  const filasRef = useRef<Fila[]>([])
  useEffect(() => { filasRef.current = filas }, [filas])
  useEffect(() => {
    return () => {
      filasRef.current.forEach((f, idx) => {
        if ((f.concepto || f.valor) && (f.esNueva || editando[idx])) {
          const body = { ...f, categoria: cat.key }
          if (f.id) {
            fetch('/api/egresos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          } else {
            fetch('/api/egresos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          }
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set(idx: number, campo: string, valor: any) {
    setFilas(prev => prev.map((f, i) => {
      if (i !== idx) return f
      const updated = { ...f, [campo]: valor }
      // Recalcular saldo automáticamente
      const v = parseInt(campo === 'valor' ? valor : updated.valor) || 0
      const r = parseInt(campo === 'retencion' ? valor : updated.retencion) || 0
      const d = parseInt(campo === 'descuento' ? valor : updated.descuento) || 0
      const a = parseInt(campo === 'abonoPago' ? valor : updated.abonoPago) || 0
      if (['valor','retencion','descuento','abonoPago'].includes(campo)) {
        updated.saldo = String(Math.max(0, v - r - d - a))
      }
      return updated
    }))
  }

  function onBlurFila(idx: number) {
    // Guardar al salir de cualquier celda si hay concepto o valor
    const f = filas[idx]
    if (f.concepto || f.valor) guardar(idx)
  }

  async function guardar(idx: number) {
    const f = filas[idx]
    if (!f.concepto && !f.valor) return
    const body = { ...f, categoria: cat.key }
    try {
      if (f.id) {
        await fetch('/api/egresos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        const res = await fetch('/api/egresos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const d = await res.json()
        setFilas(prev => prev.map((fi, i) => i === idx ? { ...fi, id: d.egreso?.id, esNueva: false } : fi))
      }
      setSaved(p => ({ ...p, [idx]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [idx]: false })), 1500)
    } catch {}
    setEditando(p => ({ ...p, [idx]: false }))
  }

  async function toggle(idx: number, campo: 'estado' | 'autorizado') {
    const f = filas[idx]
    if (!f.id) return
    const nuevo = campo === 'estado' ? (f.estado === 'ok' ? 'pendiente' : 'ok') : !f.autorizado
    set(idx, campo, nuevo)
    await fetch('/api/egresos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id, [campo]: nuevo }) })
  }

  const tot = (campo: keyof Fila) => filas.filter(f => f.concepto || f.valor).reduce((s, f) => s + (parseInt(String(f[campo])) || 0), 0)
  const totalSaldo = tot('saldo')

  return (
    <div className="space-y-1">
      {/* Título + total saldo */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-white">{cat.label}</h2>
        <span className={`text-sm font-bold ${totalSaldo > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>{fmt(totalSaldo)}</span>
      </div>
      <div className="rounded-2xl border border-zinc-800 overflow-hidden" style={{ background: '#0f1623' }}>
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                {['FECHA','CONCEPTO','VALOR','RETENCIÓN','ABONO/PAGO','DESCUENTO','SALDO','FECHA PAGO','MEDIO PAGO','ESTADO','AUTORIZA'].map(h => (
                  <th key={h} style={{ ...thStyle, minWidth: h === 'CONCEPTO' ? 200 : undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, idx) => {
                const pagado = f.estado === 'ok'
                const isEdit = editando[idx] || f.esNueva
                const rowBg = f.autorizado ? 'rgba(34,197,94,0.12)' : pagado ? 'rgba(34,197,94,0.05)' : 'transparent'
                return (
                  <tr key={f.id || `n-${idx}`} style={{ background: saved[idx] ? 'rgba(34,197,94,0.15)' : rowBg, transition: 'background 0.3s' }}
                    onDoubleClick={() => !f.esNueva && setEditando(p => ({ ...p, [idx]: true }))}>
                    <td style={tdStyle}>
                      {isEdit ? <input type="date" value={f.fecha} onChange={e => set(idx,'fecha',e.target.value)} onBlur={() => onBlurFila(idx)} style={{ background:'transparent',color:'white',border:'none',outline:'none',width:110,fontSize:13 }} /> : fmtFecha(f.fecha)}
                    </td>
                    <td style={{ ...tdStyle, minWidth: 200 }}>
                      {isEdit ? <input value={f.concepto} onChange={e => set(idx,'concepto',e.target.value.toUpperCase())} onBlur={() => guardar(idx)} autoFocus={f.esNueva} style={{ background:'transparent',color:'white',border:'none',outline:'none',width:'100%',fontSize:13 }} placeholder="Concepto..." /> : <span style={{ fontWeight: pagado ? 700 : 500 }}>{f.concepto}</span>}
                    </td>
                    <td style={tdStyle}>
                      {isEdit ? <NumInput value={f.valor} onChange={v => set(idx,'valor',v)} onBlur={() => onBlurFila(idx)} /> : f.valor ? fmt(f.valor) : ''}
                    </td>
                    <td style={{ ...tdStyle, color: parseInt(f.retencion) > 0 ? '#f97316' : 'white' }}>
                      {isEdit ? <NumInput value={f.retencion} onChange={v => set(idx,'retencion',v)} onBlur={() => onBlurFila(idx)} width={80} /> : parseInt(f.retencion) > 0 ? fmt(f.retencion) : ''}
                    </td>
                    <td style={tdStyle}>
                      {isEdit ? <NumInput value={f.abonoPago} onChange={v => set(idx,'abonoPago',v)} onBlur={() => onBlurFila(idx)} /> : f.abonoPago ? fmt(f.abonoPago) : ''}
                    </td>
                    <td style={tdStyle}>
                      {isEdit ? <NumInput value={f.descuento} onChange={v => set(idx,'descuento',v)} onBlur={() => onBlurFila(idx)} width={80} /> : parseInt(f.descuento) > 0 ? fmt(f.descuento) : ''}
                    </td>
                    <td style={{ ...tdStyle, color: parseInt(f.saldo) > 0 ? '#f59e0b' : 'white' }}>
                      {isEdit ? <NumInput value={f.saldo} onChange={v => set(idx,'saldo',v)} onBlur={() => onBlurFila(idx)} width={80} /> : fmt(f.saldo)}
                    </td>
                    <td style={tdStyle}>
                      {isEdit ? <input type="date" value={f.fechaPago} onChange={e => set(idx,'fechaPago',e.target.value)} onBlur={() => onBlurFila(idx)} style={{ background:'transparent',color:'white',border:'none',outline:'none',width:110,fontSize:13 }} /> : fmtFecha(f.fechaPago)}
                    </td>
                    <td style={{ ...tdStyle, color: '#a78bfa' }}>
                      <select value={f.medioPago} onChange={e => { set(idx,'medioPago',e.target.value); if(f.id) fetch('/api/egresos',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:f.id,medioPago:e.target.value})}) }} style={{ background:'transparent',color:'#a78bfa',border:'none',outline:'none',fontSize:12,borderRadius:6,padding:'2px 2px',cursor:'pointer' }}><option value="">—</option>{MEDIOS.map(m => <option key={m} value={m} style={{background:'#1e2030'}}>{m}</option>)}</select>
                    </td>
                    <td style={tdStyle}>
                      {f.id && <button onClick={() => toggle(idx,'estado')} className={`text-xs font-bold px-2 py-0.5 rounded-md ${pagado ? 'text-emerald-400' : 'text-zinc-500'}`}>{pagado ? 'OK' : '—'}</button>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {f.id && (
                        <input type="checkbox" checked={f.autorizado} onChange={() => toggle(idx,'autorizado')}
                          style={{ width:16, height:16, cursor:'pointer', accentColor:'#3b82f6' }} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #1e2a3d', background: '#0a1020' }}>
                <td style={tdStyle} /><td style={tdStyle} />
                <td style={{ ...tdStyle, fontWeight:700 }}>{fmt(tot('valor'))}</td>
                <td style={{ ...tdStyle, fontWeight:700, color:'#f97316' }}>{tot('retencion') > 0 ? fmt(tot('retencion')) : ''}</td>
                <td style={{ ...tdStyle, fontWeight:700 }}>{fmt(tot('abonoPago'))}</td>
                <td style={{ ...tdStyle, fontWeight:700 }}>{tot('descuento') > 0 ? fmt(tot('descuento')) : '$0'}</td>
                <td style={{ ...tdStyle, fontWeight:700, color:'#f59e0b' }}>{fmt(tot('saldo'))}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
        <button onClick={() => setFilas(p => [...p, filaVacia(cat.key)])}
          className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-xs border-t border-zinc-800 transition-colors">
          + Agregar fila
        </button>
      </div>
    </div>
  )
}

function CalendarioPopup({ mes, anio, onChange, onClose }: { mes: number; anio: number; onChange: (m: number, a: number) => void; onClose: () => void }) {
  const [m, setM] = useState(mes)
  const [a, setA] = useState(anio)
  return (
    <div className="absolute right-0 top-10 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-xl space-y-3" style={{ minWidth: 220 }}>
      <div className="flex items-center justify-between gap-2">
        <select value={m} onChange={e => setM(+e.target.value)} className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2 py-1.5 flex-1">
          {MESES.map((ml, i) => <option key={i} value={i+1}>{ml}</option>)}
        </select>
        <select value={a} onChange={e => setA(+e.target.value)} className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2 py-1.5">
          {[2024,2025,2026,2027].map(yr => <option key={yr} value={yr}>{yr}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { onChange(m, a); onClose() }} className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-xl">Aplicar</button>
        <button onClick={onClose} className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-semibold px-3 py-2 rounded-xl">✕</button>
      </div>
    </div>
  )
}

export default function EgresosPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const isAdmin = user?.role === 'empresa' || user?.role === 'supervisor'

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [showCal, setShowCal] = useState(false)
  const calRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'egresos' | 'gastos'>('egresos')

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setShowCal(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 tab-pills rounded-xl p-1">
            <button onClick={() => setTab('egresos')} className={`px-4 py-1.5 text-sm font-semibold transition-colors rounded-lg ${tab === 'egresos' ? 'tab-active' : 'text-white hover:text-white'}`}>Egresos</button>
            <button onClick={() => setTab('gastos')} className={`px-4 py-1.5 text-sm font-semibold transition-colors rounded-lg ${tab === 'gastos' ? 'tab-active' : 'text-white hover:text-white'}`}>Gastos</button>
          </div>
        </div>
        {tab === 'egresos' && (
          <div className="relative" ref={calRef}>
            <button onClick={() => setShowCal(s => !s)}
              className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 text-white text-xs font-semibold px-3 py-2 rounded-xl hover:bg-zinc-700 transition-colors">
              📅 {MESES[mes-1].slice(0,3)} {anio}
            </button>
            {showCal && <CalendarioPopup mes={mes} anio={anio} onChange={(m,a) => { setMes(m); setAnio(a) }} onClose={() => setShowCal(false)} />}
          </div>
        )}
      </div>
      {tab === 'egresos'
        ? CATEGORIAS.map(cat => <Tabla key={cat.key} cat={cat} mes={mes} anio={anio} />)
        : <ModuloGastos isAdmin={isAdmin} />}
    </div>
  )
}
