import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { actualizarCache } from '@/lib/integracion/sync'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa' && user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const empresaId = getEmpresaId(user)

  // Traer la integración activa
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, activa: true, tipo: 'uptres' }
  })
  if (!integracion) return NextResponse.json({ error: 'Sin integración activa' }, { status: 404 })

  // Obtener TODOS los clienteApiIds con deudas activas
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: { integracionId: integracion.id, saldo: { gt: 0 } },
    select: { clienteApiId: true },
    distinct: ['clienteApiId']
  })

  const apiIds = new Set<string>(
    deudas.map((d: any) => d.clienteApiId).filter(Boolean)
  )

  console.log(`[repoblar-cache] ${empresaId}: ${apiIds.size} clientes con saldo`)

  await actualizarCache(apiIds, integracion.id, empresaId)

  // Contar resultado
  const total = await (prisma as any).carteraCache.count({ where: { empresaId } })

  return NextResponse.json({ ok: true, procesados: apiIds.size, totalCache: total })
}
