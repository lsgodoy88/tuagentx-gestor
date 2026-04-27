import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ conectado: false })
  const user = session.user as any
  if (user.role === 'empresa' || user.role === 'superadmin') {
    return NextResponse.json({ conectado: false })
  }

  const empleado = await prisma.empleado.findUnique({
    where: { id: user.id },
    select: { uptresEmail: true, uptresPassword: true },
  })

  const conectado = !!(empleado?.uptresEmail && empleado?.uptresPassword)
  return NextResponse.json({ conectado, email: conectado ? empleado!.uptresEmail : null })
}
