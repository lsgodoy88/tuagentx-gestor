'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

const PDF_CSS = `
  body, html { background: white !important; color: #111 !important; margin: 0; padding: 0; font-family: Arial, sans-serif; overflow: hidden; }
  * { box-sizing: border-box; }
  @media print { @page { margin: 10mm; size: letter; } .bar-bottom { display: none !important; } .scroll-zone { overflow: visible !important; } body { overflow: visible; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .wrap { padding: 24px; max-width: 480px; margin: 0; }
  .ph { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1d4ed8; padding-bottom:8px; margin-bottom:16px; }
  .pt { font-size:18px; font-weight:bold; color:#1d4ed8; }
  .ps { font-size:11px; color:#555; margin-top:2px; }
  .pdate { font-size:10px; color:#888; }
  .ib { margin-bottom:20px; page-break-inside:avoid; border:1px solid #bfdbfe; border-radius:6px; overflow:hidden; }
  .in { display:flex; justify-content:space-between; align-items:center; background:white; padding:7px 12px; border-bottom:1px solid #dbeafe; }
  .in-name { font-size:14px; font-weight:bold; color:#1e3a8a; }
  .in-total { font-size:12px; color:#1e40af; font-weight:bold; }
  table { width:100%; border-collapse:collapse; font-size:10.5px; }
  thead th { background:white; color:#1d4ed8; padding:4px 6px; text-align:left; font-size:10px; border-bottom:2px solid #1d4ed8; }
  thead th.r { text-align:right; }
  td { padding:3px 6px; border-bottom:1px solid #f3f4f6; color:#111; background:white; }
  tr.dia-row td { background:#eff6ff; color:#1e3a8a; font-weight:bold; font-size:10.5px; padding:4px 6px; border-top:1px solid #bfdbfe; border-bottom:1px solid #bfdbfe; }
  tr.dia-row td.r { text-align:right; }
  tr:nth-child(even) td { background:#f9fafb; }
  tr.dia-row td, tr.dia-row + tr td { background:#eff6ff !important; }
  tr.dia-row + tr td { background:white !important; }
  .ft { text-align:center; font-size:9px; color:#9ca3af; margin-top:20px; padding-top:8px; border-top:1px solid #e5e7eb; }
  .btn-p { background:#1d4ed8; color:white; border:none; padding:9px 18px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:13px; }
  .btn-v { background:#6b7280; color:white; border:none; padding:9px 18px; border-radius:8px; cursor:pointer; font-size:13px; }
`

function ImpulsoPDFContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const fecha = params.get('fecha') || new Date().toISOString().slice(0, 7) + '-01'
  const [datos, setDatos] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/impulso/pdf?fecha=' + fecha)
      .then(r => r.json())
      .then(d => { setDatos(d); setLoading(false) })
  }, [fecha])

  useEffect(() => {
    if (!datos) return
    setTimeout(() => window.print(), 400)
  }, [datos])

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
  const color = (pct: number | null) => pct === null ? '#6b7280' : pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Arial', background:'white', color:'#555' }}>
      Generando reporte...
    </div>
  )
  if (!datos) return null

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PDF_CSS }} />

      {/* Layout: flex column height:100vh */}
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Zona superior scrolleable */}
        <div className="scroll-zone" style={{ flex: 1, overflowY: 'auto', background: 'white' }}>
          <div className="wrap">
            <div className="ph">
              <div>
                <div className="pt">Reporte de Metas - Impulsadoras</div>
                <div className="ps">{datos.mes} &nbsp;·&nbsp; {datos.impulsadoras?.length} impulsadora{datos.impulsadoras?.length !== 1 ? 's' : ''}</div>
              </div>
              <div className="pdate">{new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}</div>
            </div>

            {datos.impulsadoras?.map((imp: any) => (
              <div key={imp.id} className="ib">
                <div className="in">
                  <span className="in-name">{imp.nombre}</span>
                  <span className="in-total" style={{ color: color(imp.pctTotal) }}>
                    {fmt(imp.totalMes)} / {fmt(imp.totalMeta)}
                    {imp.pctTotal !== null && <span style={{ marginLeft:10, fontSize:14 }}>{imp.pctTotal}%</span>}
                  </span>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th className="r" style={{width:'80px'}}>Meta</th>
                      <th className="r" style={{width:'80px'}}>Ventas</th>
                      <th className="r" style={{width:'36px'}}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imp.semana?.map((dia: any) => (
                      <>
                        <tr key={'dia-' + dia.dia} className="dia-row">
                          <td>{dia.nombre}</td>
                          <td className="r">{dia.totalMeta > 0 ? fmt(dia.totalMeta) : ''}</td>
                          <td className="r">{dia.totalMes > 0 ? fmt(dia.totalMes) : ''}</td>
                          <td className="r" style={{ color: color(dia.pctTotal) }}>
                            {dia.pctTotal !== null ? dia.pctTotal + '%' : ''}
                          </td>
                        </tr>
                        {dia.puntos?.map((p: any, i: number) => (
                          <tr key={'p-' + dia.dia + '-' + i}>
                            <td>
                              <span style={{fontWeight:500}}>{p.nombre}</span>
                              {p.nombreComercial && <span style={{color:'#6b7280', fontSize:9.5}}> — {p.nombreComercial}</span>}
                            </td>
                            <td style={{textAlign:'right', color:'#b45309', fontWeight:600}}>{p.meta > 0 ? fmt(p.meta) : '—'}</td>
                            <td style={{textAlign:'right', color:'#1d4ed8', fontWeight:600}}>{p.montoMes > 0 ? fmt(p.montoMes) : '—'}</td>
                            <td style={{textAlign:'right', fontWeight:'bold', color:color(p.pct)}}>{p.pct !== null ? p.pct+'%' : '—'}</td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="ft">Reporte generado automaticamente · gestor.tuagentx.com</div>
          </div>
        </div>{/* /scroll-zone */}

        {/* Zona inferior fija — oculta al imprimir */}
        <div className="bar-bottom" style={{ flexShrink: 0, background: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', justifyContent: 'center', gap: 12 }}>
          <button className="btn-p" onClick={() => window.print()}>🖨️ Imprimir</button>
          {isIOS && (
            <button className="btn-p" style={{ background: '#3b82f6' }} onClick={async () => {
              if (navigator.share) {
                try { await navigator.share({ title: 'Reporte Impulsadoras', url: window.location.href }) } catch {}
              } else {
                window.print()
              }
            }}>📲 Compartir</button>
          )}
          <button className="btn-v" onClick={() => router.back()}>✕ Cerrar</button>
        </div>

      </div>{/* /layout */}
    </>
  )
}

export default function ImpulsoPDFPage() {
  return <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'Arial',color:'#555'}}>Cargando...</div>}><ImpulsoPDFContent /></Suspense>
}
