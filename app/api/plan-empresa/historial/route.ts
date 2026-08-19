import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const historial = await (prisma as any).planEmpresa.findMany({
    where: { empresaId },
    orderBy: { mes: 'desc' },
    select: { mes: true, monto: true, saldo: true, estado: true, fechaLimite: true, pagoFecha: true, voucherNum: true, voucherTipo: true },
    take: 6,
  })

  return NextResponse.json({ historial })
}
