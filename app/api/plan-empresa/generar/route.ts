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
  } else if (plan.estado !== 'pagado') {
    // Plan existe — sincronizar si montoNegociado cambió o fue eliminado
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { montoNegociado: true, maxVendedores: true, maxSupervisores: true, maxBodega: true, maxEntregas: true, maxImpulsadoras: true } as any,
    })
    const montoNegociado = (empresa as any)?.montoNegociado ?? null

    if (montoNegociado && montoNegociado !== plan.monto) {
      // Valor negociado cambió → actualizar
      await (prisma as any).planEmpresa.update({
        where: { empresaId_mes: { empresaId, mes } },
        data: {
          monto: montoNegociado,
          desglose: [{ rol: 'negociado', cantidad: 1, precioUnitario: montoNegociado, subtotal: montoNegociado }],
        },
      })
      plan = { ...plan, monto: montoNegociado }
    } else if (!montoNegociado) {
      // Negociación borrada → recalcular por slots
      const precios = await (prisma as any).precioRol.findMany({ where: { rol: { in: ['vendedor','supervisor','bodega','entregas','impulsadora'] } }, select: { rol: true, precio: true } })
      const precioMap: Record<string, number> = Object.fromEntries(precios.map((p: any) => [p.rol, p.precio]))
      const slots = [
        { rol: 'vendedor', cantidad: (empresa as any)?.maxVendedores ?? 0 },
        { rol: 'supervisor', cantidad: (empresa as any)?.maxSupervisores ?? 0 },
        { rol: 'bodega', cantidad: (empresa as any)?.maxBodega ?? 0 },
        { rol: 'entregas', cantidad: (empresa as any)?.maxEntregas ?? 0 },
        { rol: 'impulsadora', cantidad: (empresa as any)?.maxImpulsadoras ?? 0 },
      ].filter(s => s.cantidad > 0)
      const desglose = slots.map(s => ({ rol: s.rol, cantidad: s.cantidad, precioUnitario: precioMap[s.rol] ?? 0, subtotal: s.cantidad * (precioMap[s.rol] ?? 0) }))
      const monto = desglose.reduce((s, d) => s + d.subtotal, 0)
      if (monto > 0 && monto !== plan.monto) {
        await (prisma as any).planEmpresa.update({
          where: { empresaId_mes: { empresaId, mes } },
          data: { monto, desglose },
        })
        plan = { ...plan, monto }
      }
    }
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
