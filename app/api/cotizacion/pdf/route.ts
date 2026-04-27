import { NextRequest, NextResponse } from 'next/server'

const ROL_LABELS: Record<string, string> = {
  supervisor:  'Supervisor',
  vendedor:    'Vendedor',
  impulsadora: 'Impulsadora',
  entregas:    'Entrega',
}

function formatCOP(n: number) {
  return '$' + n.toLocaleString('es-CO') + ' COP'
}

interface CotizacionBody {
  empresa:   string
  nit?:      string
  contacto:  string
  telefono?: string
  roles:     Record<string, number>
  precios:   Record<string, number>
  total:     number
}

export async function POST(req: NextRequest) {
  const body: CotizacionBody = await req.json()
  const { empresa, nit, contacto, telefono, roles, precios, total } = body

  if (!empresa || !contacto) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const fecha = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })

  const rolesActivos = Object.entries(roles).filter(([, n]) => n > 0)

  const filasHTML = rolesActivos.map(([rol, n], idx) => {
    const precio   = precios[rol] ?? 0
    const subtotal = precio * n
    const bg       = idx % 2 === 0 ? '#f8fafc' : '#ffffff'
    return `
      <tr style="background:${bg}">
        <td style="padding:10px 14px;font-size:13px;color:#0f172a">${ROL_LABELS[rol] ?? rol}</td>
        <td style="padding:10px 14px;font-size:13px;text-align:center;color:#0f172a">${n}</td>
        <td style="padding:10px 14px;font-size:13px;text-align:right;color:#475569">${formatCOP(precio)}</td>
        <td style="padding:10px 14px;font-size:13px;text-align:right;font-weight:600;color:#0f172a">${formatCOP(subtotal)}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Cotización TuAgentX — ${empresa}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#fff;color:#0f172a;padding:0}
    .page{max-width:720px;margin:0 auto;padding:40px 48px}

    /* Encabezado */
    .header{background:#0a0a1a;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-start;border-radius:10px 10px 0 0}
    .logo{font-size:22px;font-weight:800;color:#fff}
    .logo span{color:#2563eb}
    .logo-sub{font-size:10px;color:#93c5fd;margin-top:4px}
    .header-right{text-align:right}
    .cotizacion-title{font-size:20px;font-weight:800;color:#fff}
    .cotizacion-fecha{font-size:10px;color:#9ca3af;margin-top:4px}

    /* Datos empresa */
    .empresa-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:24px 0 20px}
    .empresa-label{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
    .empresa-nombre{font-size:16px;font-weight:700;color:#0f172a;margin-bottom:4px}
    .empresa-detalle{font-size:11px;color:#64748b}

    /* Tabla */
    .section-label{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px}
    table{width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0}
    thead tr{background:#1e293b}
    thead th{padding:10px 14px;font-size:11px;font-weight:700;color:#fff;text-align:left}
    thead th:nth-child(2){text-align:center}
    thead th:nth-child(3),thead th:nth-child(4){text-align:right}
    tbody tr:last-child td{border-bottom:none}
    tbody td{border-bottom:1px solid #f1f5f9}

    /* Total */
    .total-box{background:#2563eb;border-radius:8px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:16px}
    .total-label{font-size:12px;font-weight:700;color:#bfdbfe;letter-spacing:1px;text-transform:uppercase}
    .total-valor{font-size:22px;font-weight:800;color:#fff}

    /* Nota */
    .nota{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;margin-top:20px}
    .nota-title{font-size:10px;font-weight:700;color:#1d4ed8;margin-bottom:6px}
    .nota-texto{font-size:10px;color:#475569;line-height:1.6}

    /* Footer */
    .footer{text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8}

    /* Botón imprimir — solo en pantalla */
    .print-btn{display:flex;gap:10px;justify-content:center;margin-bottom:28px}
    .btn{padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none}
    .btn-primary{background:#2563eb;color:#fff}
    .btn-secondary{background:#f1f5f9;color:#334155;border:1px solid #e2e8f0}

    @media print{
      .print-btn{display:none!important}
      .page{padding:0}
      .header{border-radius:0}
      body{padding:0}
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="print-btn">
      <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
      <button class="btn btn-secondary" onclick="window.close()">✕ Cerrar</button>
    </div>

    <div class="header">
      <div>
        <div class="logo">TuAgent<span>X</span></div>
        <div class="logo-sub">Gestión de fuerza de campo · tuagentx.com</div>
      </div>
      <div class="header-right">
        <div class="cotizacion-title">COTIZACIÓN</div>
        <div class="cotizacion-fecha">Fecha: ${fecha}</div>
      </div>
    </div>

    <div class="empresa-box">
      <div class="empresa-label">Datos del cliente</div>
      <div class="empresa-nombre">${empresa}</div>
      <div class="empresa-detalle">
        Contacto: ${contacto}${nit ? `&nbsp;&nbsp;·&nbsp;&nbsp;NIT: ${nit}` : ''}${telefono ? `&nbsp;&nbsp;·&nbsp;&nbsp;Tel: ${telefono}` : ''}
      </div>
    </div>

    <div class="section-label">Detalle de roles</div>
    <table>
      <thead>
        <tr>
          <th>Rol</th>
          <th>Cant.</th>
          <th>Precio unit./mes</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>${filasHTML}</tbody>
    </table>

    <div class="total-box">
      <div class="total-label">Total mensual</div>
      <div class="total-valor">${formatCOP(total)}</div>
    </div>

    <div class="nota">
      <div class="nota-title">Condiciones de la cotización</div>
      <div class="nota-texto">
        · Precios en pesos colombianos (COP) &nbsp;·&nbsp; Facturación mensual por usuario activo<br/>
        · Cotización válida por 30 días &nbsp;·&nbsp; Sujeto a disponibilidad del servicio
      </div>
    </div>

    <div class="footer">
      TuAgentX Gestor · Colombia · soporte@tuagentx.com · tuagentx.com<br/>
      Documento generado automáticamente
    </div>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
