'use client'
import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import ModuloGastos from '@/components/ModuloGastos'
import AbonoEgreso from '@/components/AbonoEgreso'
import AdjuntarEgreso from '@/components/AdjuntarEgreso'

// CATEGORIAS ahora es dinámico — se carga desde /api/egresos/categorias
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
  return { id: null as string | null, fecha: hoy, concepto: '', valor: '', retencion: '', abonoPago: '', descuento: '', saldo: '', fechaPago: '', medioPago: '', estado: 'pendiente', autorizado: false, categoria, evidenciaKey: '', abonosCount: 0, esNueva: true }
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


function Tabla({ cat, mes, anio, scrollRefs, onCatUpdate }: { cat: { id:string; key: string; label: string; emoji: string }; mes: number; anio: number; scrollRefs: React.MutableRefObject<HTMLDivElement[]>; onCatUpdate?: (id:string, label:string, emoji:string) => void }) {
  const [editandoTitulo, setEditandoTitulo] = React.useState(false)
  const [nuevoLabel, setNuevoLabel] = React.useState(cat.label)
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
      estado: e.estado, autorizado: e.autorizado, categoria: cat.key, evidenciaKey: e.evidenciaKey || '', abonosCount: e._count?.abonos ?? 0, esNueva: false,
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
        updated.saldo = String(Math.max(0, v - r - a - d))
      }
      return updated
    }))
  }

  function onBlurFila(idx: number) {
    const f = filas[idx]
    const tieneContenido = !!(f.concepto || f.valor)
    if (tieneContenido) {
      guardar(idx)
    } else if (f.esNueva) {
      // Fila nueva sin concepto ni valor (fecha no cuenta) — anular
      setTimeout(() => setFilas(prev => prev.filter((_, i) => i !== idx)), 150)
    }
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
      {/* Título — doble clic para editar */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl" style={{border:'1px solid rgba(255,255,255,0.10)'}}>
        <span>{cat.emoji}</span>
        {editandoTitulo
          ? <input autoFocus value={nuevoLabel} onChange={e => setNuevoLabel(e.target.value)}
              onBlur={() => { setEditandoTitulo(false); if (nuevoLabel.trim() && nuevoLabel !== cat.label) onCatUpdate?.(cat.id, nuevoLabel.trim(), cat.emoji) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setNuevoLabel(cat.label); setEditandoTitulo(false) } }}
              style={{ background:'transparent', border:'none', outline:'none', fontSize:14, fontWeight:700, color:'white', width: Math.max(80, nuevoLabel.length * 9) }} />
          : <h2 className="text-sm font-bold text-white cursor-pointer" onDoubleClick={() => setEditandoTitulo(true)} title="Doble clic para editar">{nuevoLabel}</h2>
        }
      </div>
      <div className="rounded-2xl border border-zinc-800 overflow-hidden" style={{ background: '#0f1623' }}>
        <div className="overflow-x-auto" ref={el => {
            if (!el) return
            const refs = scrollRefs.current
            if (!refs.includes(el)) refs.push(el)
            el.onscroll = () => refs.forEach(r => { if (r !== el) r.scrollLeft = el.scrollLeft })
          }}>
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
                    <td style={{ ...tdStyle, borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {isEdit ? <input type="date" value={f.fecha} onChange={e => set(idx,'fecha',e.target.value)} onBlur={() => onBlurFila(idx)} style={{ background:'transparent',color:'white',border:'none',outline:'none',width:110,fontSize:13 }} /> : fmtFecha(f.fecha)}
                    </td>
                    <td style={{ ...tdStyle, minWidth: 200, borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        {f.evidenciaKey && !isEdit && (
                          <button onClick={async () => { const r = await fetch(`/api/egresos/url?key=${encodeURIComponent(f.evidenciaKey)}`); const d = await r.json(); if(d.url) window.open(d.url, '_blank') }} title="Ver factura"
                            style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, lineHeight:1, padding:'0 2px', opacity:0.7, flexShrink:0 }}>📎</button>
                        )}
                        {isEdit ? <input value={f.concepto} onChange={e => set(idx,'concepto',e.target.value.toUpperCase())} onBlur={() => guardar(idx)} autoFocus={f.esNueva} style={{ background:'transparent',color:'white',border:'none',outline:'none',width:'100%',fontSize:13 }} placeholder="Concepto..." /> : <span style={{ fontWeight: pagado ? 700 : 500 }}>{f.concepto}</span>}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {isEdit ? <NumInput value={f.valor} onChange={v => set(idx,'valor',v)} onBlur={() => onBlurFila(idx)} /> : f.valor ? fmt(f.valor) : ''}
                    </td>
                    <td style={{ ...tdStyle, color: parseInt(f.retencion) > 0 ? '#f97316' : 'white', borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {isEdit ? <NumInput value={f.retencion} onChange={v => set(idx,'retencion',v)} onBlur={() => onBlurFila(idx)} width={80} /> : parseInt(f.retencion) > 0 ? fmt(f.retencion) : ''}
                    </td>
                    <td style={{ ...tdStyle, borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {(isEdit && f.medioPago === 'EFECTIVO') ? <NumInput value={f.abonoPago} onChange={v => set(idx,'abonoPago',v)} onBlur={() => onBlurFila(idx)} /> : f.abonoPago ? fmt(f.abonoPago) : ''}
                    </td>
                    <td style={{ ...tdStyle, borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {isEdit ? <NumInput value={f.descuento} onChange={v => set(idx,'descuento',v)} onBlur={() => onBlurFila(idx)} width={80} /> : parseInt(f.descuento) > 0 ? fmt(f.descuento) : ''}
                    </td>
                    <td style={{ ...tdStyle, color: parseInt(f.saldo) > 0 ? '#f59e0b' : 'white', borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {parseInt(f.saldo) !== 0 ? fmt(f.saldo) : ''}
                    </td>
                    <td style={{ ...tdStyle, borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {isEdit ? <input type="date" value={f.fechaPago} onChange={e => set(idx,'fechaPago',e.target.value)} onBlur={() => onBlurFila(idx)} style={{ background:'transparent',color:'white',border:'none',outline:'none',width:110,fontSize:13 }} /> : fmtFecha(f.fechaPago)}
                    </td>
                    <td style={{ ...tdStyle, color: '#a78bfa', borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      <select value={f.medioPago} onChange={e => { set(idx,'medioPago',e.target.value); if(f.id) fetch('/api/egresos',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:f.id,medioPago:e.target.value})}) }} className={f.medioPago ? 'select-active' : ''} style={{ background:'rgba(255,255,255,0.06)',color:'#a78bfa',border:'1px solid rgba(255,255,255,0.10)',outline:'none',fontSize:12,borderRadius:6,padding:'2px 4px',cursor:'pointer' }}><option value="">—</option>{MEDIOS.map(m => <option key={m} value={m} style={{background:'#1e2030'}}>{m}</option>)}</select>
                    </td>
                    <td style={tdStyle}>
                      {f.id && (
                        <AbonoEgreso
                          egresoId={f.id}
                          abonosCount={f.abonosCount ?? 0}
                          saldo={parseInt(f.saldo) || 0}
                          onGuardado={(totalAbono, nuevoSaldo, count, medio, fechaPago) => {
                            setFilas(prev => prev.map((fi, i) => i !== idx ? fi : {
                              ...fi,
                              abonoPago: String(Math.round(totalAbono)),
                              saldo: String(Math.round(nuevoSaldo)),
                              abonosCount: count,
                              estado: nuevoSaldo <= 0 ? 'ok' : 'pendiente',
                              ...(medio ? { medioPago: medio } : {}),
                              ...(fechaPago ? { fechaPago } : {}),
                            }))
                          }}
                        />
                      )}
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
                <td style={{ ...tdStyle, borderLeft: 'none' }}>
                  <button onClick={() => setFilas(p => [...p, filaVacia(cat.key)])}
                    className="flex items-center justify-center w-5 h-5 rounded-full border border-zinc-700 hover:border-zinc-400 text-zinc-500 hover:text-zinc-200 text-sm transition-colors">+</button>
                </td>
                <td style={{ ...tdStyle, borderLeft: 'none' }} />
                <td style={{ ...tdStyle, fontWeight:700, borderLeft: 'none' }}>{fmt(tot('valor'))}</td>
                <td style={{ ...tdStyle, fontWeight:700, borderLeft: 'none', color:'#f97316' }}>{tot('retencion') > 0 ? fmt(tot('retencion')) : ''}</td>
                <td style={{ ...tdStyle, fontWeight:700, borderLeft: 'none' }}>{tot('abonoPago') > 0 ? fmt(tot('abonoPago')) : ''}</td>
                <td style={{ ...tdStyle, fontWeight:700, borderLeft: 'none' }}>{tot('descuento') > 0 ? fmt(tot('descuento')) : ''}</td>
                <td style={{ ...tdStyle, fontWeight:700, borderLeft: 'none', color:'#f59e0b' }}>{fmt(tot('saldo'))}</td>
                <td colSpan={4} style={{ borderLeft: 'none' }} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  )
}

function CalendarioPopup({ mes, anio, onChange, onClose, onFiltroRapido }: { mes: number; anio: number; onChange: (m: number, a: number) => void; onClose: () => void; onFiltroRapido?: (f: 'hoy'|'semana') => void }) {
  const [m, setM] = useState(mes)
  const [a, setA] = useState(anio)
  return (
    <div className="absolute right-0 top-10 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-xl space-y-3" style={{ minWidth: 220 }}>
      {onFiltroRapido && (
        <div className="flex gap-2 pb-1 border-b border-zinc-800">
          <button onClick={() => { onFiltroRapido('hoy'); onClose() }}
            className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-xl transition-colors">
            Hoy
          </button>
          <button onClick={() => { onFiltroRapido('semana'); onClose() }}
            className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-xl transition-colors">
            Esta semana
          </button>
        </div>
      )}
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
  const [filtroGastos, setFiltroGastos] = useState<'hoy'|'semana'|'mes'>('mes')
  const [reloadKey, setReloadKey] = useState(0)
  const [totalGeneral, setTotalGeneral] = useState<{total:number,pagado:number,pendiente:number}|null>(null)
  const [categorias, setCategorias] = useState<{id:string,key:string,label:string,emoji:string}[]>([])
  const [showCategorias, setShowCategorias] = useState(false)
  const [nuevaCat, setNuevaCat] = useState({ label: '', emoji: '📋' })

  useEffect(() => {
    fetch('/api/egresos/categorias').then(r => r.json()).then(d => {
      if (d.categorias) setCategorias(d.categorias)
    }).catch(() => {})
  }, [reloadKey])
  const scrollRefs = useRef<HTMLDivElement[]>([])

  useEffect(() => {
    fetch(`/api/egresos?mes=${mes}&anio=${anio}&totalOnly=1`)
      .then(r => r.json())
      .then(d => { if (d.total !== undefined) setTotalGeneral({ total: d.total, pagado: d.pagado, pendiente: d.pendiente }) })
      .catch(() => {})
  }, [mes, anio, reloadKey])
  const triggerGastos = useRef<(() => void) | null>(null)
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
      <div className="flex items-stretch gap-2 px-1">
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 tab-pills rounded-xl p-1 w-full h-full">
            <button onClick={() => setTab('egresos')} className={`flex-1 py-1.5 text-sm font-semibold transition-colors rounded-lg ${tab === 'egresos' ? 'tab-active' : 'text-white hover:text-white'}`}>Egresos</button>
            <button onClick={() => setTab('gastos')} className={`flex-1 py-1.5 text-sm font-semibold transition-colors rounded-lg ${tab === 'gastos' ? 'tab-active' : 'text-white hover:text-white'}`}>Gastos</button>
          </div>
        </div>
        <div className="flex items-stretch gap-2 flex-shrink-0">
          {tab === 'egresos' && (
            <div className="flex-shrink-0 flex">
              <AdjuntarEgreso mes={mes} anio={anio} onAdicionado={() => setReloadKey(k => k+1)} />
            </div>
          )}
          {tab === 'gastos' && (
            <button onClick={() => triggerGastos.current?.()}
              className="flex items-center justify-center transition-colors h-full flex-shrink-0"
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:22, padding:'0 4px' }}>
              📎
            </button>
          )}
          <div className="relative flex-shrink-0 flex" ref={calRef}>
            <button onClick={() => setShowCal(s => !s)}
              className="flex items-center justify-center bg-zinc-800 border border-zinc-700 text-white text-lg font-semibold px-3 rounded-xl hover:bg-zinc-700 transition-colors flex-1">
              📅
            </button>
            {showCal && <CalendarioPopup mes={mes} anio={anio} onChange={(m,a) => { setMes(m); setAnio(a); setFiltroGastos('mes') }} onClose={() => setShowCal(false)} onFiltroRapido={(f) => setFiltroGastos(f)} />}
          </div>
        </div>
      </div>
      {tab === 'egresos'
        ? <div className="space-y-4">
            {totalGeneral !== null && (
              <div className="flex justify-between px-4 py-2 mb-3 rounded-xl" style={{border:'1px solid rgba(255,255,255,0.10)'}}>
                <div className="flex flex-col items-center">
                  <span className="text-zinc-400 text-xs">Total</span>
                  <span className="text-white text-sm font-bold">{fmt(totalGeneral.total)}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-zinc-400 text-xs">Pagado</span>
                  <span className="text-emerald-400 text-sm font-bold">{totalGeneral.pagado > 0 ? fmt(totalGeneral.pagado) : '—'}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-zinc-400 text-xs">Pendiente</span>
                  <span className={`text-sm font-bold ${totalGeneral.pendiente > 0 ? 'text-red-400' : 'text-zinc-500'}`}>{fmt(totalGeneral.pendiente)}</span>
                </div>
              </div>
            )}
            {categorias.map(cat => <Tabla key={`${cat.key}-${reloadKey}`} cat={cat} mes={mes} anio={anio} scrollRefs={scrollRefs} onCatUpdate={(id, label, emoji) => {
              fetch('/api/egresos/categorias', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, label, emoji}) })
                .then(() => setReloadKey(k => k+1))
            }} />)}
            {/* Botón gestión de categorías — solo admin */}
            {isAdmin && <button onClick={() => setShowCategorias(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-zinc-500 hover:text-zinc-200 text-xs transition-colors"
              style={{border:'1px solid rgba(255,255,255,0.08)'}}>
              ⚙️ <span>Categorías</span>
            </button>}

            {/* Popup gestión categorías */}
            {showCategorias && (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{background:'rgba(0,0,0,0.6)'}} onClick={() => setShowCategorias(false)}>
                <div className="rounded-2xl p-5 space-y-3 w-full max-w-sm" style={{background:'#0f1623', border:'1px solid rgba(255,255,255,0.12)'}} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-white text-sm font-bold">Categorías de egresos</p>
                    <button onClick={() => setShowCategorias(false)} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
                  </div>
                  {categorias.map(cat => (
                    <div key={cat.id} className="flex items-center gap-2">
                      <input value={cat.emoji} onChange={e => setCategorias(prev => prev.map(c => c.id===cat.id ? {...c, emoji: e.target.value} : c))}
                        style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',width:40,textAlign:'center',fontSize:16,padding:'4px'}} />
                      <input value={cat.label} onChange={e => setCategorias(prev => prev.map(c => c.id===cat.id ? {...c, label: e.target.value} : c))}
                        style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',flex:1,fontSize:13,padding:'5px 8px'}} />
                      <button onClick={async () => {
                        await fetch('/api/egresos/categorias', {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:cat.id, label:cat.label, emoji:cat.emoji})})
                        setReloadKey(k => k+1)
                      }} className="text-emerald-400 text-xs px-2 py-1.5 rounded-lg hover:bg-emerald-400/10 transition-colors font-bold">✓</button>
                      <button onClick={async () => {
                        const r = await fetch('/api/egresos/categorias', {method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:cat.id})})
                        const d = await r.json()
                        if (d.error) alert(d.error)
                        else { setReloadKey(k => k+1); setShowCategorias(false) }
                      }} className="text-red-400 text-xs px-2 py-1.5 rounded-lg hover:bg-red-400/10 transition-colors">✕</button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
                    <input value={nuevaCat.emoji} onChange={e => setNuevaCat(p => ({...p, emoji: e.target.value}))}
                      style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',width:40,textAlign:'center',fontSize:16,padding:'4px'}} />
                    <input value={nuevaCat.label} onChange={e => setNuevaCat(p => ({...p, label: e.target.value}))}
                      placeholder="Nueva categoría..." style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',flex:1,fontSize:13,padding:'5px 8px'}} />
                    <button onClick={async () => {
                      if (!nuevaCat.label.trim()) return
                      await fetch('/api/egresos/categorias', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(nuevaCat)})
                      setNuevaCat({ label: '', emoji: '📋' })
                      setReloadKey(k => k+1)
                    }} className="text-emerald-400 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors" style={{border:'1px solid rgba(52,211,153,0.30)'}}>+</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        : <ModuloGastos isAdmin={isAdmin} hideButton triggerRef={triggerGastos} mes={filtroGastos==='mes' ? mes : undefined} anio={filtroGastos==='mes' ? anio : undefined} filtroRapido={filtroGastos !== 'mes' ? filtroGastos : undefined} />
      }
    </div>
  )
}
