import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
    select: { ultimaSync: true, updatedAt: true }
  })

  const totalDeudas = await (prisma as any).syncDeuda.count({
    where: { integracionId: undefined }
  }).catch(() => 0)

  // Contar deudas via integracion
  const integraciones = await (prisma as any).integracion.findMany({
    where: { empresaId, tipo: 'uptres' },
    select: { id: true }
  })
  const intIds = integraciones.map((i: any) => i.id)
  const total = intIds.length > 0
    ? await (prisma as any).syncDeuda.count({ where: { integracionId: { in: intIds } } })
    : 0

  return NextResponse.json({
    ultimaSync: integracion?.ultimaSync ?? null,
    totalDeudas: total,
    tieneIntegracion: !!integracion,
  })
}
