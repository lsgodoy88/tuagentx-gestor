'use client'
import React from 'react'
import { esDelMesBogota } from '@/lib/fechas'
import { CountUp, LiveDot } from '@/components/FX'
import SelectorMes from '@/components/SelectorMes'
import { EDADES, type Edad } from './hooks/useEdadesCartera'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

interface CarteraReportesProps {
  // Datos
  pagos: any[]
  carteras: any[]
  metas: any[]
  vendedores: any[]
  totalReal: { saldoPendiente: number; saldoTotal: number; clientes: number } | null
  // Edades
  porEdadApi: Record<string, number>
  porEdadVendedorApi: Record<string, Record<string, number>>
  edadesCargadas: boolean
  cargandoEdades: boolean
  cargarEdades: () => void
  // Snapshot
  snapshotHistorico: any
  loadingSnapshot: boolean
  loadingBusqueda: boolean
  // Selector mes
  mesSel: number
  setMesSel: (m: number) => void
  anioSel: number
  setAnioSel: (a: number) => void
  mesAnalisis: number
  anioAnalisis: number
  setMesAnalisis: (m: number) => void
  setAnioAnalisis: (a: number) => void
  setSnapshotHistorico: (s: any) => void
  setLoadingSnapshot: (v: boolean) => void
  // Snap histórico edades
  snapMesInicio: number
  setSnapMesInicio: (m: number) => void
  snapAnioInicio: number
  setSnapAnioInicio: (a: number) => void
  snapMesFin: number
  setSnapMesFin: (m: number) => void
  snapAnioFin: number
  setSnapAnioFin: (a: number) => void
  generandoSnap: boolean
  setGenerandoSnap: (v: boolean) => void
  // Meta form (admin)
  metaForm: { empleadoId: string; carteraBase: string; metaPct: string }
  setMetaForm: (f: any) => void
  guardandoMeta: boolean
  setGuardandoMeta: (v: boolean) => void
  setMetas: (m: any[]) => void
  // PDF
  dlShine: boolean
  setDlShine: (v: boolean) => void
  dlOrdenPopup: boolean
  setDlOrdenPopup: (v: boolean) => void
  // Rol
  esAdmin: boolean
  isAdmin: boolean
  userRole: string | undefined
  empresaNombre: string
}

