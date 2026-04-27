import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ conectado: false })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ conectado: false })
  const empresaId = user.id

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })

  if (!integracion) return NextResponse.json({ conectado: false })

  const config = integracion.config as any

  return NextResponse.json({
    conectado: true,
    nombre: config?.nombre ?? '',
    email: config?.email ?? '',
    syncInicial: integracion.syncInicial ?? false,
    ultimaSync: integracion.ultimaSync
      ? new Date(integracion.ultimaSync).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
      : '',
  })
}
