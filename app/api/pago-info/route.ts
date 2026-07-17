import { NextRequest, NextResponse } from 'next/server'

const MASTER_URL = 'http://localhost:3020'

export async function GET(req: NextRequest) {
  const wompiId = req.nextUrl.searchParams.get('id')
  if (!wompiId) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Consulta interna al master (mismo servidor)
  const res = await fetch(`${MASTER_URL}/api/pago-info?id=${wompiId}`, {
    headers: { 'x-internal': 'gestor' },
    cache: 'no-store',
  }).catch(() => null)

  if (!res?.ok) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const data = await res.json()
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
