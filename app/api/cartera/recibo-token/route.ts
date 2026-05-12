import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { pagoId } = await req.json()
  if (!pagoId) return NextResponse.json({ error: 'pagoId requerido' }, { status: 400 })

  // Verificar que el pago pertenece a la empresa (Cartera manual o Empleado sync)
  const pago = await (prisma as any).pagoCartera.findFirst({
    where: {
      id: pagoId,
      OR: [
        { Cartera: { empresaId } },
        { AND: [{ carteraId: null }, { Empleado: { empresaId } }] },
      ],
    },
    include: {
      Cartera: { include: { Empresa: { select: { configRecibos: true } } } },
      Empleado: { include: { empresa: { select: { configRecibos: true } } } },
    }
  })
  if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

  // Generar nuevo token 15 minutos
  const reciboToken = randomBytes(24).toString('hex')
  const tokenExpira = new Date(Date.now() + 15 * 60 * 1000)

  await prisma.pagoCartera.update({
    where: { id: pagoId },
    data: { reciboToken, tokenExpira }
  })

  const cfg = ((pago as any)?.Cartera?.Empresa?.configRecibos || (pago as any)?.Empleado?.empresa?.configRecibos) as any
  const anchoPapel = cfg?.anchoPapel || '80mm'
  return NextResponse.json({ reciboToken, tokenExpira, anchoPapel })
}
