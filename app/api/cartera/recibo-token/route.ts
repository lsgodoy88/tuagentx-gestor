import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { generarTokenParaPago } from '@/lib/cartera/recibo-token'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { pagoId } = await req.json()
  if (!pagoId) return NextResponse.json({ error: 'pagoId requerido' }, { status: 400 })

  const result = await generarTokenParaPago(getEmpresaId(user), pagoId)
  if (!result) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  return NextResponse.json(result)
}
