import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pagoId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (!['empresa', 'supervisor'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { pagoId } = await params
  const body = await req.json()
  const { accion } = body

  if (accion !== 'enviar') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  }

  const pago = await prisma.pagoCartera.findUnique({
    where: { id: pagoId },
    include: { Cartera: { select: { empresaId: true } } },
  })
  if (!pago) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  if (pago.Cartera.empresaId !== empresaId) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  // Simulated external API response
  const envioRef = `REF-${Date.now()}`
  const envioEstado = 'enviado'

  await prisma.pagoCartera.update({
    where: { id: pagoId },
    data: {
      envioEstado,
      envioFecha: new Date(),
      envioRef,
    },
  })

  return NextResponse.json({ ok: true, envioEstado, envioRef })
}
