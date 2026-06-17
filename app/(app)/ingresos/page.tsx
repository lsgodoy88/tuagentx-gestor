'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const TABS = [
  { key: 'efectivo', label: '💵 Efectivo' },
  { key: 'bancos',   label: '🏦 Bancos'   },
  { key: 'otros',    label: '📦 Otros'    },
]

const FILAS_DEFAULT = 7

interface Fila { id?: string; concepto: string; ingreso: string; egreso: string; categoria: string; relacionTexto: string; esNueva?: boolean }
interface Categoria { id: string; tipo: string; nombre: string }

function filaVacia(esNueva = false): Fila { return { concepto: '', ingreso: '', egreso: '', categoria: '', relacionTexto: '', esNueva } }
function filasIniciales(): Fila[] { return Array.from({ length: FILAS_DEFAULT }, () => filaVacia()) }

function fmt(n: number) { return '$' + Math.abs(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function formatCOP(raw: string): string {
  const n = parseFloat(raw.replace(/\./g, '').replace(/[^0-9]/g, ''))
  if (!raw || isNaN(n) || n === 0) return ''
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}
function parseCOP(val: string): string { return val.replace(/\./g, '').replace(/[^0-9]/g, '') }
function parseNum(v: string) {
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
function fechaHoy() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) }
function fmtFecha(f: string) { return f ? new Date(f+'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '--/--/--' }

const thStyle: React.CSSProperties = { padding: '10px 10px', fontSize: 15, fontWeight: 600, color: 'white', whiteSpace: 'nowrap' }
const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 15, fontWeight: 500, color: 'white', borderBottom: '1px solid #1e2a3d' }

export default function SaldosPage() {
  const [tab, setTab] = useState('efectivo')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [filas, setFilas] = useState<Fila[]>(filasIniciales())
  const [saldoAnterior, setSaldoAnterior] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [showConfig, setShowConfig] = useState(false)
  const [nuevaCat, setNuevaCat] = useState({ tipo: 'ingreso', nombre: '' })
  const [filaSheet, setFilaSheet] = useState<number | null>(null)
  const [filasGuardadas, setFilasGuardadas] = useState<Set<number>>(new Set())
  const [filasEditando, setFilasEditando] = useState<Set<number>>(new Set())
  const [showPopDia, setShowPopDia] = useState(false)
  const [filaIntentada, setFilaIntentada] = useState<number | null>(null)
  const savingRef = useRef<Record<string, NodeJS.Timeout>>({})

  const hoy = fechaHoy()
  const esDiaActual = fechaDesde === hoy

  useEffect(() => {
    // Reset al cambiar tab
    setFilas(filasIniciales())
    setFilasGuardadas(new Set())
    setFilasEditando(new Set())
    setSaldoAnterior(0)
    setFechaDesde('')
    setFechaHasta('')
    fetch(`/api/saldos?tab=${tab}`).then(r => r.json()).then(d => {
      if (d.ultimaFecha) {
        const f = d.ultimaFecha // ya es 'YYYY-MM-DD' directo del API
        setFechaDesde(f); setFechaHasta(f)
        fetch(`/api/saldos?tab=${tab}&fecha=${f}&fechaHasta=${f}`)
          .then(r => r.json()).then(d2 => {
            setSaldoAnterior(Number(d2.saldoAnterior || 0))
            if (d2.movimientos?.length) {
              const rows: Fila[] = d2.movimientos.map((m: any) => ({
                id: m.id, concepto: m.concepto, ingreso: m.ingreso ? String(m.ingreso) : '',
                egreso: m.egreso ? String(m.egreso) : '', categoria: m.categoria || '', relacionTexto: m.relacionTexto || '', esNueva: false,
              }))
              while (rows.length < FILAS_DEFAULT) rows.push(filaVacia())
              setFilas(rows)
              setFilasGuardadas(new Set(rows.map((_,i) => i).filter(i => rows[i].concepto || rows[i].ingreso || rows[i].egreso)))
                          }
          })
      } else {
        setFechaDesde(hoy); setFechaHasta(hoy);       }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    fetch('/api/saldos/config').then(r => r.json()).then(d => setCategorias(d.categorias || []))
  }, [])

  const buscarFecha = useCallback(async (f: string) => {
    if (!f) return
    setBuscando(true)
    const res = await fetch(`/api/saldos?tab=${tab}&fecha=${f}&fechaHasta=${f}`)
    const d = await res.json()
    setSaldoAnterior(Number(d.saldoAnterior || 0))
    if (d.movimientos?.length) {
      const rows: Fila[] = d.movimientos.map((m: any) => ({
        id: m.id, concepto: m.concepto, ingreso: m.ingreso ? String(m.ingreso) : '',
        egreso: m.egreso ? String(m.egreso) : '', categoria: m.categoria || '', relacionTexto: m.relacionTexto || '',
        esNueva: false,
      }))
      while (rows.length < FILAS_DEFAULT) rows.push(filaVacia())
      setFilas(rows)
      // Con datos → guardadas (solo lectura). Vacías → editables directo
      const conDatos = new Set(rows.map((_,i) => i).filter(i => rows[i].concepto || rows[i].ingreso || rows[i].egreso))
      setFilasGuardadas(conDatos)
      setFilasEditando(new Set())
    } else {
      setFilas(filasIniciales()); setFilasGuardadas(new Set()); setFilasEditando(new Set())
    }
    setBuscando(false)
  }, [tab])

  function irAHoy() { setFechaDesde(hoy); setFechaHasta(hoy); buscarFecha(hoy); setShowPopDia(false); setFilaIntentada(null) }

  function editarDiaActual() {
    setShowPopDia(false)
    if (filaIntentada !== null) {
      setFilasEditando(prev => new Set([...prev, filaIntentada]))
      setFilaIntentada(null)
    }
  }

  function intentarEditar(i: number) {
    if (!esDiaActual && filasGuardadas.has(i)) {
      setFilaIntentada(i)
      setShowPopDia(true)
    } else {
      setFilasEditando(prev => new Set([...prev, i]))
    }
  }

  function autoguardar(i: number, fila: Fila) {
    if (!fechaDesde) return
    fetch('/api/saldos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: fila.esNueva ? undefined : fila.id,
        tab, fecha: fechaDesde, orden: i,
        concepto: fila.concepto, ingreso: fila.ingreso || null, egreso: fila.egreso || null,
        categoria: fila.categoria || null, relacionTexto: fila.relacionTexto || null,
      })
    }).then(r => r.json()).then(data => {
      if (fila.concepto && (fila.ingreso || fila.egreso)) {
        setFilas(prev => prev.map((f, idx) => idx === i ? { ...f, id: data.id || f.id, esNueva: false } : f))
        setFilasGuardadas(prev => new Set([...prev, i]))
        setFilasEditando(prev => { const n = new Set(prev); n.delete(i); return n })
      }
    })
  }

  function setFila(i: number, campo: keyof Fila, valor: string) {
    setFilas(prev => prev.map((f, idx) => idx === i ? { ...f, [campo]: valor } : f))
  }
  function onBlurFila(i: number) { autoguardar(i, filas[i]) }
  function esEditable(i: number) { return !filasGuardadas.has(i) || filasEditando.has(i) }

  function agregarFila() {
    setFilas(prev => [...prev, filaVacia(true)])
  }

  const subIng = filas.reduce((s, f) => s + parseNum(f.ingreso), 0)
  const subEgr = filas.reduce((s, f) => s + parseNum(f.egreso), 0)
  const total = saldoAnterior + subIng - subEgr

  return (
    <div className="space-y-3 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 style={{ color:'white', fontWeight:700, fontSize:18 }}>Saldos</h1>
        <button onClick={() => setShowConfig(v => !v)}
          style={{ width:36, height:36, borderRadius:10, border:'1px solid '+(showConfig?'rgba(59,130,246,0.5)':'#1e2a3d'), background:showConfig?'rgba(59,130,246,0.15)':'rgba(13,18,32,0.9)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:17 }}>&#9881;</button>
      </div>

      {/* Pop aviso día diferente */}
      {showPopDia && (
        <div onClick={() => setShowPopDia(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#0d1220', border:'1px solid #1e2a3d', borderRadius:16, padding:24, width:'100%', maxWidth:340 }}>
            <p style={{ color:'#f59e0b', fontWeight:700, fontSize:15, marginBottom:8 }}>⚠️ Día diferente al actual</p>
            <p style={{ color:'#9ca3af', fontSize:13, marginBottom:20 }}>El registro es del <span style={{ color:'white', fontWeight:600 }}>{fmtFecha(fechaDesde)}</span>. ¿Qué deseas hacer?</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={irAHoy}
                style={{ flex:1, background:'rgba(59,130,246,0.2)', color:'#93c5fd', border:'1px solid rgba(59,130,246,0.3)', borderRadius:10, padding:'10px 0', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                📅 Ir a Hoy
              </button>
              <button onClick={editarDiaActual}
                style={{ flex:1, background:'rgba(139,92,246,0.2)', color:'#c4b5fd', border:'1px solid rgba(139,92,246,0.3)', borderRadius:10, padding:'10px 0', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                ✏️ Editar {fmtFecha(fechaDesde)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal config */}
      {showConfig && (
        <div onClick={() => setShowConfig(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'60px 16px 16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#0d1220', border:'1px solid #1e2a3d', borderRadius:16, padding:20, width:'100%', maxWidth:420, maxHeight:'80vh', overflowY:'auto' }}>
            <p style={{ color:'white', fontWeight:700, fontSize:14, marginBottom:12 }}>Categorías</p>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <select value={nuevaCat.tipo} onChange={e => setNuevaCat(p => ({ ...p, tipo: e.target.value }))} style={{ background:'#141c2e', color:'white', border:'1px solid #1e2a3d', borderRadius:8, padding:'6px 8px', fontSize:13, outline:'none' }}>
                <option value="ingreso">Ingreso</option><option value="egreso">Egreso</option>
              </select>
              <input value={nuevaCat.nombre} onChange={e => setNuevaCat(p => ({ ...p, nombre: e.target.value.toUpperCase() }))} placeholder="Nombre" style={{ flex:1, background:'#141c2e', color:'white', border:'1px solid #1e2a3d', borderRadius:8, padding:'6px 10px', fontSize:13, outline:'none' }} />
              <button onClick={async () => { if (!nuevaCat.nombre.trim()) return; await fetch('/api/saldos/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(nuevaCat) }); const d = await fetch('/api/saldos/config').then(r => r.json()); setCategorias(d.categorias || []); setNuevaCat(p => ({ ...p, nombre: '' })) }} style={{ background:'rgba(59,130,246,0.2)', color:'#93c5fd', border:'1px solid rgba(59,130,246,0.3)', borderRadius:8, padding:'6px 14px', fontSize:15, cursor:'pointer', fontWeight:700 }}>+</button>
            </div>
            {(['ingreso','egreso'] as const).map(tipo => (
              <div key={tipo} style={{ marginBottom:10 }}>
                <p style={{ color:tipo==='ingreso'?'#34d399':'#f87171', fontSize:12, fontWeight:700, marginBottom:4 }}>{tipo==='ingreso'?'INGRESOS':'EGRESOS'}</p>
                {categorias.filter(c => c.tipo===tipo).map(cat => (
                  <div key={cat.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid #1e2a3d' }}>
                    <span style={{ color:'white', fontSize:13 }}>{cat.nombre}</span>
                    <button onClick={async () => { await fetch('/api/saldos/config', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: cat.id }) }); setCategorias(prev => prev.filter(c => c.id !== cat.id)) }} style={{ color:'#f87171', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>✕</button>
                  </div>
                ))}
                {!categorias.filter(c => c.tipo===tipo).length && <p style={{ color:'#374151', fontSize:12, fontStyle:'italic' }}>Sin categorías</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === t.key ? 'tab-active' : 'text-white hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Selector rango fechas */}
      <div className="flex items-center gap-1.5 w-full">
        <span className="md:hidden" style={{ color:'#9ca3af', fontSize:16, fontWeight:700, whiteSpace:'nowrap' }}>Mostrando:</span>
        <label style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', gap:4, background:'rgba(13,18,32,0.9)', border:'1px solid '+(esDiaActual?'#1e2a3d':'rgba(245,158,11,0.4)'), borderRadius:10, padding:'6px 8px', cursor:'pointer', flex:1 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color:'#60a5fa', flexShrink:0 }}><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/></svg>
          <span style={{ fontSize:15, color: esDiaActual?'white':'#f59e0b', whiteSpace:'nowrap', fontWeight:600 }}>{fmtFecha(fechaDesde)}</span>
          <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); buscarFecha(e.target.value) }} style={{ position:'absolute', opacity:0, width:'100%', height:'100%', top:0, left:0, cursor:'pointer' }} />
        </label>
        <span className="hidden md:block" style={{ color:'#6b7280', fontSize:16, fontWeight:700 }}>→</span>
        <label className="hidden md:flex" style={{ position:'relative', alignItems:'center', justifyContent:'center', gap:5, background:'rgba(13,18,32,0.9)', border:'1px solid #1e2a3d', borderRadius:10, padding:'9px 8px', cursor:'pointer', flex:1 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color:'#60a5fa', flexShrink:0 }}><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/></svg>
          <span style={{ fontSize:15, color:'white', whiteSpace:'nowrap', fontWeight:600 }}>{fmtFecha(fechaHasta)}</span>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ position:'absolute', opacity:0, width:'100%', height:'100%', top:0, left:0, cursor:'pointer' }} />
        </label>
        <button onClick={() => buscarFecha(fechaDesde)} disabled={buscando}
          className="hidden md:flex"
          style={{ width:40, height:40, borderRadius:10, border:'1px solid rgba(59,130,246,0.35)', background:'rgba(30,42,61,0.90)', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#93c5fd', flexShrink:0 }}>
          {buscando ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>}
        </button>
        <button onClick={irAHoy} style={{ padding:'6px 20px', borderRadius:10, border:'1px solid rgba(59,130,246,0.35)', background:'rgba(30,42,61,0.90)', cursor:'pointer', color:'#93c5fd', fontSize:16, fontWeight:700, flexShrink:0 }}>Hoy</button>
      </div>



      {/* Tabla */}
      <div style={{ position:'relative' }}>
      <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid #1e2a3d' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[380px]">
            <thead>
              <tr style={{ background:'#0d1220', borderBottom:'1px solid #1e2a3d' }}>
                <th style={{ ...thStyle, textAlign:'left', width:'60%' }}>Concepto</th>
                <th style={{ ...thStyle, textAlign:'right', color:'#34d399', width:'20%' }}>Ingresos</th>
                <th style={{ ...thStyle, textAlign:'right', color:'#f87171', width:'20%' }}>Egresos</th>
                <th className="hidden md:table-cell" style={{ ...thStyle, color:'#9ca3af' }}>Categoría</th>
                <th className="hidden md:table-cell" style={{ ...thStyle, color:'#9ca3af' }}>Relación</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background:'#0f1623', borderBottom:'1px solid #1e2a3d' }}>
                <td style={{ ...tdStyle, color:'#6b7280', fontStyle:'italic', textAlign:'right', textTransform:'uppercase', letterSpacing:'0.05em', fontSize:12 }}>Saldo anterior</td>
                <td style={{ ...tdStyle, textAlign:'right', color:'#34d399' }}>{saldoAnterior >= 0 ? fmt(saldoAnterior) : '—'}</td>
                <td style={{ ...tdStyle, textAlign:'right', color:'#f87171' }}>{saldoAnterior < 0 ? fmt(Math.abs(saldoAnterior)) : '—'}</td>
                <td className="hidden md:table-cell" style={{ ...tdStyle }}></td>
                <td className="hidden md:table-cell" style={{ ...tdStyle }}></td>
              </tr>

              {filas.map((fila, i) => (
                <tr key={i} style={{ background: fila.esNueva ? 'rgba(139,92,246,0.08)' : '#141c2e', cursor:'pointer' }}
                  onClick={() => setFilaSheet(i)}
                  onDoubleClick={e => { e.stopPropagation(); intentarEditar(i) }}>

                  <td style={{ ...tdStyle, width:'60%' }} onClick={e => e.stopPropagation()} onDoubleClick={() => intentarEditar(i)}>
                    {esEditable(i)
                      ? <input value={fila.concepto} onChange={e => setFila(i,'concepto',e.target.value.toUpperCase())} onBlur={() => onBlurFila(i)} autoFocus={filasEditando.has(i)} placeholder="" style={{ background:'transparent', color:'white', outline:'none', width:'100%', fontSize:15 }} />
                      : <span style={{ color:'white', fontSize:15 }}>{fila.concepto || '—'}</span>}
                  </td>

                  <td style={{ ...tdStyle, textAlign:'right', width:'20%' }} onClick={e => e.stopPropagation()} onDoubleClick={() => intentarEditar(i)}>
                    {esEditable(i)
                      ? <input type="text" inputMode="numeric" value={formatCOP(fila.ingreso)} onChange={e => { const v=parseCOP(e.target.value); setFilas(p=>p.map((f,idx)=>idx===i?{...f,ingreso:v,egreso:''}:f)) }} onBlur={() => onBlurFila(i)} placeholder="" style={{ background:'rgba(16,42,30,0.6)', color:'#34d399', outline:'none', width:'100%', fontSize:15, textAlign:'right', borderRadius:6, padding:'2px 6px' }} />
                      : <span style={{ color:'#34d399', fontSize:15 }}>{fila.ingreso ? formatCOP(fila.ingreso) : '—'}</span>}
                  </td>

                  <td style={{ ...tdStyle, textAlign:'right', width:'20%' }} onClick={e => e.stopPropagation()} onDoubleClick={() => intentarEditar(i)}>
                    {esEditable(i)
                      ? <input type="text" inputMode="numeric" value={formatCOP(fila.egreso)} onChange={e => { const v=parseCOP(e.target.value); setFilas(p=>p.map((f,idx)=>idx===i?{...f,egreso:v,ingreso:''}:f)) }} onBlur={() => onBlurFila(i)} placeholder="" style={{ background:'rgba(42,16,16,0.6)', color:'#f87171', outline:'none', width:'100%', fontSize:15, textAlign:'right', borderRadius:6, padding:'2px 6px' }} />
                      : <span style={{ color:'#f87171', fontSize:15 }}>{fila.egreso ? formatCOP(fila.egreso) : '—'}</span>}
                  </td>

                  <td className="hidden md:table-cell" style={{ ...tdStyle, padding:'4px 6px' }} onClick={e => e.stopPropagation()}>
                    {esEditable(i) && <select value={fila.categoria} onChange={e => { setFila(i,'categoria',e.target.value); onBlurFila(i) }} style={{ background:'#141c2e', color:fila.categoria?'white':'#374151', border:'none', outline:'none', width:'100%', fontSize:13, borderRadius:6, padding:'2px 4px', cursor:'pointer' }}>
                      <option value="">—</option>
                      {categorias.filter(c=>c.tipo===(fila.ingreso?'ingreso':fila.egreso?'egreso':'ingreso')).map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                    </select>}
                    {!esEditable(i) && <span style={{ color:'#9ca3af', fontSize:13 }}>{fila.categoria || '—'}</span>}
                  </td>

                  <td className="hidden md:table-cell" style={{ ...tdStyle, padding:'4px 6px' }} onClick={e => e.stopPropagation()}>
                    {esEditable(i)
                      ? <input value={fila.relacionTexto||''} onChange={e => setFila(i,'relacionTexto',e.target.value.toUpperCase())} onBlur={() => onBlurFila(i)} placeholder="—" style={{ background:'transparent', color:'white', outline:'none', width:'100%', fontSize:13 }} />
                      : <span style={{ color:'#9ca3af', fontSize:13 }}>{fila.relacionTexto || '—'}</span>}
                  </td>
                </tr>
              ))}

              <tr style={{ background:'#141c2e', borderBottom:'1px solid #1e2a3d' }}>
                <td colSpan={5} style={{ padding:'6px 10px' }}>
                  <button onClick={agregarFila} style={{ fontSize:12, color:'#374151', cursor:'pointer', background:'none', border:'none' }}>+ Agregar fila</button>
                </td>
              </tr>

              <tr style={{ background:'#0d1220', borderTop:'1px solid #1e2a3d' }}>
                <td style={{ ...tdStyle, color:'#9ca3af', fontWeight:600 }}>Subtotal</td>
                <td style={{ ...tdStyle, textAlign:'right', color:'#34d399', fontWeight:700 }}>{fmt(subIng)}</td>
                <td style={{ ...tdStyle, textAlign:'right', color:'#f87171', fontWeight:700 }}>{fmt(subEgr)}</td>
                <td className="hidden md:table-cell" style={{ ...tdStyle }}></td>
                <td className="hidden md:table-cell" style={{ ...tdStyle }}></td>
              </tr>

              <tr style={{ background:'#0a0f1e' }}>
                <td style={{ padding:'10px 10px', fontSize:14, fontWeight:700, color:'white' }}>TOTAL</td>
                <td colSpan={2} style={{ padding:'10px 10px', fontSize:15, fontWeight:700, textAlign:'right', color: total >= 0 ? '#34d399' : '#f87171' }}>
                  {total < 0 ? '-' : ''}{fmt(total)}
                </td>
                <td className="hidden md:table-cell" colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      </div>

      {/* Sheet móvil */}
      {filaSheet !== null && (
        <div onClick={() => setFilaSheet(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000 }} className="md:hidden">
          <div onClick={e => e.stopPropagation()} style={{ position:'absolute', bottom:0, left:0, right:0, background:'#0d1220', borderTop:'1px solid #1e2a3d', borderRadius:'16px 16px 0 0', padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <span style={{ color:'white', fontWeight:700, fontSize:15 }}>{filas[filaSheet]?.concepto||`Fila ${filaSheet+1}`}</span>
              <button onClick={() => setFilaSheet(null)} style={{ color:'#6b7280', background:'none', border:'none', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom:14 }}>
              <p style={{ color:'#9ca3af', fontSize:12, marginBottom:6 }}>Categoría</p>
              <select value={filas[filaSheet]?.categoria||''} onChange={e => { setFila(filaSheet!,'categoria',e.target.value); onBlurFila(filaSheet!) }} style={{ background:'#141c2e', color:'white', border:'1px solid #1e2a3d', borderRadius:10, padding:'10px 12px', fontSize:14, width:'100%', outline:'none' }}>
                <option value="">— Sin categoría</option>
                {categorias.filter(c=>c.tipo===(filas[filaSheet!]?.ingreso?'ingreso':filas[filaSheet!]?.egreso?'egreso':'ingreso')).map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <p style={{ color:'#9ca3af', fontSize:12, marginBottom:6 }}>Relación / Referencia</p>
              <input value={filas[filaSheet]?.relacionTexto||''} onChange={e => setFila(filaSheet!,'relacionTexto',e.target.value.toUpperCase())} onBlur={() => onBlurFila(filaSheet!)} placeholder="Ej: Factura #3786" style={{ background:'#141c2e', color:'white', border:'1px solid #1e2a3d', borderRadius:10, padding:'10px 12px', fontSize:14, width:'100%', outline:'none' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
