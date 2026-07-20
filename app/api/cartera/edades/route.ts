import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularDiasV, calcularEdadCartera } from '@/lib/cartera'
import { Prisma } from '@/app/generated/prisma'

const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const empresaId = getEmpresaId(user)

    const integracion = await (prisma as any).integracion.findFirst({
      where: { empresaId, tipo: 'uptres', activa: true }
    })
    if (!integracion) return NextResponse.json({ porEdad: {}, porEdadVendedor: {} })

    let miApiId: string | null = null
    if (user.role === 'vendedor') {
      const emp = await (prisma as any).empleado.findUnique({ where: { id: user.id }, select: { apiId: true } })
      miApiId = emp?.apiId || null
    }

    const deudas: any[] = miApiId
      ? await prisma.$queryRaw`
          SELECT sd.saldo, sd."fechaVencimiento", e.nombre AS empleado_nombre
          FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda" sd
          LEFT JOIN ${Prisma.raw(DB_SCHEMA)}."Empleado" e ON e."apiId" = sd."empleadoExternalId" AND e."empresaId" = ${empresaId}
          WHERE sd."integracionId" = ${integracion.id} AND sd."empleadoExternalId" = ${miApiId}
            AND sd.condition = true AND sd.saldo::numeric > 0`
      : await prisma.$queryRaw`
          SELECT sd.saldo, sd."fechaVencimiento", e.nombre AS empleado_nombre
          FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda" sd
          LEFT JOIN ${Prisma.raw(DB_SCHEMA)}."Empleado" e ON e."apiId" = sd."empleadoExternalId" AND e."empresaId" = ${empresaId}
          WHERE sd."integracionId" = ${integracion.id}
            AND sd.condition = true AND sd.saldo::numeric > 0`

    const total: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '+120': 0 }
    const porVendedor: Record<string, Record<string, number>> = {}

    for (const d of deudas) {
      const diasv = calcularDiasV(d.fechaVencimiento ? new Date(d.fechaVencimiento) : null)
      const edad = calcularEdadCartera(diasv)
      const saldo = Math.round(parseFloat(d.saldo ?? '0'))
      total[edad] = (total[edad] ?? 0) + saldo
      const nombre = d.empleado_nombre
      if (!nombre) continue
      if (!porVendedor[nombre]) porVendedor[nombre] = { '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '+120': 0 }
      porVendedor[nombre][edad] = (porVendedor[nombre][edad] ?? 0) + saldo
    }

    return NextResponse.json({ porEdad: total, porEdadVendedor: porVendedor })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
