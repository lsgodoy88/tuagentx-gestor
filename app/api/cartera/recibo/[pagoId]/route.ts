import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { getReciboDetalle } from '@/lib/cartera/recibo-detalle'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pagoId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { pagoId } = await params

  const result = await getReciboDetalle(getEmpresaId(user), pagoId)
  if (!result) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 403 })
  return NextResponse.json(result)
}
