import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { generarPlanMes } from '@/lib/billing/generarPlan'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const ahora = new Date()
  const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`

  // Crear plan si no existe
  let plan = await (prisma as any).planEmpresa.findUnique({
    where: { empresaId_mes: { empresaId, mes } },
    select: { id: true, monto: true, estado: true },
  })

  if (!plan) {
    await generarPlanMes(mes, empresaId)
    plan = await (prisma as any).planEmpresa.findUnique({
      where: { empresaId_mes: { empresaId, mes } },
      select: { id: true, monto: true, estado: true },
    })
  }

  if (!plan) return NextResponse.json({ error: 'No se pudo generar el plan' }, { status: 500 })

  // Deuda acumulada
  const pendientes = await (prisma as any).planEmpresa.findMany({
    where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
    orderBy: { mes: 'asc' },
    select: { mes: true, monto: true },
  })

  const deudaTotal = pendientes.reduce((s: number, p: any) => s + p.monto, 0)
  const mesesPendientes = pendientes.map((p: any) => p.mes)

  return NextResponse.json({ ok: true, monto: plan.monto, deudaTotal, mesesPendientes, mes })
}
