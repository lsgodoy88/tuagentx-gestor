import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
    select: { id: true, ultimaSync: true, ultimaSyncCompleta: true, updatedAt: true, syncInicial: true, config: true }
  })

  const intIds = integracion ? [integracion.id] : []
  const total = intIds.length > 0
    ? await (prisma as any).syncDeuda.count({ where: { integracionId: { in: intIds } } })
    : 0

  // Historial sync — últimas 10 ejecuciones
  const historial = integracion ? await (prisma as any).syncLog.findMany({
    where: { integracionId: integracion.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      inicio: true,
      fin: true,
      duracionMs: true,
      clientesActualizados: true,
      empleadosSincronizados: true,
      deudasSincronizadas: true,
      zombis: true,
      pagosConfrontados: true,
      disparadoPor: true,
      estado: true,
      errores: true,
    }
  }) : []

  return NextResponse.json({
    ultimaSync: integracion?.ultimaSync ?? null,
    ultimaSyncCompleta: (integracion as any)?.ultimaSyncCompleta ?? null,
    totalDeudas: total,
    tieneIntegracion: !!integracion,
    conectado: !!integracion,
    syncInicial: integracion?.syncInicial ?? false,
    nombre: (integracion?.config as any)?.nombre ?? 'API UpTres',
    historial,
  })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
