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
    select: { id: true, ultimaSync: true, updatedAt: true, syncInicial: true, config: true }
  })

  const intIds = integracion ? [integracion.id] : []
  const total = intIds.length > 0
    ? await (prisma as any).syncDeuda.count({ where: { integracionId: { in: intIds } } })
    : 0

  return NextResponse.json({
    // Para cartera/rutas-fijas
    ultimaSync: integracion?.ultimaSync ?? null,
    totalDeudas: total,
    tieneIntegracion: !!integracion,
    // Para configuración
    conectado: !!integracion,
    syncInicial: integracion?.syncInicial ?? false,
    nombre: (integracion?.config as any)?.nombre ?? 'API UpTres',
  })
}
