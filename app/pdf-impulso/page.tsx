'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

const PDF_CSS = `
  body, html { background: white !important; color: #111 !important; margin: 0; padding: 0; font-family: Arial, sans-serif; overflow: hidden; }
  * { box-sizing: border-box; }
  @media print {
    @page { margin: 8mm; size: letter landscape; }
    .bar-bottom { display: none !important; }
    .scroll-zone { overflow: visible !important; }
    body { overflow: visible; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-layout { height: auto !important; display: block !important; overflow: visible !important; }
    .bar-bottom { display: none !important; }
    .page-break { page-break-before: always; }
  }
  .wrap { padding: 16px 20px; }
  .ph { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1d4ed8; padding-bottom:6px; margin-bottom:14px; }
  .pt { font-size:16px; font-weight:bold; color:#1d4ed8; }
  .ps { font-size:10px; color:#555; margin-top:2px; }
  .pdate { font-size:10px; color:#888; }
  .ib { margin-bottom:18px; page-break-inside:avoid; border:1px solid #bfdbfe; border-radius:6px; overflow:hidden; }
  .in { display:flex; justify-content:space-between; align-items:center; background:white; padding:6px 10px; border-bottom:1px solid #dbeafe; }
  .in-name { font-size:13px; font-weight:bold; color:#1e3a8a; }
  .in-total { font-size:11px; color:#1e40af; font-weight:bold; }
  table { width:100%; border-collapse:collapse; font-size:9.5px; }
  thead th { background:#eff6ff; color:#1d4ed8; padding:3px 5px; text-align:center; font-size:9px; border:1px solid #bfdbfe; }
  thead th.left { text-align:left; }
  td { padding:3px 5px; border:1px solid #e5e7eb; color:#111; background:white; vertical-align:middle; }
  td.r { text-align:right; }
  td.c { text-align:center; }
  tr.dia-row td { background:#eff6ff; color:#1e3a8a; font-weight:bold; font-size:9.5px; }
  tr:nth-child(even) td { background:#f9fafb; }
  tr.dia-row td { background:#eff6ff !important; }
  .ft { text-align:center; font-size:8px; color:#9ca3af; margin-top:14px; padding-top:6px; border-top:1px solid #e5e7eb; }
  .btn-p { background:#1d4ed8; color:white; border:none; padding:9px 18px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:13px; }
  .btn-v { background:#6b7280; color:white; border:none; padding:9px 18px; border-radius:8px; cursor:pointer; font-size:13px; }
  .pct-green { color:#16a34a; font-weight:bold; }
  .pct-amber { color:#d97706; font-weight:bold; }
  .pct-red   { color:#dc2626; font-weight:bold; }
`

