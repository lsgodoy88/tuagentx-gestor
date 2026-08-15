import { NextRequest, NextResponse } from 'next/server'
import { marcarPlanPagado } from '@/lib/billing/marcarPagado'

// POST — llamado por Master webhook cuando Wompi confirma pago
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-master-secret')
  if (secret !== process.env.MASTER_API_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { empresaId, pagoId, montoPagado, pagoFecha } = await req.json()
  if (!empresaId || !pagoId || !montoPagado) return NextResponse.json({ error: 'empresaId, pagoId y montoPagado requeridos' }, { status: 400 })

  const result = await marcarPlanPagado(empresaId, pagoId, Number(montoPagado), pagoFecha ? new Date(pagoFecha) : undefined)
  return NextResponse.json(result)
}
