import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularDiasV, calcularEdadCartera } from '@/lib/cartera'
import { calcularNSaldoBatch } from '@/lib/cartera/calcularSaldo'
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

    // 1. Traer deudas con todos los campos necesarios para nSaldo
    const deudas: any[] = miApiId
      ? await prisma.$queryRaw`
          SELECT sd.id, sd.valor, sd."numeroFactura", sd.saldo, sd."nSaldo", sd."nSaldoBase",
                 sd."nSaldoBaseAt", sd."ajusteManual", sd."fechaVencimiento",
                 e.nombre AS empleado_nombre
          FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda" sd
          LEFT JOIN ${Prisma.raw(DB_SCHEMA)}."Empleado" e ON e."apiId" = sd."empleadoExternalId" AND e."empresaId" = ${empresaId}
          WHERE sd."integracionId" = ${integracion.id} AND sd."empleadoExternalId" = ${miApiId}
            AND sd.condition = true AND sd.saldo::numeric > 0`
      : await prisma.$queryRaw`
          SELECT sd.id, sd.valor, sd."numeroFactura", sd.saldo, sd."nSaldo", sd."nSaldoBase",
                 sd."nSaldoBaseAt", sd."ajusteManual", sd."fechaVencimiento",
                 e.nombre AS empleado_nombre
          FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda" sd
          LEFT JOIN ${Prisma.raw(DB_SCHEMA)}."Empleado" e ON e."apiId" = sd."empleadoExternalId" AND e."empresaId" = ${empresaId}
          WHERE sd."integracionId" = ${integracion.id}
            AND sd.condition = true AND sd.saldo::numeric > 0`

    if (deudas.length === 0) return NextResponse.json({ porEdad: {}, porEdadVendedor: {} })

    // 2. Traer aplicaciones de pago para estas deudas
    const deudaIds = deudas.map((d: any) => d.id)
    const aplicaciones: any[] = await prisma.$queryRaw`
      SELECT pcd."syncDeudaId", pcd."montoAplicado", pcd."createdAt"
      FROM ${Prisma.raw(DB_SCHEMA)}."PagoCarteraDeuda" pcd
      WHERE pcd."syncDeudaId" = ANY(${deudaIds})`

    // 3. Calcular nSaldo real para todas las deudas
    const nSaldos = calcularNSaldoBatch(deudas, aplicaciones)

    // 4. Acumular por edad usando nSaldo
    const total: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '+120': 0 }
    const porVendedor: Record<string, Record<string, number>> = {}

    for (const d of deudas) {
      const { nSaldo } = nSaldos[d.id] ?? { nSaldo: Math.round(parseFloat(d.saldo ?? '0')) }
      if (nSaldo <= 0) continue
      const diasv = calcularDiasV(d.fechaVencimiento ? new Date(d.fechaVencimiento) : null)
      const edad = calcularEdadCartera(diasv)
      total[edad] = (total[edad] ?? 0) + Math.round(nSaldo)
      const nombre = d.empleado_nombre
      if (!nombre) continue
      if (!porVendedor[nombre]) porVendedor[nombre] = { '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '+120': 0 }
      porVendedor[nombre][edad] = (porVendedor[nombre][edad] ?? 0) + Math.round(nSaldo)
    }

    return NextResponse.json({ porEdad: total, porEdadVendedor: porVendedor })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
