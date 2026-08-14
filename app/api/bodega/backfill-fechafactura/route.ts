import { NextRequest, NextResponse } from 'next/server'
import { backfillFechaFactura } from '@/lib/bodega/backfill-fechafactura'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const result = await backfillFechaFactura({
    empresaId: body.empresaId,
    limite: parseInt(body.limite || '50'),
  })

  return NextResponse.json(result)
}
