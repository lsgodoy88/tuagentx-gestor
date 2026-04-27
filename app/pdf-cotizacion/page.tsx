'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const PDF_CSS = `
  body, html { background: white !important; color: #111 !important; margin: 0; padding: 0; font-family: Arial, sans-serif; }
  * { box-sizing: border-box; }
  @media print { @page { margin: 10mm; size: letter; } .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .wrap { padding: 24px; max-width: 560px; margin: 0 auto; }
  .ph { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1d4ed8; padding-bottom:10px; margin-bottom:20px; }
  .pt { font-size:20px; font-weight:bold; color:#1d4ed8; }
  .ps { font-size:12px; color:#555; margin-top:3px; }
  .pdate { font-size:10px; color:#888; }
  .section { margin-bottom:22px; }
  .section-title { font-size:11px; font-weight:700; color:#1d4ed8; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
  .client-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; }
  .client-field { font-size:12px; color:#444; }
  .client-label { font-size:10px; color:#888; font-weight:600; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  thead th { background:#1d4ed8; color:white; padding:7px 10px; text-align:left; font-size:10.5px; }
  thead th.r { text-align:right; }
  tbody td { padding:6px 10px; border-bottom:1px solid #f0f0f0; color:#222; background:white; }
  tbody td.r { text-align:right; }
  tbody tr:nth-child(even) td { background:#f8faff; }
  .total-row { background:#eff6ff !important; font-weight:bold; }
  .total-box { margin-top:20px; text-align:right; }
  .total-label { font-size:12px; color:#555; font-weight:600; margin-bottom:4px; }
  .total-amount { font-size:28px; font-weight:800; color:#1d4ed8; }
  .nota { margin-top:16px; font-size:10.5px; color:#6b7280; font-style:italic; }
  .ft { text-align:center; font-size:9px; color:#9ca3af; margin-top:24px; padding-top:8px; border-top:1px solid #e5e7eb; }
  .no-print { position:fixed; top:12px; right:12px; z-index:100; display:flex; gap:8px; background:white; padding:8px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.15); }
  .btn-p { background:#1d4ed8; color:white; border:none; padding:7px 14px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:13px; }
  .btn-v { background:#6b7280; color:white; border:none; padding:7px 14px; border-radius:6px; cursor:pointer; font-size:13px; }
`

const ROLES_LABEL: Record<string, string> = {
  supervisor:  'Supervisores',
  vendedor:    'Vendedores',
  impulsadora: 'Impulsadoras',
  entregas:    'Entregas',
}

function CotizacionPDFContent() {
  const params  = useSearchParams()
  const empresa  = params.get('empresa')  || ''
  const nit      = params.get('nit')      || ''
  const contacto = params.get('contacto') || ''
  const telefono = params.get('telefono') || ''
  const totalStr = params.get('total')    || '0'

  let roles: Record<string, { cantidad: number; precio: number }> = {}
  try {
    const raw = JSON.parse(params.get('roles') || '{}')
    roles = raw
  } catch {}

  const total = Number(totalStr)
  const fmt   = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
  const fecha = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })

  const filas = Object.entries(roles).filter(([, v]) => v.cantidad > 0)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PDF_CSS }} />
      <div className="no-print">
        <button className="btn-p" onClick={() => window.print()}>🖨️ Imprimir / Guardar PDF</button>
        <button className="btn-v" onClick={() => window.close()}>✕ Cerrar</button>
      </div>
      <div className="wrap">
        {/* Header */}
        <div className="ph">
          <div>
            <div className="pt">TuAgentX Gestor</div>
            <div className="ps">Cotización Comercial</div>
          </div>
          <div className="pdate">{fecha}</div>
        </div>

        {/* Datos cliente */}
        <div className="section">
          <div className="section-title">Datos del cliente</div>
          <div className="client-grid">
            <div>
              <div className="client-label">Empresa</div>
              <div className="client-field">{empresa || '—'}</div>
            </div>
            <div>
              <div className="client-label">NIT</div>
              <div className="client-field">{nit || '—'}</div>
            </div>
            <div>
              <div className="client-label">Contacto</div>
              <div className="client-field">{contacto || '—'}</div>
            </div>
            <div>
              <div className="client-label">Teléfono</div>
              <div className="client-field">{telefono || '—'}</div>
            </div>
          </div>
        </div>

        {/* Tabla de roles */}
        <div className="section">
          <div className="section-title">Detalle de servicios</div>
          <table>
            <thead>
              <tr>
                <th>Rol</th>
                <th className="r" style={{ width: 80 }}>Cantidad</th>
                <th className="r" style={{ width: 110 }}>Precio unitario</th>
                <th className="r" style={{ width: 110 }}>Subtotal / mes</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(([rol, v]) => (
                <tr key={rol}>
                  <td>{ROLES_LABEL[rol] ?? rol}</td>
                  <td className="r">{v.cantidad}</td>
                  <td className="r">{fmt(v.precio)}</td>
                  <td className="r">{fmt(v.cantidad * v.precio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="total-box">
          <div className="total-label">Total mensual</div>
          <div className="total-amount">{fmt(total)}</div>
        </div>

        <div className="nota">Precios en COP &nbsp;·&nbsp; Vigencia 30 días</div>

        <div className="ft">gestor.tuagentx.com</div>
      </div>
    </>
  )
}

export default function CotizacionPDFPage() {
  return (
    <Suspense fallback={<div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Arial', color:'#555' }}>Generando cotización...</div>}>
      <CotizacionPDFContent />
    </Suspense>
  )
}
