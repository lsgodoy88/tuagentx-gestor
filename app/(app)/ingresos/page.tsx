'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Constantes ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'efectivo', label: '💵 Efectivo' },
  { key: 'bancos',   label: '🏦 Bancos'   },
  { key: 'otros',    label: '📦 Otros'    },
]
const VISTAS = ['Día', 'Semana', 'Mes'] as const
type Vista = typeof VISTAS[number]
const FILAS_DEFAULT = 7

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface Fila { id?: string; concepto: string; ingreso: string; egreso: string; categoria: string; relacionTexto: string; esNueva?: boolean }
interface Categoria { id: string; tipo: string; nombre: string }
interface GrupoDia { fecha: string; filas: Fila[] }

// ─── Helpers ───────────────────────────────────────────────────────────────
function filaVacia(esNueva = false): Fila { return { concepto: '', ingreso: '', egreso: '', categoria: '', relacionTexto: '', esNueva } }
function filasIniciales(): Fila[] { return Array.from({ length: FILAS_DEFAULT }, () => filaVacia()) }
function fmt(n: number) { return '$' + Math.abs(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function formatCOP(raw: string): string {
  const n = parseFloat(raw.replace(/\./g, '').replace(/[^0-9]/g, ''))
  if (!raw || isNaN(n) || n === 0) return ''
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}
function parseCOP(val: string): string { return val.replace(/\./g, '').replace(/[^0-9]/g, '') }
function parseNum(v: string) { const n = parseFloat(v.replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
function fechaHoy() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) }
function fmtFecha(f: string) { return f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '--/--/--' }
function fmtFechaCorta(f: string) { if (!f) return ''; const d = new Date(f + 'T12:00:00'); return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') }
function fmtFechaLarga(f: string) {
  return f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : ''
}
function inicioSemana(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00')
  const dia = d.getDay() // 0=dom
  d.setDate(d.getDate() - dia)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
function finSemana(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00')
  const dia = d.getDay()
  d.setDate(d.getDate() + (6 - dia))
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
function inicioMes(fecha: string): string { return fecha.slice(0, 7) + '-01' }
function finMes(fecha: string): string {
  const [y, m] = fecha.split('-').map(Number)
  return new Date(y, m, 0).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
function labelNavegador(vista: Vista, fecha: string): string {
  if (vista === 'Día') return fmtFecha(fecha)
  if (vista === 'Semana') {
    const ini = inicioSemana(fecha); const fin = finSemana(fecha)
    return `${fmtFecha(ini)} – ${fmtFecha(fin)}`
  }
  // Mes
  const [y, m] = fecha.split('-').map(Number)
  const nombre = new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}
function moverFecha(fecha: string, vista: Vista, delta: number): string {
  const d = new Date(fecha + 'T12:00:00')
  if (vista === 'Día')    d.setDate(d.getDate() + delta)
  if (vista === 'Semana') d.setDate(d.getDate() + delta * 7)
  if (vista === 'Mes')    d.setMonth(d.getMonth() + delta)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

const thStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 12, fontWeight: 600, color: 'white', whiteSpace: 'nowrap' }
const tdStyle: React.CSSProperties = { padding: '6px 10px', fontSize: 12, fontWeight: 500, color: 'white', borderBottom: '1px solid #1e2a3d' }

// ─── Componente principal ──────────────────────────────────────────────────
export default function SaldosPage() {
  const [tab, setTab]                   = useState('efectivo')
  const [vista, setVista]               = useState<Vista>('Día')
  const [fecha, setFecha]               = useState('')          // fecha de referencia (día/semana/mes)
  const [filas, setFilas]               = useState<Fila[]>(filasIniciales())
  const [grupos, setGrupos]             = useState<GrupoDia[]>([])
  const [expandidos, setExpandidos]     = useState<Set<string>>(new Set())
  const [saldoAnterior, setSaldoAnterior] = useState(0)
  const [buscando, setBuscando]         = useState(false)
  const [categorias, setCategorias]     = useState<Categoria[]>([])
  const [showConfig, setShowConfig]     = useState(false)
  const [nuevaCat, setNuevaCat]         = useState({ tipo: 'ingreso', nombre: '' })
  const [filaSheet, setFilaSheet]       = useState<number | null>(null)
  const [filasGuardadas, setFilasGuardadas] = useState<Set<number>>(new Set())
  const [filasEditando, setFilasEditando]   = useState<Set<number>>(new Set())
  const [showPopDia, setShowPopDia]     = useState(false)
  const [filaIntentada, setFilaIntentada]   = useState<number | null>(null)

  const hoy        = fechaHoy()
  const esDiaActual = vista === 'Día' && fecha === hoy

  // ── Carga inicial ──
  useEffect(() => {
    resetDia()
    fetch(`/api/saldos?tab=${tab}`).then(r => r.json()).then(d => {
      const f = d.ultimaFecha || hoy
      setFecha(f)
      cargarDia(f, tab)
    })
    fetch('/api/saldos/config').then(r => r.json()).then(d => setCategorias(d.categorias || []))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  function resetDia() {
    setFilas(filasIniciales())
    setFilasGuardadas(new Set())
    setFilasEditando(new Set())
    setSaldoAnterior(0)
    setGrupos([])
    setExpandidos(new Set())
  }

  // ── Carga un día ──
  const cargarDia = useCallback(async (f: string, t = tab) => {
    setBuscando(true)
    const d = await fetch(`/api/saldos?tab=${t}&fecha=${f}`).then(r => r.json())
    setSaldoAnterior(Number(d.saldoAnterior || 0))
    if (d.movimientos?.length) {
      const rows: Fila[] = d.movimientos.map((m: any) => ({
        id: m.id, concepto: m.concepto, ingreso: m.ingreso || '',
        egreso: m.egreso || '', categoria: m.categoria || '', relacionTexto: m.relacionTexto || '', esNueva: false,
      }))
      while (rows.length < FILAS_DEFAULT) rows.push(filaVacia())
      setFilas(rows)
      setFilasGuardadas(new Set(rows.map((_, i) => i).filter(i => rows[i].concepto || rows[i].ingreso || rows[i].egreso)))
      setFilasEditando(new Set())
    } else {
      setFilas(filasIniciales()); setFilasGuardadas(new Set()); setFilasEditando(new Set())
    }
    setBuscando(false)
  }, [tab])

  // ── Carga rango (semana/mes) ──
  const cargarRango = useCallback(async (f: string, v: Vista, t = tab) => {
    setBuscando(true)
    let desde = f, hasta = f
    if (v === 'Semana') { desde = inicioSemana(f); hasta = finSemana(f) }
    if (v === 'Mes')    { desde = inicioMes(f);    hasta = finMes(f)    }
    const d = await fetch(`/api/saldos?tab=${t}&fecha=${desde}&fechaHasta=${hasta}`).then(r => r.json())
    setSaldoAnterior(Number(d.saldoAnterior || 0))
    const g: GrupoDia[] = Object.entries(d.grupos || {}).map(([fecha, filas]: any) => ({ fecha, filas }))
    g.sort((a, b) => a.fecha.localeCompare(b.fecha))
    setGrupos(g)
    setExpandidos(new Set()) // colapsados por defecto
    setBuscando(false)
  }, [tab])

  // ── Cuando cambia vista o fecha ──
  function navegar(nuevaFecha: string, nuevaVista: Vista) {
    setFecha(nuevaFecha)
    if (nuevaVista === 'Día') cargarDia(nuevaFecha)
    else cargarRango(nuevaFecha, nuevaVista)
  }

  function cambiarVista(v: Vista) {
    setVista(v)
    if (v === 'Día') cargarDia(fecha)
    else cargarRango(fecha, v)
  }

  function irAHoy() {
    setFecha(hoy); setVista('Día')
    cargarDia(hoy)
    setShowPopDia(false); setFilaIntentada(null)
  }

  function editarDiaActual() {
    setShowPopDia(false)
    if (filaIntentada !== null) {
      setFilasEditando(prev => new Set([...prev, filaIntentada]))
      setFilaIntentada(null)
    }
  }

  function intentarEditar(i: number) {
    if (!esDiaActual && filasGuardadas.has(i)) { setFilaIntentada(i); setShowPopDia(true) }
    else setFilasEditando(prev => new Set([...prev, i]))
  }

  function autoguardar(i: number, fila: Fila) {
    if (!fecha || vista !== 'Día') return
    fetch('/api/saldos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: fila.esNueva ? undefined : fila.id,
        tab, fecha, orden: i,
        concepto: fila.concepto, ingreso: fila.ingreso || null, egreso: fila.egreso || null,
        categoria: fila.categoria || null, relacionTexto: fila.relacionTexto || null,
      }),
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
  function agregarFila() { setFilas(prev => [...prev, filaVacia(true)]) }

  function toggleExpandido(fechaKey: string) {
    setExpandidos(prev => {
      const n = new Set(prev)
      n.has(fechaKey) ? n.delete(fechaKey) : n.add(fechaKey)
      return n
    })
  }

  const subIng = vista === 'Día'
    ? filas.reduce((s, f) => s + parseNum(f.ingreso), 0)
    : grupos.reduce((s, g) => s + g.filas.reduce((ss, f) => ss + parseNum(f.ingreso), 0), 0)
  const subEgr = vista === 'Día'
    ? filas.reduce((s, f) => s + parseNum(f.egreso), 0)
    : grupos.reduce((s, g) => s + g.filas.reduce((ss, f) => ss + parseNum(f.egreso), 0), 0)
  const total = saldoAnterior + subIng - subEgr

  return (
    <div className="space-y-3 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 style={{ color: 'white', fontWeight: 700, fontSize: 18 }}>Saldos</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={vista} onChange={e => cambiarVista(e.target.value as Vista)}
            style={{ background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '6px 10px', fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer' }}>
            <option value="Día">🔍 Día</option>
            <option value="Semana">📅 Semana</option>
            <option value="Mes">📆 Mes</option>
          </select>
          <button onClick={() => setShowConfig(v => !v)}
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid ' + (showConfig ? 'rgba(59,130,246,0.5)' : '#1e2a3d'), background: showConfig ? 'rgba(59,130,246,0.15)' : 'rgba(13,18,32,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 17 }}>&#9881;</button>
        </div>
      </div>

      {/* Pop aviso día diferente */}
      {showPopDia && (
        <div onClick={() => setShowPopDia(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
            <p style={{ color: '#f59e0b', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>⚠️ Día diferente al actual</p>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>El registro es del <span style={{ color: 'white', fontWeight: 600 }}>{fmtFecha(fecha)}</span>. ¿Qué deseas hacer?</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={irAHoy} style={{ flex: 1, background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>📅 Ir a Hoy</button>
              <button onClick={editarDiaActual} style={{ flex: 1, background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✏️ Editar {fmtFecha(fecha)}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal config categorías */}
      {showConfig && (
        <div onClick={() => setShowConfig(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px 16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto' }}>
            <p style={{ color: 'white', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Categorías</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select value={nuevaCat.tipo} onChange={e => setNuevaCat(p => ({ ...p, tipo: e.target.value }))} style={{ background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 8, padding: '6px 8px', fontSize: 13, outline: 'none' }}>
                <option value="ingreso">Ingreso</option><option value="egreso">Egreso</option>
              </select>
              <input value={nuevaCat.nombre} onChange={e => setNuevaCat(p => ({ ...p, nombre: e.target.value.toUpperCase() }))} placeholder="Nombre" style={{ flex: 1, background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' }} />
              <button onClick={async () => {
                if (!nuevaCat.nombre.trim()) return
                await fetch('/api/saldos/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevaCat) })
                const d = await fetch('/api/saldos/config').then(r => r.json())
                setCategorias(d.categorias || []); setNuevaCat(p => ({ ...p, nombre: '' }))
              }} style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '6px 14px', fontSize: 15, cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
            {(['ingreso', 'egreso'] as const).map(tipo => (
              <div key={tipo} style={{ marginBottom: 10 }}>
                <p style={{ color: tipo === 'ingreso' ? '#34d399' : '#f87171', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{tipo === 'ingreso' ? 'INGRESOS' : 'EGRESOS'}</p>
                {categorias.filter(c => c.tipo === tipo).map(cat => (
                  <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #1e2a3d' }}>
                    <span style={{ color: 'white', fontSize: 13 }}>{cat.nombre}</span>
                    <button onClick={async () => {
                      await fetch('/api/saldos/config', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cat.id }) })
                      setCategorias(prev => prev.filter(c => c.id !== cat.id))
                    }} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
                  </div>
                ))}
                {!categorias.filter(c => c.tipo === tipo).length && <p style={{ color: '#374151', fontSize: 12, fontStyle: 'italic' }}>Sin categorías</p>}
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



      {/* Navegador fecha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => navegar(moverFecha(fecha, vista, -1), vista)}
          style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #1e2a3d', background: 'rgba(13,18,32,0.9)', color: '#9ca3af', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>

        <div style={{ flex: 1, position: 'relative' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(13,18,32,0.9)', border: '1px solid ' + (esDiaActual ? '#1e2a3d' : 'rgba(245,158,11,0.4)'), borderRadius: 10, padding: '7px 12px', cursor: 'pointer' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: esDiaActual ? 'white' : '#f59e0b' }}>
              {buscando ? '…' : labelNavegador(vista, fecha)}
            </span>
            {vista === 'Día' && (
              <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); cargarDia(e.target.value) }}
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer' }} />
            )}
          </label>
        </div>

        <button onClick={() => navegar(moverFecha(fecha, vista, 1), vista)}
          style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #1e2a3d', background: 'rgba(13,18,32,0.9)', color: '#9ca3af', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>

        <button onClick={irAHoy}
          style={{ padding: '7px 16px', borderRadius: 10, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(30,42,61,0.90)', cursor: 'pointer', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>
          Hoy
        </button>
      </div>

      {/* ── Tabla ── */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2a3d' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: 'auto', minWidth: 320 }}>
            <thead>
              <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2a3d' }}>
                {vista !== 'Día' && <th style={{ ...thStyle, textAlign: 'left', width: 44, color: '#9ca3af' }}>Fecha</th>}
                <th style={{ ...thStyle, textAlign: 'left' }}>Concepto</th>
                <th style={{ ...thStyle, textAlign: 'right', color: '#34d399', width: 88 }}>Ingresos</th>
                <th style={{ ...thStyle, textAlign: 'right', color: '#f87171', width: 88 }}>Egresos</th>
                <th className="hidden md:table-cell" style={{ ...thStyle, color: '#9ca3af', width: 96 }}>Categoría</th>
              </tr>
            </thead>
            <tbody>

              {/* Saldo anterior */}
              <tr style={{ background: '#0f1623', borderBottom: '1px solid #1e2a3d' }}>
                {vista !== 'Día' && <td style={{ ...tdStyle }}></td>}
                <td style={{ ...tdStyle, color: '#6b7280', fontStyle: 'italic', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 12 }}>Saldo anterior</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#34d399' }}>{saldoAnterior >= 0 ? fmt(saldoAnterior) : '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#f87171' }}>{saldoAnterior < 0 ? fmt(Math.abs(saldoAnterior)) : '—'}</td>
                <td className="hidden md:table-cell" style={{ ...tdStyle }}></td>
              </tr>

              {/* ── Vista DÍA ── */}
              {vista === 'Día' && (
                <>
                  {filas.map((fila, i) => (
                    <tr key={i} style={{ background: fila.esNueva ? 'rgba(139,92,246,0.08)' : '#141c2e', cursor: 'pointer' }}
                      onClick={() => setFilaSheet(i)}
                      onDoubleClick={e => { e.stopPropagation(); intentarEditar(i) }}>

                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()} onDoubleClick={() => intentarEditar(i)}>
                        {esEditable(i)
                          ? <input value={fila.concepto} onChange={e => setFila(i, 'concepto', e.target.value.toUpperCase())} onBlur={() => onBlurFila(i)} autoFocus={filasEditando.has(i)} style={{ background: 'transparent', color: '#d1d5db', outline: 'none', width: '100%', fontSize: 13 }} />
                          : <span style={{ color: '#d1d5db', fontSize: 13 }}>{fila.concepto || '—'}</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '2px solid rgba(255,255,255,0.07)' }} onClick={e => e.stopPropagation()} onDoubleClick={() => intentarEditar(i)}>
                        {esEditable(i)
                          ? <input type="text" inputMode="numeric" value={formatCOP(fila.ingreso)} onChange={e => { const v = parseCOP(e.target.value); setFilas(p => p.map((f, idx) => idx === i ? { ...f, ingreso: v, egreso: '' } : f)) }} onBlur={() => onBlurFila(i)} style={{ background: fila.ingreso ? 'rgba(16,42,30,0.6)' : 'transparent', color: '#34d399', outline: 'none', width: '100%', fontSize: 13, textAlign: 'right', borderRadius: 6, padding: '2px 6px' }} />
                          : fila.ingreso ? <span style={{ color: '#34d399', fontSize: 13 }}>{formatCOP(fila.ingreso)}</span> : null}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '2px solid rgba(255,255,255,0.07)' }} onClick={e => e.stopPropagation()} onDoubleClick={() => intentarEditar(i)}>
                        {esEditable(i)
                          ? <input type="text" inputMode="numeric" value={formatCOP(fila.egreso)} onChange={e => { const v = parseCOP(e.target.value); setFilas(p => p.map((f, idx) => idx === i ? { ...f, egreso: v, ingreso: '' } : f)) }} onBlur={() => onBlurFila(i)} style={{ background: fila.egreso ? 'rgba(42,16,16,0.6)' : 'transparent', color: '#f87171', outline: 'none', width: '100%', fontSize: 13, textAlign: 'right', borderRadius: 6, padding: '2px 6px' }} />
                          : fila.egreso ? <span style={{ color: '#f87171', fontSize: 13 }}>{formatCOP(fila.egreso)}</span> : null}
                      </td>
                      <td className="hidden md:table-cell" style={{ ...tdStyle, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                        {esEditable(i)
                          ? <select value={fila.categoria} onChange={e => { setFila(i, 'categoria', e.target.value); onBlurFila(i) }} style={{ background: '#141c2e', color: fila.categoria ? 'white' : '#374151', border: 'none', outline: 'none', width: '100%', fontSize: 12, borderRadius: 6, padding: '2px 4px', cursor: 'pointer' }}>
                              <option value="">—</option>
                              {categorias.filter(c => c.tipo === (fila.ingreso ? 'ingreso' : fila.egreso ? 'egreso' : 'ingreso')).map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                            </select>
                          : <span style={{ color: '#9ca3af', fontSize: 12 }}>{fila.categoria || '—'}</span>}
                      </td>
                    </tr>
                  ))}

                  {/* Agregar fila */}
                  <tr style={{ background: '#141c2e', borderBottom: '1px solid #1e2a3d' }}>
                    <td colSpan={4} style={{ padding: '6px 10px' }}>
                      <button onClick={agregarFila} style={{ fontSize: 12, color: '#374151', cursor: 'pointer', background: 'none', border: 'none' }}>+ Agregar fila</button>
                    </td>
                  </tr>
                </>
              )}

              {/* ── Vista SEMANA / MES — filas planas con columna fecha ── */}
              {vista !== 'Día' && (
                <>
                  {grupos.length === 0 && !buscando && (
                    <tr style={{ background: '#141c2e' }}>
                      <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#374151', fontStyle: 'italic', padding: 24 }}>Sin movimientos en este período</td>
                    </tr>
                  )}
                  {grupos.flatMap(g =>
                    g.filas.filter(f => f.concepto || f.ingreso || f.egreso).map((fila, fi) => {
                      const esPrimera = fi === 0
                      return (
                        <tr key={g.fecha + '_' + fi}
                          style={{ background: esPrimera ? '#0f1a2e' : '#141c2e', borderBottom: '1px solid #1e2a3d', cursor: 'pointer' }}
                          onClick={() => { setFecha(g.fecha); setVista('Día'); cargarDia(g.fecha) }}>
                          <td style={{ ...tdStyle, width: 48, fontSize: 12, fontWeight: esPrimera ? 700 : 400, color: esPrimera ? '#60a5fa' : '#374151', whiteSpace: 'nowrap' }}>
                            {esPrimera ? fmtFechaCorta(g.fecha) : ''}
                          </td>
                          <td style={{ ...tdStyle, fontSize: 13, color: '#d1d5db', whiteSpace: 'nowrap' }}>{fila.concepto || '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap', borderLeft: '2px solid rgba(255,255,255,0.07)' }}>{fila.ingreso ? <span style={{color:'#34d399'}}>{formatCOP(fila.ingreso)}</span> : null}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap', borderLeft: '2px solid rgba(255,255,255,0.07)' }}>{fila.egreso ? <span style={{color:'#f87171'}}>{formatCOP(fila.egreso)}</span> : null}</td>
                          <td className="hidden md:table-cell" style={{ ...tdStyle, color: '#9ca3af', fontSize: 12, whiteSpace: 'nowrap' }}>{fila.categoria || '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </>
              )}

              {/* Subtotal */}
              <tr style={{ background: '#0d1220', borderTop: '1px solid #1e2a3d' }}>
                {vista !== 'Día' && <td style={{ ...tdStyle }}></td>}
                <td style={{ ...tdStyle, color: '#9ca3af', fontWeight: 600 }}>Subtotal</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{fmt(saldoAnterior + subIng)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#f87171', fontWeight: 700 }}>{fmt(subEgr)}</td>
                <td className="hidden md:table-cell" style={{ ...tdStyle }}></td>
              </tr>

              {/* Total */}
              <tr style={{ background: '#0a0f1e' }}>
                {vista !== 'Día' && <td style={{ padding: '10px 10px' }}></td>}
                <td style={{ padding: '10px 10px', fontSize: 14, fontWeight: 700, color: 'white' }}>TOTAL</td>
                <td colSpan={2} style={{ padding: '10px 10px', fontSize: 15, fontWeight: 700, textAlign: 'right', color: total >= 0 ? '#34d399' : '#f87171' }}>
                  {total < 0 ? '-' : ''}{fmt(total)}
                </td>
                <td className="hidden md:table-cell"></td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>

      {/* Sheet móvil (solo vista Día) */}
      {filaSheet !== null && vista === 'Día' && (
        <div onClick={() => setFilaSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} className="md:hidden">
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#0d1220', borderTop: '1px solid #1e2a3d', borderRadius: '16px 16px 0 0', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>{filas[filaSheet]?.concepto || `Fila ${filaSheet + 1}`}</span>
              <button onClick={() => setFilaSheet(null)} style={{ color: '#6b7280', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Categoría</p>
              <select value={filas[filaSheet]?.categoria || ''} onChange={e => { setFila(filaSheet!, 'categoria', e.target.value); onBlurFila(filaSheet!) }}
                style={{ background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 10, padding: '10px 12px', fontSize: 14, width: '100%', outline: 'none' }}>
                <option value="">— Sin categoría</option>
                {categorias.filter(c => c.tipo === (filas[filaSheet!]?.ingreso ? 'ingreso' : filas[filaSheet!]?.egreso ? 'egreso' : 'ingreso')).map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Relación / Referencia</p>
              <input value={filas[filaSheet]?.relacionTexto || ''} onChange={e => setFila(filaSheet!, 'relacionTexto', e.target.value.toUpperCase())} onBlur={() => onBlurFila(filaSheet!)}
                placeholder="Ej: Factura #3786" style={{ background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 10, padding: '10px 12px', fontSize: 14, width: '100%', outline: 'none' }} />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
