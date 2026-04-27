import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { monto, nombre, email } = await req.json()

  if (!monto || monto <= 0) {
    return NextResponse.json({ error: 'Falta campo: monto' }, { status: 400 })
  }

  const secret = process.env.MASTER_API_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Configuración interna incompleta' }, { status: 500 })
  }

  const res = await fetch('http://localhost:3020/api/pagos/crear-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`,
    },
    body: JSON.stringify({
      empresaTipo:   'GESTOR',
      monto,
      planDias:      30,
      origenPublico: true,
      nombre:        nombre ?? null,
      email:         email ?? null,
    }),
  })

  const bodyText = await res.text()
  if (!res.ok) {
    let msg = 'Error al generar el link de pago'
    try { msg = JSON.parse(bodyText).error ?? msg } catch {}
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const data = JSON.parse(bodyText)
  return NextResponse.json({ linkPago: data.linkPago })
}