export default function CarteraReportes({
  pagos, carteras, metas, vendedores, totalReal,
  porEdadApi, porEdadVendedorApi, edadesCargadas, cargandoEdades, cargarEdades,
  snapshotHistorico, loadingSnapshot, loadingBusqueda,
  mesSel, setMesSel, anioSel, setAnioSel,
  mesAnalisis, anioAnalisis, setMesAnalisis, setAnioAnalisis,
  setSnapshotHistorico, setLoadingSnapshot,
  snapMesInicio, setSnapMesInicio, snapAnioInicio, setSnapAnioInicio,
  snapMesFin, setSnapMesFin, snapAnioFin, setSnapAnioFin,
  generandoSnap, setGenerandoSnap,
  metaForm, setMetaForm, guardandoMeta, setGuardandoMeta, setMetas,
  dlShine, setDlShine, dlOrdenPopup, setDlOrdenPopup,
  esAdmin, isAdmin, userRole, empresaNombre,
}: CarteraReportesProps) {
  const anio = anioAnalisis
  const mes = mesAnalisis

  const porEdad = porEdadApi as Record<Edad, number>
  const porEdadVendedor = Object.fromEntries(
    Object.entries(porEdadVendedorApi as Record<string, Record<Edad, number>>)
      .filter(([nombre]) => nombre !== 'Sin vendedor')
  ) as Record<string, Record<Edad, number>>

  // Pagos del mes seleccionado
  const pagosMes = pagos.filter((p: any) => esDelMesBogota(new Date(p.createdAt), mes, anio))
  const mesAnterior = mes === 1 ? 12 : mes - 1
  const anioAnterior = mes === 1 ? anio - 1 : anio
  const pagosAnt = pagos.filter((p: any) => esDelMesBogota(new Date(p.createdAt), mesAnterior, anioAnterior))

  const totalRecaudadoMes = pagosMes.reduce((s: number, p: any) => s + Number(p.monto), 0)
  const totalDescMes = pagosMes.reduce((s: number, p: any) => s + Number(p.descuento || 0), 0)
  const totalMes = totalRecaudadoMes + totalDescMes
  const totalAnt = pagosAnt.reduce((s: number, p: any) => s + Number(p.monto) + Number(p.descuento || 0), 0)
  const variacion = totalAnt > 0 ? Math.round(((totalMes - totalAnt) / totalAnt) * 100) : 0

  const totalCartera = totalReal ? totalReal.saldoTotal
    : carteras.reduce((s: number, c: any) => s + (c.DetalleCartera || []).reduce((a: number, d: any) => a + Number(d.valorFactura ?? d.valor ?? 0), 0), 0)
  const totalPend = totalReal ? totalReal.saldoPendiente
    : carteras.reduce((s: number, c: any) => s + Number(c.saldoPendiente), 0)

  const miMeta = userRole === 'vendedor' ? metas.find((m: any) => m.mes === mes && m.anio === anio) : null
  const miMetaPct = miMeta ? Number(miMeta.metaPct) : 0
  const metaPesos = miMetaPct > 0 ? Math.round(totalCartera * miMetaPct / 100) : 0
  const pctMeta = metaPesos > 0 ? Math.min(100, Math.round((totalMes / metaPesos) * 100)) : 0
  const colorMeta = pctMeta >= 80 ? '#34d399' : pctMeta >= 50 ? '#fbbf24' : '#f87171'

  const meses4 = Array.from({ length: 4 }, (_, i) => {
    const m = mes - i
    const a = m <= 0 ? anio - 1 : anio
    const mr = m <= 0 ? m + 12 : m
    const nombre = MESES[mr - 1]
    const total = pagos.filter((p: any) => esDelMesBogota(p.createdAt, mr, a))
      .reduce((s: number, p: any) => s + Number(p.monto) + Number(p.descuento || 0), 0)
    return { nombre, total, mes: mr, anio: a }
  })

  const porVendedor: Record<string, any> = {}
  pagosMes.forEach((p: any) => {
    const id = p.empleado?.id || 'x'
    const nombre = p.empleado?.nombre || 'Sin nombre'
    if (!porVendedor[id]) porVendedor[id] = { id, nombre, monto: 0, descuento: 0, count: 0 }
    porVendedor[id].monto += Number(p.monto)
    porVendedor[id].descuento += Number(p.descuento || 0)
    porVendedor[id].count += 1
  })
  const vendedoresMes = Object.values(porVendedor)

  const vendedorSelNombre = metaForm.empleadoId
    ? (vendedores.find((v: any) => v.id === metaForm.empleadoId)?.nombre || '')
    : ''
  const metaCalculadaPesos = metaForm.carteraBase && metaForm.metaPct
    ? Math.round(Number(metaForm.carteraBase) * Number(metaForm.metaPct) / 100)
    : 0

  async function guardarMeta() {
    if (!metaForm.empleadoId || !metaForm.metaPct) return
    setGuardandoMeta(true)
    const pctFinal = Number(metaForm.metaPct)
    const pesosFinales = Math.round(Number(metaForm.carteraBase || 0) * pctFinal / 100)
    await fetch('/api/cartera/metas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empleadoId: metaForm.empleadoId, mes, anio, metaPesos: pesosFinales, metaPct: pctFinal })
    })
    setGuardandoMeta(false)
    setMetaForm({ empleadoId: '', carteraBase: '', metaPct: '' })
    const r = await fetch('/api/cartera/metas').then(r => r.json())
    setMetas(r.metas || [])
  }

  const aplicarMes = async (m: number, a: number) => {
    setMesAnalisis(m); setAnioAnalisis(a)
    const mesBog = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7)
    const selLabel = `${a}-${String(m).padStart(2, '0')}`
    if (selLabel < mesBog) {
      setLoadingSnapshot(true)
      try {
        const [rEdad, rSnap] = await Promise.all([
          fetch(`/api/cartera/edades-snapshot?mesInicio=${m}&anioInicio=${a}&mesFin=${m}&anioFin=${a}`).then(r => r.json()),
          fetch(`/api/stats/historico-mes?mes=${selLabel}`).then(r => r.json()),
        ])
        setSnapshotHistorico({ edades: rEdad, recaudo: rSnap.recaudo ?? 0, descuento: rSnap.descuento ?? 0, cartera: rSnap.cartera ?? 0, pendiente: rSnap.pendiente ?? 0 })
      } catch (e) { console.error(e) }
      finally { setLoadingSnapshot(false) }
    } else {
      setSnapshotHistorico(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Selector mes + año + PDF */}
      <div className="flex gap-2 items-center">
        <select
          value={mesSel}
          onChange={async e => { const m = Number(e.target.value); setMesSel(m); await aplicarMes(m, anioSel) }}
          style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '10px 14px' }}
          className="text-white text-sm outline-none focus:border-emerald-500 flex-1"
        >
          {MESES_FULL.map((nombre, i) => <option key={i} value={i + 1}>{nombre}</option>)}
        </select>
        <select
          value={anioSel}
          onChange={async e => { const a = Number(e.target.value); setAnioSel(a); await aplicarMes(mesSel, a) }}
          style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '10px 14px' }}
          className="text-white text-sm outline-none focus:border-emerald-500"
        >
          {[2024, 2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          onClick={() => setDlOrdenPopup(true)}
          id="btn-dl-cartera"
          style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '10px 14px', position: 'relative', overflow: 'hidden' }}
          className="text-white text-lg hover:border-emerald-500 transition-colors"
          title="Descargar PDF cartera"
        >
          📥
          {dlShine && (
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '12px',
              background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)',
              backgroundSize: '200% 100%',
              animation: 'shine-sweep 0.85s linear infinite',
              pointerEvents: 'none',
            }} />
          )}
        </button>

        {dlOrdenPopup && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setDlOrdenPopup(false)}>
            <div className="bg-[#0d1220] border border-[#1e2a3d] rounded-2xl p-5 shadow-2xl" style={{ width: 320 }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-white font-semibold text-sm">Ordenar PDF por</p>
                <button onClick={() => setDlOrdenPopup(false)} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
              </div>
              {([
                { key: 'alfa',        label: '🅰️ Nombre del cliente A-Z' },
                { key: 'asc',         label: '🔼 Por factura  Ascendente' },
                { key: 'desc',        label: '🔽 Por factura  Descendente' },
                { key: 'ciudad_alfa', label: '📌 Ciudad + Nombre cliente A-Z' },
                { key: 'ciudad_desc', label: '📌 Ciudad + Factura Descendente' },
              ] as { key: string, label: string }[]).map(op => (
                <button key={op.key} onClick={async () => {
                  setDlOrdenPopup(false)
                  setDlShine(true)
                  try {
                    const url = isAdmin ? '/api/cartera/pdf/admin' : '/api/cartera/pdf'
                    const r = await fetch(url)
                    if (!r.ok) { alert('Error generando PDF'); return }
                    const d = await r.json()
                    if (op.key === 'alfa') {
                      d.filas.sort((a: any, b: any) => (a.cliente || '').localeCompare(b.cliente || '', 'es', { sensitivity: 'base' }))
                    } else if (op.key === 'asc') {
                      d.filas.sort((a: any, b: any) => parseInt(a.factura || '0', 10) - parseInt(b.factura || '0', 10))
                    } else if (op.key === 'desc') {
                      d.filas.sort((a: any, b: any) => parseInt(b.factura || '0', 10) - parseInt(a.factura || '0', 10))
                    } else if (op.key === 'ciudad_alfa') {
                      d.filas.sort((a: any, b: any) => {
                        const cc = (a.ciudad || '').localeCompare(b.ciudad || '', 'es', { sensitivity: 'base' })
                        return cc !== 0 ? cc : (a.cliente || '').localeCompare(b.cliente || '', 'es', { sensitivity: 'base' })
                      })
                    } else {
                      d.filas.sort((a: any, b: any) => {
                        const cc = (a.ciudad || '').localeCompare(b.ciudad || '', 'es', { sensitivity: 'base' })
                        return cc !== 0 ? cc : parseInt(b.factura || '0', 10) - parseInt(a.factura || '0', 10)
                      })
                    }
                    const { default: jsPDF } = await import('jspdf')
                    const { default: autoTable } = await import('jspdf-autotable')
                    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
                    const fmtNum = (n: number) => n.toLocaleString('es-CO')
                    doc.setFontSize(10); doc.setFont('helvetica', 'bold')
                    doc.text(isAdmin ? `${d.empresa} — Cartera General` : `${d.empresa} — ${d.vendedor}`, 14, 14)
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
                    doc.text(`Generado: ${new Date(d.generadoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, 14, 20)
                    const pageW = doc.internal.pageSize.getWidth()
                    const margin = 5
                    if (isAdmin) {
                      const filasCiudad = d.filas.map((f: any) => { const vparts = (f.vendedor || '').split(' '); const vAbr = vparts.length >= 2 ? `${vparts[0]} ${vparts[vparts.length - 1][0]}.` : f.vendedor; return [f.orden, f.factura, f.electronica, f.fechaFactura, f.cliente, f.direccion, f.celular, f.ciudad, vAbr, fmtNum(f.venta), fmtNum(f.saldo), f.fechaVence, f.edadcartera] })
                      autoTable(doc, {
                        startY: 22, margin: { left: margin, right: margin, top: 5, bottom: 5 },
                        head: [['Orden', 'Factura', 'Elect.', 'F. Fact.', 'Cliente', 'Dirección', 'Celular', 'Ciudad', 'Vendedor', 'Venta', 'Saldo', 'F. Vence', 'Edad']],
                        body: filasCiudad, foot: [['', '', '', '', '', '', '', '', '', 'Total', fmtNum(d.totalSaldo), '', '']],
                        tableWidth: pageW - margin * 2,
                        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'ellipsize', lineWidth: 0.1, lineColor: [220, 220, 220] },
                        headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', lineWidth: 0.1, lineColor: [180, 180, 180] },
                        footStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold' },
                        columnStyles: { 4: { cellWidth: 'auto' }, 5: { cellWidth: 'auto' }, 8: { cellWidth: 22 }, 9: { halign: 'right' }, 10: { halign: 'right' } },
                        ...(['ciudad_alfa', 'ciudad_desc'].includes(op.key) ? (() => { let lastC = ''; return { didDrawCell: (data: any) => { if (data.section === 'body' && data.column.index === 0) { const ca = String(data.row.raw?.[7] ?? ''); if (ca !== lastC && lastC !== '') { doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.2); doc.line(margin, data.cell.y - 0.3, pageW - margin, data.cell.y - 0.3); doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1) }; lastC = ca } } } })() : {}),
                      })
                    } else {
                      const filasVend = d.filas.map((f: any) => [f.orden, f.factura, f.electronica, f.fechaFactura, f.cliente, f.direccion, f.celular, f.ciudad, fmtNum(f.venta), fmtNum(f.saldo), f.fechaVence, f.edadcartera])
                      autoTable(doc, {
                        startY: 22, margin: { left: margin, right: margin, top: 5, bottom: 5 },
                        head: [['Orden', 'Factura', 'Elect.', 'F. Fact.', 'Cliente', 'Dirección', 'Celular', 'Ciudad', 'Venta', 'Saldo', 'F. Vence', 'Edad']],
                        body: filasVend, foot: [['', '', '', '', '', '', '', '', 'Total', fmtNum(d.totalSaldo), '', '']],
                        tableWidth: pageW - margin * 2,
                        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'ellipsize', lineWidth: 0.1, lineColor: [220, 220, 220] },
                        headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', lineWidth: 0.1, lineColor: [180, 180, 180] },
                        footStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold' },
                        columnStyles: { 4: { cellWidth: 'auto' }, 5: { cellWidth: 'auto' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
                        ...(['ciudad_alfa', 'ciudad_desc'].includes(op.key) ? (() => { let lastC = ''; return { didDrawCell: (data: any) => { if (data.section === 'body' && data.column.index === 0) { const ca = String(data.row.raw?.[7] ?? ''); if (ca !== lastC && lastC !== '') { doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.2); doc.line(margin, data.cell.y - 0.3, pageW - margin, data.cell.y - 0.3); doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1) }; lastC = ca } } } })() : {}),
                      })
                    }
                    const fecha = new Date().toISOString().slice(0, 10)
                    const nombre = isAdmin ? 'cartera-general' : `cartera-${d.vendedor.replace(/\s+/g, '-')}`
                    doc.save(`${nombre}-${fecha}.pdf`)
                  } catch (e) { alert('Error: ' + e) } finally { setDlShine(false) }
                }}
                  className="w-full text-left px-4 py-3 rounded-xl mb-2 last:mb-0 transition-colors hover:border-blue-500/50 whitespace-nowrap"
                  style={{ background: '#1a2540', border: '1px solid #1e2a3d' }}>
                  <p className="text-white text-sm font-medium">{op.label}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Meta vendedor */}
      {userRole === 'vendedor' && (
        <div className="rounded-2xl p-4 border fade-up hover-lift" style={{ background: 'linear-gradient(135deg, #064e3b, #065f46)', borderColor: '#065f46' }}>
          <p className="text-xs font-bold text-emerald-300 uppercase tracking-widest mb-3">🎯 Mi meta — {MESES[mes - 1]} {anio}</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><p className="text-emerald-300/70 text-xs mb-0.5">Cartera total</p><p className="text-white font-bold text-base leading-tight">$<CountUp end={Math.round(totalCartera)} /></p></div>
            <div className="text-center"><p className="text-emerald-300/70 text-xs mb-0.5">% asignado</p><p className="text-emerald-300 font-bold text-base leading-tight">{miMetaPct > 0 ? `${miMetaPct}%` : '—'}</p></div>
            <div className="text-right"><p className="text-emerald-300/70 text-xs mb-0.5">Meta</p><p className="text-white font-bold text-base leading-tight">{metaPesos > 0 ? <>$<CountUp end={Math.round(metaPesos)} /></> : '—'}</p></div>
          </div>
          {metaPesos > 0 ? (
            <>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-emerald-300">Cumplimiento</span>
                <span className="text-sm font-black" style={{ color: colorMeta }}>{pctMeta}%</span>
              </div>
              <div className="h-2 bg-black/30 rounded-full overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all" style={{ width: `${pctMeta}%`, background: `linear-gradient(90deg, #059669, ${colorMeta})` }} />
              </div>
              <div className="flex gap-4 text-xs text-emerald-300">
                <span>Recaudo: <span className="text-white font-bold">$<CountUp end={Math.round(totalRecaudadoMes)} /></span></span>
                <span>Desc: <span className="text-white font-bold">{fmt(totalDescMes)}</span></span>
                <span>Falta: <span className="text-white font-bold">{fmt(Math.max(0, metaPesos - totalMes))}</span></span>
              </div>
            </>
          ) : <p className="text-emerald-300/50 text-xs">Sin meta asignada para este mes</p>}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loadingSnapshot && <div className="col-span-2 md:col-span-4 text-center text-xs text-zinc-500 py-2">Cargando snapshot...</div>}
        <div className={`rounded-2xl p-4 hover-lift fade-up stagger-1 ${loadingBusqueda ? 'loading-border' : ''}`} style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)' }}>
          <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide font-bold">Cartera total</p>
          <p className="text-white font-bold text-lg">$<CountUp end={Math.round(snapshotHistorico ? (snapshotHistorico.cartera ?? 0) : totalCartera)} /></p>
          <p className="text-zinc-600 text-xs mt-1">{snapshotHistorico ? 'cierre de mes' : <><CountUp end={totalReal ? totalReal.clientes : carteras.length} /> clientes</>}</p>
        </div>
        <div className={`rounded-2xl p-4 hover-lift fade-up stagger-2 ${loadingBusqueda ? 'loading-border-red' : ''}`} style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)' }}>
          <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide font-bold">Pendiente</p>
          {snapshotHistorico ? (() => {
            const totalH = snapshotHistorico.cartera ?? 0
            const pendH = snapshotHistorico.pendiente ?? 0
            const pctH = totalH > 0 ? Math.round((pendH / totalH) * 100) : 0
            return <><p className="text-red-400 font-bold text-lg">$<CountUp end={Math.round(pendH)} /></p><p className="text-zinc-600 text-xs mt-1">{pctH}% sin cobrar</p></>
          })() : <><p className="text-red-400 font-bold text-lg flex items-center gap-2">$<CountUp end={Math.round(totalPend)} />{totalPend > 0 && <LiveDot color="red" />}</p><p className="text-zinc-600 text-xs mt-1">{totalCartera > 0 ? Math.round((totalPend / totalCartera) * 100) : 0}% sin cobrar</p></>}
        </div>
        <div className={`rounded-2xl p-4 hover-lift fade-up stagger-3 ${loadingBusqueda ? 'loading-border-emerald' : ''}`} style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)' }}>
          <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide font-bold">Recaudado</p>
          <p className="text-emerald-400 font-bold text-lg">$<CountUp end={Math.round(snapshotHistorico ? snapshotHistorico.recaudo : totalMes)} /></p>
          <p className="text-zinc-600 text-xs mt-1">{snapshotHistorico ? 'cierre de mes' : `${pagosMes.length} pagos · ${variacion >= 0 ? '+' : ''}${variacion}% vs ant.`}</p>
        </div>
        <div className={`rounded-2xl p-4 hover-lift fade-up stagger-4 ${loadingBusqueda ? 'loading-border-amber' : ''}`} style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)' }}>
          <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wide font-bold">Descuentos</p>
          <p className="text-orange-400 font-bold text-lg">$<CountUp end={Math.round(snapshotHistorico ? snapshotHistorico.descuento : totalDescMes)} /></p>
          <p className="text-zinc-600 text-xs mt-1">aplicados este mes</p>
        </div>
      </div>

      {/* Grid estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Edades */}
        <div style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 16, padding: 16 }} className={esAdmin ? 'md:col-span-3' : ''}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">📊 Edades de cartera</p>
            {!edadesCargadas && (
              <button onClick={cargarEdades} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#60a5fa', padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {cargandoEdades ? '⏳...' : '📊 Mostrar edades'}
              </button>
            )}
          </div>
          {!edadesCargadas ? (
            <p style={{ color: '#374151', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>Toca "Mostrar edades" para cargar</p>
          ) : esAdmin ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.2)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#9ca3af', fontWeight: 700, fontSize: 17 }}>Vendedor</th>
                    {EDADES.map(e => <th key={e} style={{ textAlign: 'right', padding: '8px 10px', color: '#9ca3af', fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap' }}>{e}</th>)}
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#9ca3af', fontWeight: 700, fontSize: 17 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.entries(porEdadVendedor) as [string, Record<Edad, number>][]).sort((a, b) => {
                    const ta = EDADES.reduce((s, e) => s + (a[1][e] ?? 0), 0)
                    const tb = EDADES.reduce((s, e) => s + (b[1][e] ?? 0), 0)
                    return tb - ta
                  }).map(([nombre, edades]) => {
                    const total = EDADES.reduce((s, e) => s + (edades[e] ?? 0), 0)
                    return (
                      <tr key={nombre} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '7px 10px', color: '#e2e8f0', fontSize: 15, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</td>
                        {EDADES.map(e => (
                          <td key={e} style={{ textAlign: 'right', padding: '7px 10px', fontWeight: (edades[e] ?? 0) > 0 ? 600 : 400, color: (edades[e] ?? 0) > 0 ? (e === '+120' ? '#ef4444' : e === '91-120' ? '#fb923c' : e === '61-90' ? '#fbbf24' : '#e2e8f0') : '#374151', fontSize: 15, whiteSpace: 'nowrap' }}>
                            {(edades[e] ?? 0) > 0 ? fmt(edades[e]) : '—'}
                          </td>
                        ))}
                        <td style={{ textAlign: 'right', padding: '7px 10px', color: '#60a5fa', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>{fmt(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.05)' }}>
                    <td style={{ padding: '8px 10px', color: 'white', fontWeight: 700, fontSize: 17 }}>Total</td>
                    {EDADES.map(e => (
                      <td key={e} style={{ textAlign: 'right', padding: '8px 10px', color: e === '+120' ? '#ef4444' : e === '91-120' ? '#fb923c' : e === '61-90' ? '#fbbf24' : '#60a5fa', fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap' }}>
                        {(porEdad[e] ?? 0) > 0 ? fmt(porEdad[e]) : '—'}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', padding: '8px 10px', color: '#60a5fa', fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap' }}>{fmt(EDADES.reduce((s, e) => s + (porEdad[e] ?? 0), 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const totalEdades = EDADES.reduce((s, e) => s + (porEdad[e] ?? 0), 0)
                return (
                  <>
                    {EDADES.map(e => {
                      const monto = porEdad[e] ?? 0
                      const pct = totalEdades > 0 ? Math.round((monto / totalEdades) * 100) : 0
                      const color = e === '+120' ? '#ef4444' : e === '91-120' ? '#fb923c' : e === '61-90' ? '#fbbf24' : e === '31-60' ? '#fb7185' : '#60a5fa'
                      return (
                        <div key={e}>
                          <div className="flex justify-between items-center mb-1.5">
                            <span style={{ fontSize: 15, color: '#cbd5e1', fontWeight: 500 }}>{e} días</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{fmt(monto)} <span style={{ color: '#6b7280', fontSize: 13 }}>({pct}%)</span></span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#0f2540' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      )
                    })}
                    <div style={{ borderTop: '2px solid rgba(59,130,246,0.4)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 16, color: 'white', fontWeight: 700 }}>Total</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#60a5fa' }}>{fmt(totalEdades)}</span>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </div>

        {/* Reporte histórico edades */}
        {esAdmin && (
          <div className="md:col-span-3" style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 16, padding: 16 }}>
            <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-3">📅 Reporte histórico de edades</p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', width: '100%' }}>
              <div style={{ flex: 2, minWidth: 0 }}>
                <p className="text-zinc-400 text-sm font-semibold mb-2">Inicio</p>
                <select value={snapMesInicio} onChange={e => setSnapMesInicio(Number(e.target.value))} style={{ width: '100%', background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 10, color: 'white', padding: '10px 12px', fontSize: 16 }}>
                  {MESES_FULL.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div style={{ width: 72 }}>
                <p className="text-zinc-400 text-sm font-semibold mb-2">&nbsp;</p>
                <select value={snapAnioInicio} onChange={e => setSnapAnioInicio(Number(e.target.value))} style={{ width: '100%', background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 10, color: 'white', padding: '10px 12px', fontSize: 16 }}>
                  {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div style={{ flex: 2, minWidth: 0 }}>
                <p className="text-zinc-400 text-sm font-semibold mb-2">Fin</p>
                <select value={snapMesFin} onChange={e => setSnapMesFin(Number(e.target.value))} style={{ width: '100%', background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 10, color: 'white', padding: '10px 12px', fontSize: 16 }}>
                  {MESES_FULL.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div style={{ width: 72 }}>
                <p className="text-zinc-400 text-sm font-semibold mb-2">&nbsp;</p>
                <select value={snapAnioFin} onChange={e => setSnapAnioFin(Number(e.target.value))} style={{ width: '100%', background: '#0d1220', border: '1px solid #1e2a3d', borderRadius: 10, color: 'white', padding: '10px 12px', fontSize: 16 }}>
                  {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <button
                disabled={generandoSnap}
                onClick={async () => {
                  setGenerandoSnap(true)
                  try {
                    await fetch('/api/cartera/edades-snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes: mesAnalisis, anio: anioAnalisis }) })
                    const r = await fetch(`/api/cartera/edades-snapshot?mesInicio=${snapMesInicio}&anioInicio=${snapAnioInicio}&mesFin=${snapMesFin}&anioFin=${snapAnioFin}`)
                    const d = await r.json()
                    if (!d.snapshots?.length) { alert('Sin datos. Respuesta: ' + JSON.stringify(d)); return }
                    const { default: jsPDF } = await import('jspdf')
                    const { default: autoTable } = await import('jspdf-autotable')
                    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
                    doc.setFontSize(18); doc.setFont('helvetica', 'bold')
                    doc.text(`Edades de cartera — ${MESES_FULL[snapMesInicio - 1]} ${snapAnioInicio} a ${MESES_FULL[snapMesFin - 1]} ${snapAnioFin}`, 14, 14)
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
                    doc.text(`Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, 14, 20)
                    const vendedoresSet = new Set<string>()
                    for (const s of d.snapshots) for (const v of (s.datos?.vendedores || [])) vendedoresSet.add(v.nombre)
                    const todosVendedores = Array.from(vendedoresSet)
                    const edadesL = ['0-30', '31-60', '61-90', '91-120', '+120']
                    const fmtM = (n: number) => n > 0 ? (n / 1000000).toFixed(2) : '—'
                    const margin3 = 6, mesW = 36, totalColW = 22, edadW = 22
                    const pageW = doc.internal.pageSize.getWidth()
                    const grupos: string[][] = [[todosVendedores[0]]]
                    for (let i = 1; i < todosVendedores.length; i += 2) grupos.push(todosVendedores.slice(i, i + 2))
                    const tblStyles = {
                      styles: { fontSize: 18, cellPadding: { top: 2, bottom: 2, left: 1, right: 1 }, overflow: 'ellipsize', lineWidth: 0.3, lineColor: [0, 0, 0], halign: 'center' as const, fillColor: [255, 255, 255] },
                      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold' as const, lineWidth: 0.3, lineColor: [0, 0, 0], halign: 'center' as const, fontSize: 16, cellPadding: { top: 2, bottom: 2, left: 1, right: 1 } },
                      bodyStyles: { fontSize: 18, cellPadding: { top: 2, bottom: 2, left: 1, right: 1 }, halign: 'center' as const, fillColor: [255, 255, 255], lineWidth: 0.3, lineColor: [0, 0, 0] },
                      alternateRowStyles: { fillColor: [255, 255, 255] },
                    }
                    const buildDeltaTable = (vendedoresGrupo: string[], incluyeTotal: boolean, incluyeMes: boolean) => {
                      const nV = vendedoresGrupo.length
                      const h1: string[] = []; const h2: string[] = []
                      if (incluyeMes) { h1.push('Mes'); h2.push('') }
                      if (incluyeTotal) { h1.push('Total'); h2.push('') }
                      for (const vn of vendedoresGrupo) { h1.push(vn, '', '', '', '', 'Total'); h2.push(...edadesL, '') }
                      const rows: any[] = []
                      d.snapshots.forEach((s: any, idx: number) => {
                        const vMap = new Map((s.datos?.vendedores || []).map((v: any) => [v.nombre, v]))
                        const prev = idx > 0 ? d.snapshots[idx - 1] : null
                        const prevVMap = prev ? new Map((prev.datos?.vendedores || []).map((v: any) => [v.nombre, v])) : null
                        const valRow: any[] = incluyeMes ? [{ content: MESES[s.mes - 1] + ' ' + s.anio, rowSpan: 2, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center' } }] : []
                        let totalMes = 0
                        for (const vn of todosVendedores) { const vd = vMap.get(vn) as any; edadesL.forEach(e => { totalMes += vd?.[e] ?? 0 }) }
                        ;(s as any)._totalMes = totalMes
                        if (incluyeTotal) valRow.push({ content: fmtM(totalMes), styles: { textColor: [37, 99, 235] } })
                        for (const vn of vendedoresGrupo) { const vd = vMap.get(vn) as any; let totalV = 0; edadesL.forEach(e => { const v = vd?.[e] ?? 0; totalV += v; valRow.push(fmtM(v)) }); valRow.push({ content: fmtM(totalV), styles: { textColor: [37, 99, 235] } }) }
                        rows.push(valRow)
                        const deltaRow: any[] = []
                        if (!prevVMap) {
                          for (const vn of vendedoresGrupo) edadesL.forEach(() => deltaRow.push({ content: '•', styles: { halign: 'center', textColor: [150, 150, 150], fontSize: 10, lineWidth: 0 } }))
                          if (incluyeTotal) deltaRow.push({ content: '•', styles: { halign: 'center', textColor: [150, 150, 150], fontSize: 10, lineWidth: 0 } })
                        } else {
                          for (const vn of vendedoresGrupo) {
                            const pvd = prevVMap.get(vn) as any; const cvd = vMap.get(vn) as any
                            edadesL.forEach(e => {
                              const prev2 = pvd?.[e] ?? 0; const cur = cvd?.[e] ?? 0
                              if (prev2 === 0) { deltaRow.push({ content: '—', styles: { halign: 'center', fontSize: 18, lineWidth: 0 } }); return }
                              const pct = Math.round(((cur - prev2) / prev2) * 100); const subio = pct > 0
                              deltaRow.push({ content: (subio ? '+' : '-') + Math.abs(pct) + '%', styles: { halign: 'center', fontSize: 15, textColor: subio ? [220, 38, 38] : [22, 163, 74], lineWidth: 0 } })
                            })
                          }
                          if (incluyeTotal) {
                            const prevTotalMes = (prev as any)._totalMes ?? 0; const curTotalMes = (s as any)._totalMes ?? 0
                            const pct = prevTotalMes > 0 ? Math.round(((curTotalMes - prevTotalMes) / prevTotalMes) * 100) : 0; const subio = pct > 0
                            deltaRow.push({ content: (subio ? '+' : '-') + Math.abs(pct) + '%', styles: { halign: 'center', fontSize: 15, textColor: subio ? [220, 38, 38] : [22, 163, 74], lineWidth: 0 } })
                          }
                        }
                        rows.push(deltaRow)
                      })
                      const colStyles: any = {}; let ci = 0
                      if (incluyeMes) { colStyles[ci] = { cellWidth: mesW, fontStyle: 'bold', halign: 'center' }; ci++ }
                      if (incluyeTotal) { colStyles[ci] = { cellWidth: totalColW, textColor: [37, 99, 235], halign: 'center' }; ci++ }
                      for (let v = 0; v < nV; v++) { for (let e = 0; e < 5; e++) { colStyles[ci] = { cellWidth: edadW }; ci++ }; colStyles[ci] = { cellWidth: totalColW, textColor: [37, 99, 235], halign: 'center' }; ci++ }
                      const tblW = (incluyeMes ? mesW : 0) + (incluyeTotal ? totalColW : 0) + nV * (5 * edadW + totalColW)
                      return {
                        head: [h1, h2], body: rows, tableWidth: tblW, margin: { left: margin3, right: margin3 }, ...tblStyles, columnStyles: colStyles,
                        didParseCell: (data: any) => {
                          data.cell.styles.fillColor = [255, 255, 255]
                          if (data.section === 'head' && data.row.index === 0) {
                            const offset = (incluyeMes ? 1 : 0) + (incluyeTotal ? 1 : 0); const idx = data.column.index
                            if (incluyeTotal && incluyeMes && idx === 1) { data.cell.styles.textColor = [37, 99, 235]; data.cell.styles.halign = 'center' }
                            else if (idx >= offset) { const vIdx = (idx - offset) % 6; if (vIdx === 0) { data.cell.colSpan = 5; data.cell.styles.halign = 'center'; data.cell.styles.fontStyle = 'bold' } else if (vIdx === 5) { data.cell.styles.textColor = [37, 99, 235]; data.cell.styles.halign = 'center' } else { data.cell.text = []; data.cell.styles.lineWidth = 0 } }
                          }
                          if (data.section === 'body') {
                            const esFilaValor = data.row.index % 2 === 0; const esCeldaMes = incluyeMes && data.column.index === 0
                            if (esCeldaMes) { data.cell.styles.lineWidth = 0.3; data.cell.styles.lineColor = [0, 0, 0] }
                            else { data.cell.styles.lineWidth = esFilaValor ? { top: 0.3, right: 0.3, bottom: 0, left: 0.3 } : { top: 0, right: 0.3, bottom: 0.3, left: 0.3 }; data.cell.styles.lineColor = [0, 0, 0] }
                          }
                        },
                      }
                    }
                    for (let g = 0; g < grupos.length; g++) {
                      if (g > 0) doc.addPage()
                      autoTable(doc, { ...buildDeltaTable(grupos[g], g === 0, g === 0), startY: g === 0 ? 30 : 15 } as any)
                    }
                    doc.save(`edades-cartera-${snapMesInicio}-${snapAnioInicio}-a-${snapMesFin}-${snapAnioFin}.pdf`)
                  } catch (e: any) { alert('Error: ' + e.message) } finally { setGenerandoSnap(false) }
                }}
                style={{ alignSelf: 'flex-end', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 10, color: '#60a5fa', padding: '12px 20px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                {generandoSnap ? '⏳ Generando...' : '📥 Descargar PDF'}
              </button>
            </div>
          </div>
        )}

        {/* Por vendedor */}
        {esAdmin && vendedoresMes.length > 0 && (
          <div className="md:col-span-2" style={{ background: '#060a24', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 16, padding: 16 }}>
            <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-3">👥 Por vendedor</p>
            <div className="space-y-5">
              {vendedoresMes.sort((a: any, b: any) => b.monto - a.monto).map((v: any) => {
                const meta = metas.find((m: any) => m.empleadoId === v.id && m.mes === mes && m.anio === anio)
                const carteraV = carteras.filter((cv: any) => cv.empleadoId === v.id).reduce((s: number, cv: any) => s + (cv.DetalleCartera || []).reduce((a: number, d: any) => a + Number(d.valorFactura ?? d.valor ?? 0), 0), 0)
                const metaPctV = meta ? Number(meta.metaPct) : 0
                const metaV = metaPctV > 0 ? Math.round(carteraV * metaPctV / 100) : (meta ? Number(meta.metaPesos) : 0)
                const totalV = v.monto + v.descuento
                const pctV = metaV > 0 ? Math.min(100, Math.round((totalV / metaV) * 100)) : 0
                const colorV = pctV >= 80 ? '#34d399' : pctV >= 50 ? '#fbbf24' : metaV > 0 ? '#f87171' : '#6b7280'
                const vMeses = Array.from({ length: 4 }, (_, i) => {
                  const mv = mes - i; const av = mv <= 0 ? anio - 1 : anio; const mr = mv <= 0 ? mv + 12 : mv
                  const total = pagos.filter((p: any) => p.empleado?.id === v.id && esDelMesBogota(p.createdAt, mr, av)).reduce((s: number, p: any) => s + Number(p.monto) + Number(p.descuento || 0), 0)
                  return { nombre: MESES[mr - 1], total }
                })
                const maxV2 = Math.max(...vMeses.map(vm => vm.total), 1)
                return (
                  <div key={v.id}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-white text-sm font-semibold">{v.nombre}</span>
                      <span className="font-black text-lg" style={{ color: colorV }}>{metaV > 0 ? `${pctV}%` : fmt(totalV)}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-zinc-500 mb-2">
                      {metaV > 0 && <span>Meta: <span className="text-zinc-300">{fmt(metaV)}</span></span>}
                      <span>Recaudó: <span className="text-zinc-300">{fmt(v.monto)}</span></span>
                      {v.descuento > 0 && <span>Desc: <span className="text-orange-400">{fmt(v.descuento)}</span></span>}
                      <span>{v.count} pagos</span>
                    </div>
                    {metaV > 0 && <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: '#0f2540' }}><div className="h-full rounded-full" style={{ width: `${pctV}%`, background: colorV }} /></div>}
                    <div className="space-y-1 mt-1">
                      {vMeses.map((vm, vi) => {
                        const pctBar = Math.round((vm.total / maxV2) * 100); const esEste = vi === 0
                        return (
                          <div key={vi} className="flex items-center gap-2">
                            <span className={`text-xs w-7 flex-shrink-0 ${esEste ? 'text-emerald-400 font-bold' : 'text-zinc-600'}`}>{vm.nombre}</span>
                            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#0c1d35' }}><div className="h-full rounded-full" style={{ width: `${pctBar}%`, background: esEste ? colorV : '#3f3f46' }} /></div>
                            <span className={`text-xs flex-shrink-0 ${esEste ? 'text-zinc-300' : 'text-zinc-600'}`}>{fmt(vm.total)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Relación Transferencias */}
      {isAdmin && (
        <div className="flex justify-end mt-4">
          <button onClick={() => window.location.href = '/cartera/relacion-transferencias'}
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 12, color: '#93c5fd', padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            📋 Relación Transferencias
          </button>
        </div>
      )}
    </div>
  )
}