function labelMes(ym: string) {
  const [a, m] = ym.split('-').map(Number)
  const d = new Date(a, m - 1, 1)
  return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

function pctClass(pct: number | null) {
  if (pct === null) return ''
  if (pct >= 80) return 'pct-green'
  if (pct >= 50) return 'pct-amber'
  return 'pct-red'
}

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CO') }

function ImpulsoPDFContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const fecha = params.get('fecha') || new Date().toISOString().slice(0, 7) + '-01'
  const hasta = params.get('hasta')
  const [datos, setDatos] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    const url = hasta
      ? `/api/impulso/pdf?fecha=${fecha}&hasta=${hasta}`
      : `/api/impulso/pdf?fecha=${fecha}`
    fetch(url).then(r => r.json())
      .then(d => { setDatos(d); setLoading(false) })
      .catch(() => { setDatos({ meses: [], impulsadoras: [] }); setLoading(false) })
  }, [fecha, hasta, status])

  useEffect(() => {
    if (!datos) return
    // Nombre del archivo: Impulso-[ImpNombre]-[MesDesde]-[MesHasta]
    const impNombres = (datos.impulsadoras || [])
      .map((i: any) => {
        const parts = (i.nombre || '').trim().split(' ')
        return parts[0] + (parts[1] ? parts[1][0] : '')
      })
      .join('-')
    const mesesLabel = datos.rango && datos.meses?.length > 1
      ? datos.meses[0].replace('-', '-') + '-' + datos.meses[datos.meses.length - 1].replace('-', '-')
      : (fecha.slice(0, 7))
    document.title = `Impulso-${impNombres || 'Reporte'}-${mesesLabel}`
    const isMobile = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)
    if (!isMobile) setTimeout(() => window.print(), 400)
  }, [datos])

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Arial', background:'white', color:'#555' }}>
      Generando reporte...
    </div>
  )
  if (!datos) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Arial', color:'#dc2626' }}>
      Error al generar el reporte
    </div>
  )

  // ── Modo rango ──
  if (datos.rango && datos.meses?.length > 0) {
    const meses: string[] = datos.meses
    const impulsadoras: any[] = datos.impulsadoras || []

    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: PDF_CSS }} />
        <div className="print-layout" style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div className="scroll-zone" style={{ flex:1, overflowY:'auto', background:'white' }}>
            <div className="wrap">
              <div className="ph">
                <div>
                  <div className="pt">Reporte de Metas — Impulsadoras</div>
                  <div className="ps">{labelMes(meses[0])} → {labelMes(meses[meses.length - 1])} &nbsp;·&nbsp; {impulsadoras.length} impulsadora{impulsadoras.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="pdate">{new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}</div>
              </div>

              {impulsadoras.map((imp: any, impIdx: number) => {
                // Construir lista única de (dia, cliente) desde semana
                const filas: { diaNombre: string; nombre: string; nombreComercial?: string; clienteKey: string; meta: number }[] = []
                const diasVistos: string[] = []
                for (const dia of (imp.semana || [])) {
                  if (!dia.puntos?.length) continue
                  diasVistos.push(dia.nombre)
                  for (const p of dia.puntos) {
                    filas.push({
                      diaNombre: dia.nombre,
                      nombre: p.nombre,
                      nombreComercial: p.nombreComercial,
                      clienteKey: p.clienteId ?? p.nombre,
                      meta: p.meta ?? 0,
                    })
                  }
                }

                // rowSpan por día
                const spanPorDia: Record<string, number> = {}
                for (const f of filas) spanPorDia[f.diaNombre] = (spanPorDia[f.diaNombre] || 0) + 1
                const diaUsado: Record<string, boolean> = {}

                return (
                  <div key={imp.id} className={`ib${impIdx > 0 ? ' page-break' : ''}`}>
                    <div className="in">
                      <span className="in-name">{imp.nombre}</span>
                      <span style={{fontSize:10,color:'#64748b'}}>{filas.length} puntos</span>
                    </div>

                    <div style={{ overflowX:'auto' }}>
                      <table>
                        <thead>
                          {/* Fila 1: Día | Cliente | [MesN x3] */}
                          <tr>
                            <th className="left" rowSpan={2} style={{ width:60 }}>Día</th>
                            <th className="left" rowSpan={2}>Cliente</th>
                            {meses.map(ym => (
                              <th key={ym} colSpan={3} style={{ borderLeft:'2px solid #93c5fd' }}>{labelMes(ym)}</th>
                            ))}
                          </tr>
                          {/* Fila 2: sub-headers Meta/Venta/% por mes */}
                          <tr>
                            {meses.map(ym => (
                              <>
                                <th key={ym+'-m'} style={{ borderLeft:'2px solid #93c5fd', width:80 }}>Meta</th>
                                <th key={ym+'-v'} style={{ width:80 }}>Venta</th>
                                <th key={ym+'-p'} style={{ width:36 }}>%</th>
                              </>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filas.map((f, i) => {
                            const esPrimeroDia = !diaUsado[f.diaNombre]
                            if (esPrimeroDia) diaUsado[f.diaNombre] = true
                            return (
                              <tr key={i}>
                                {esPrimeroDia && (
                                  <td rowSpan={spanPorDia[f.diaNombre]} style={{
                                    textAlign:'center', verticalAlign:'middle',
                                    fontWeight:700, color:'#1e3a8a', fontSize:9,
                                    background:'#eff6ff', borderRight:'2px solid #93c5fd',
                                    textTransform:'uppercase', letterSpacing:'0.04em',
                                  }}>
                                    {f.diaNombre}
                                  </td>
                                )}
                                <td>
                                  <span style={{ fontWeight:500 }}>{f.nombre}</span>
                                  {f.nombreComercial && <span style={{ color:'#6b7280', fontSize:8.5 }}> — {f.nombreComercial}</span>}
                                </td>
                                {meses.map(ym => {
                                  const ventasPorCliente = imp.meses?.[ym]?.ventasPorCliente ?? {}
                                  const venta = ventasPorCliente[f.clienteKey] ?? 0
                                  const pct = f.meta > 0 ? Math.round((venta / f.meta) * 100) : null
                                  return (
                                    <>
                                      <td key={ym+'-m'} className="r" style={{ color:'#b45309', fontWeight:600, borderLeft:'2px solid #dbeafe' }}>
                                        {f.meta > 0 ? fmt(f.meta) : '—'}
                                      </td>
                                      <td key={ym+'-v'} className="r" style={{ color:'#1d4ed8', fontWeight:600 }}>
                                        {venta > 0 ? fmt(venta) : '—'}
                                      </td>
                                      <td key={ym+'-p'} className={`r ${pctClass(pct)}`}>
                                        {pct !== null ? pct + '%' : '—'}
                                      </td>
                                    </>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        {/* Totales */}
                        <tr style={{borderTop:'2px solid #1d4ed8',background:'#eff6ff'}}>
                          <td colSpan={2} style={{fontWeight:700,color:'#1e3a8a',fontSize:9,textTransform:'uppercase',letterSpacing:'0.04em'}}>Total</td>
                          {meses.map(ym => {
                            const md = imp.meses?.[ym]
                            return (
                              <>
                                <td key={ym+'-tm'} className="r" style={{color:'#b45309',fontWeight:700,borderLeft:'2px solid #dbeafe'}}>{md ? fmt(md.totalMeta) : '—'}</td>
                                <td key={ym+'-tv'} className="r" style={{color:'#1d4ed8',fontWeight:700}}>{md ? fmt(md.totalMes) : '—'}</td>
                                <td key={ym+'-tp'} className={'r '+pctClass(md?.pctTotal??null)} style={{fontWeight:700}}>{md?.pctTotal!=null?md.pctTotal+'%':'—'}</td>
                              </>
                            )
                          })}
                        </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}

              <div className="ft">Reporte generado automáticamente · gestor.tuagentx.com</div>
            </div>
          </div>

          <div className="bar-bottom" style={{ flexShrink:0, background:'#f9fafb', borderTop:'1px solid #e5e7eb', padding:'12px 16px', display:'flex', justifyContent:'center', gap:12 }}>
            <button className="btn-p" onClick={() => window.print()}>🖨️ Imprimir</button>
            {isIOS && (
              <button className="btn-p" style={{ background:'#3b82f6' }} onClick={async () => {
                if (navigator.share) { try { await navigator.share({ title:'Reporte Impulsadoras', url:window.location.href }) } catch {} }
                else window.print()
              }}>📲 Compartir</button>
            )}
            <button className="btn-v" onClick={() => router.back()}>✕ Cerrar</button>
          </div>
        </div>
      </>
    )
  }

  // ── Modo mes único (original) ──
  const color = (pct: number | null) => pct === null ? '#6b7280' : pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PDF_CSS }} />
      <div className="print-layout" style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div className="scroll-zone" style={{ flex:1, overflowY:'auto', background:'white' }}>
          <div className="wrap">
            <div className="ph">
              <div>
                <div className="pt">Reporte de Metas — Impulsadoras</div>
                <div className="ps">{datos.mes} &nbsp;·&nbsp; {datos.impulsadoras?.length} impulsadora{datos.impulsadoras?.length !== 1 ? 's' : ''}</div>
              </div>
              <div className="pdate">{new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}</div>
            </div>

            {datos.impulsadoras?.map((imp: any) => (
              <div key={imp.id} className="ib">
                <div className="in">
                  <span className="in-name">{imp.nombre}</span>
                  <span style={{fontSize:10,color:'#64748b'}}>{(imp.semana||[]).reduce((a:number,d:any)=>a+(d.puntos?.length||0),0)} puntos</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th className="left" style={{width:60}}>Día</th>
                      <th className="left">Cliente</th>
                      <th style={{width:80}}>Meta</th>
                      <th style={{width:80}}>Ventas</th>
                      <th style={{width:36}}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const spanPorDia: Record<string, number> = {}
                      const diaUsado: Record<string, boolean> = {}
                      for (const dia of (imp.semana || [])) {
                        if (dia.puntos?.length) spanPorDia[dia.nombre] = dia.puntos.length
                      }
                      return imp.semana?.map((dia: any) =>
                        dia.puntos?.map((p: any, i: number) => {
                          const esPrimero = !diaUsado[dia.nombre]
                          if (esPrimero) diaUsado[dia.nombre] = true
                          return (
                            <tr key={`${dia.dia}-${i}`}>
                              {esPrimero && (
                                <td rowSpan={spanPorDia[dia.nombre]} style={{
                                  textAlign:'center', verticalAlign:'middle',
                                  fontWeight:700, color:'#1e3a8a', fontSize:9,
                                  background:'#eff6ff', borderRight:'2px solid #93c5fd',
                                  textTransform:'uppercase',
                                }}>
                                  {dia.nombre}
                                </td>
                              )}
                              <td>
                                <span style={{fontWeight:500}}>{p.nombre}</span>
                                {p.nombreComercial && <span style={{color:'#6b7280', fontSize:9}}> — {p.nombreComercial}</span>}
                              </td>
                              <td className="r" style={{color:'#b45309', fontWeight:600}}>{p.meta > 0 ? fmt(p.meta) : '—'}</td>
                              <td className="r" style={{color:'#1d4ed8', fontWeight:600}}>{p.montoMes > 0 ? fmt(p.montoMes) : '—'}</td>
                              <td className={`r ${pctClass(p.pct)}`}>{p.pct !== null ? p.pct+'%' : '—'}</td>
                            </tr>
                          )
                        })
                      )
                    })()}
                    {/* Totales */}
                    <tr style={{borderTop:'2px solid #1d4ed8',background:'#eff6ff'}}>
                      <td colSpan={2} style={{fontWeight:700,color:'#1e3a8a',fontSize:9,textTransform:'uppercase',letterSpacing:'0.04em'}}>Total</td>
                      <td className="r" style={{color:'#b45309',fontWeight:700}}>{fmt(imp.totalMeta)}</td>
                      <td className="r" style={{color:'#1d4ed8',fontWeight:700}}>{fmt(imp.totalMes)}</td>
                      <td className={'r '+pctClass(imp.pctTotal)} style={{fontWeight:700}}>{imp.pctTotal!=null?imp.pctTotal+'%':'—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            <div className="ft">Reporte generado automáticamente · gestor.tuagentx.com</div>
          </div>
        </div>

        <div className="bar-bottom" style={{ flexShrink:0, background:'#f9fafb', borderTop:'1px solid #e5e7eb', padding:'12px 16px', display:'flex', justifyContent:'center', gap:12 }}>
          <button className="btn-p" onClick={() => window.print()}>🖨️ Imprimir</button>
          {isIOS && (
            <button className="btn-p" style={{ background:'#3b82f6' }} onClick={async () => {
              if (navigator.share) { try { await navigator.share({ title:'Reporte Impulsadoras', url:window.location.href }) } catch {} }
              else window.print()
            }}>📲 Compartir</button>
          )}
          <button className="btn-v" onClick={() => router.back()}>✕ Cerrar</button>
        </div>
      </div>
    </>
  )
}

export default function ImpulsoPDFPage() {
  return (
    <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'Arial',color:'#555'}}>Cargando...</div>}>
      <ImpulsoPDFContent />
    </Suspense>
  )
}
