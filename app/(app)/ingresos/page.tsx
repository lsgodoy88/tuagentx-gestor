'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { checkPermiso } from '@/lib/permisos'
import { fmt, parseNum } from '@/lib/shared/utils/formato'
import { Vista, VISTAS, fechaHoy, inicioSemana, finSemana, inicioMes, finMes } from './_lib/fechas'
import { Fila, Categoria, TabConfig, GrupoDia, filasIniciales, filaVacia, FILAS_DEFAULT } from './_lib/tipos'
import { thStyle, tdStyle } from './_lib/estilos'
import { NavegadorFecha } from './_components/NavegadorFecha'
import { FilaSheetMobil } from './_components/FilaSheetMobil'
import { TablaVistaDia } from './_components/TablaVistaDia'
import { TablaVistaRango } from './_components/TablaVistaRango'
import { ConfigPopup } from './_components/ConfigPopup'

export default function SaldosPage() {
  const { data: session } = useSession()
  const _role = (session?.user as any)?.role
  const puedeEditarSaldos = _role === 'empresa' || checkPermiso(session, 'editarSaldos')
  const puedeAdminSaldos  = _role === 'empresa' || checkPermiso(session, 'verBitacora')

  const [tabs, setTabs]               = useState<TabConfig[]>([])
  const [tab, setTab]                 = useState('efectivo')
  const [vista, setVista]             = useState<Vista>('Día')
  const [fecha, setFecha]             = useState('')
  const [filas, setFilas]             = useState<Fila[]>(filasIniciales())
  const [grupos, setGrupos]           = useState<GrupoDia[]>([])
  const [saldoAnterior, setSaldoAnterior] = useState(0)
  const [buscando, setBuscando]       = useState(false)
  const [categorias, setCategorias]   = useState<Categoria[]>([])
  const [showConfig, setShowConfig]   = useState(false)
  const [filaSheet, setFilaSheet]     = useState<number | null>(null)
  const [filasGuardadas, setFilasGuardadas] = useState<Set<number>>(new Set())
  const [celdasEditando, setCeldasEditando] = useState<Set<string>>(new Set())
  const [celdaIntentada, setCeldaIntentada] = useState<{ i: number; campo: 'concepto' | 'ingreso' | 'egreso' } | null>(null)
  const [showPopDia, setShowPopDia]   = useState(false)

  const hoy        = fechaHoy()
  const esDiaActual = vista === 'Día' && fecha === hoy

  // ── Totales con useMemo ──
  const { subIng, subEgr, total } = useMemo(() => {
    const subIng = vista === 'Día'
      ? filas.reduce((s, f) => s + parseNum(f.ingreso), 0)
      : grupos.reduce((s, g) => s + g.filas.reduce((ss, f) => ss + parseNum(f.ingreso), 0), 0)
    const subEgr = vista === 'Día'
      ? filas.reduce((s, f) => s + parseNum(f.egreso), 0)
      : grupos.reduce((s, g) => s + g.filas.reduce((ss, f) => ss + parseNum(f.egreso), 0), 0)
    return { subIng, subEgr, total: saldoAnterior + subIng - subEgr }
  }, [vista, filas, grupos, saldoAnterior])

  // ── Carga config inicial ──
  useEffect(() => {
    fetch('/api/saldos/config').then(r => r.json()).then(d => {
      const t: TabConfig[] = d.tabs || []
      setTabs(t)
      setCategorias(d.categorias || [])
      if (t.length) setTab(prev => prev || t[0].key)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Carga por tab ──
  useEffect(() => {
    if (!tab) return
    resetDia()
    fetch(`/api/saldos?tab=${tab}`).then(r => r.json()).then(d => {
      const f = d.ultimaFecha || hoy
      setFecha(f)
      cargarDia(f, tab)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── Refetch al volver a la tab ──
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && tab && fecha) cargarDia(fecha, tab) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fecha])

  function resetDia() {
    setFilas(filasIniciales())
    setFilasGuardadas(new Set())
    setCeldasEditando(new Set())
    setSaldoAnterior(0)
    setGrupos([])
  }

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
      setCeldasEditando(new Set())
    } else {
      setFilas(filasIniciales()); setFilasGuardadas(new Set()); setCeldasEditando(new Set())
    }
    setBuscando(false)
  }, [tab])

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
    setBuscando(false)
  }, [tab])

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
    setShowPopDia(false)
  }

  function intentarEditar(i: number, campo: 'concepto' | 'ingreso' | 'egreso' = 'concepto') {
    if (!puedeEditarSaldos) return
    if (celdasEditando.has(`${i}-${campo}`)) return
    if (!esDiaActual && filasGuardadas.has(i)) {
      setCeldaIntentada({ i, campo }); setShowPopDia(true)
    } else {
      setCeldasEditando(prev => new Set([...prev, `${i}-${campo}`]))
    }
  }

  function editarDiaActual() {
    setShowPopDia(false)
    if (celdaIntentada) {
      setCeldasEditando(prev => new Set([...prev, `${celdaIntentada.i}-${celdaIntentada.campo}`]))
      setCeldaIntentada(null)
    }
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
      }
    })
  }

  function setFila(i: number, campo: keyof Fila, valor: string) {
    setFilas(prev => prev.map((f, idx) => idx === i ? { ...f, [campo]: valor } : f))
  }

  function onBlurCelda(i: number, campo: 'concepto' | 'ingreso' | 'egreso') {
    if (!puedeEditarSaldos) return
    autoguardar(i, filas[i])
    setCeldasEditando(prev => { const n = new Set(prev); n.delete(`${i}-${campo}`); return n })
  }

  function onBlurFila(i: number) {
    if (puedeEditarSaldos) autoguardar(i, filas[i])
  }

  function guardarCategoria(i: number, fila: Fila, cat: string) {
    setFila(i, 'categoria', cat)
    const filaActualizada = { ...fila, categoria: cat }
    if (!fecha || vista !== 'Día') return
    fetch('/api/saldos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: filaActualizada.esNueva ? undefined : filaActualizada.id,
        tab, fecha, orden: i,
        concepto: filaActualizada.concepto, ingreso: filaActualizada.ingreso || null,
        egreso: filaActualizada.egreso || null, categoria: cat || null,
        relacionTexto: filaActualizada.relacionTexto || null,
      }),
    }).then(r => r.json()).then(data => {
      if (data.id) setFilas(prev => prev.map((f, idx) => idx === i ? { ...f, id: data.id, esNueva: false } : f))
    })
  }

  return (
    <div className="space-y-3 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 style={{ color: 'white', fontWeight: 700, fontSize: 18 }}>Saldos</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {checkPermiso(session, 'verBitacora') && (
            <select
              value={vista}
              onChange={e => cambiarVista(e.target.value as Vista)}
              style={{ background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '6px 10px', fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer' }}
            >
              <option value="Día"    style={{ background: '#0d1220', color: 'white' }}>🔍 Día</option>
              <option value="Semana" style={{ background: '#0d1220', color: 'white' }}>📅 Semana</option>
              <option value="Mes"    style={{ background: '#0d1220', color: 'white' }}>📆 Mes</option>
            </select>
          )}
          {puedeAdminSaldos && (
            <button
              onClick={() => setShowConfig(v => !v)}
              style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid ' + (showConfig ? 'rgba(59,130,246,0.5)' : '#1e2a3d'), background: showConfig ? 'rgba(59,130,246,0.15)' : 'rgba(13,18,32,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 17 }}
            >&#9881;</button>
          )}
        </div>
      </div>

      {/* Pop aviso día diferente */}
      {showPopDia && (
        <div onClick={() => setShowPopDia(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
            <p style={{ color: '#f59e0b', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>⚠️ Día diferente al actual</p>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
              Día <span style={{ color: 'white', fontWeight: 600 }}>{fecha}</span> — vas a editar:{' '}
              <span style={{ color: '#c4b5fd', fontWeight: 600 }}>
                {celdaIntentada?.campo === 'concepto' ? 'Concepto' : celdaIntentada?.campo === 'ingreso' ? 'Ingreso' : 'Egreso'}
              </span>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={irAHoy} style={{ flex: 1, background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>📅 Ir a Hoy</button>
              <button onClick={editarDiaActual} style={{ flex: 1, background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✏️ Editar {fecha}</button>
            </div>
          </div>
        </div>
      )}

      {/* Config popup */}
      {showConfig && (
        <ConfigPopup
          tabs={tabs}
          categorias={categorias}
          tabActual={tab}
          onClose={() => setShowConfig(false)}
          onTabsChange={setTabs}
          onCategoriasChange={setCategorias}
          onTabActualChange={setTab}
        />
      )}

      {/* Tabs dinámicas */}
      <div className="tab-pills rounded-xl p-1" style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`py-2 text-sm font-semibold transition-colors rounded-lg ${tab === t.key ? 'tab-active' : 'text-white hover:text-white'}`}
            style={{ flexShrink: 0, paddingLeft: 14, paddingRight: 14, whiteSpace: 'nowrap' }}>
            {t.nombre}
          </button>
        ))}
      </div>

      {/* Navegador */}
      <NavegadorFecha
        vista={vista}
        fecha={fecha}
        buscando={buscando}
        onNavegar={navegar}
        onIrAHoy={irAHoy}
        onFechaDirecta={f => { setFecha(f); cargarDia(f) }}
      />

      {/* Tabla */}
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

              {vista === 'Día' ? (
                <TablaVistaDia
                  filas={filas}
                  categorias={categorias}
                  filasGuardadas={filasGuardadas}
                  celdasEditando={celdasEditando}
                  puedeEditarSaldos={puedeEditarSaldos}
                  tab={tab}
                  fecha={fecha}
                  onSetFila={setFila}
                  onSetFilas={setFilas}
                  onBlurCelda={onBlurCelda}
                  onBlurFila={onBlurFila}
                  onIntentarEditar={intentarEditar}
                  onFilaSheetOpen={setFilaSheet}
                  onAgregarFila={() => setFilas(prev => [...prev, filaVacia(true)])}
                  onGuardarCategoria={guardarCategoria}
                />
              ) : (
                <TablaVistaRango
                  grupos={grupos}
                  buscando={buscando}
                  onClickFila={f => { setFecha(f); setVista('Día'); cargarDia(f) }}
                />
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

      {/* Sheet móvil */}
      {filaSheet !== null && vista === 'Día' && (
        <FilaSheetMobil
          filaIdx={filaSheet}
          fila={filas[filaSheet]}
          categorias={categorias}
          onClose={() => setFilaSheet(null)}
          onCategoriaChange={(i, val) => setFila(i, 'categoria', val)}
          onRelacionChange={(i, val) => setFila(i, 'relacionTexto', val)}
          onBlurFila={onBlurFila}
        />
      )}

    </div>
  )
}
