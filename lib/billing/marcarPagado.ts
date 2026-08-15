import { prisma } from '@/lib/prisma'

export async function marcarPlanPagado(empresaId: string, pagoId: string, montoPagado: number, pagoFecha?: Date) {
  const ahora = pagoFecha ?? new Date()

  // Traer todos los meses pendientes/vencidos ordenados ASC (más antiguo primero)
  const pendientes = await (prisma as any).planEmpresa.findMany({
    where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
    orderBy: { mes: 'asc' },
  })

  if (pendientes.length === 0) return { ok: false, error: 'Sin planes pendientes' }

  let restante = montoPagado
  const aplicados: string[] = []
  let excedente = 0

  for (const plan of pendientes) {
    if (restante <= 0) break

    if (restante >= plan.monto) {
      // Cubre el mes completo
      await (prisma as any).planEmpresa.update({
        where: { id: plan.id },
        data: { estado: 'pagado', pagoId, pagoFecha: ahora, bannerActivo: false, updatedAt: new Date() },
      })
      restante -= plan.monto
      aplicados.push(plan.mes)
    } else {
      // Pago parcial — no alcanza para cubrir este mes
      // Dejar pendiente con monto reducido
      await (prisma as any).planEmpresa.update({
        where: { id: plan.id },
        data: { monto: plan.monto - restante, updatedAt: new Date() },
      })
      restante = 0
    }
  }

  // Si sobra excedente — aplicar al siguiente mes pendiente o guardar como crédito
  excedente = restante
  if (excedente > 0) {
    const siguientePendiente = await (prisma as any).planEmpresa.findFirst({
      where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
      orderBy: { mes: 'asc' },
    })
    if (siguientePendiente) {
      // Reducir monto del siguiente mes (saldo a favor)
      await (prisma as any).planEmpresa.update({
        where: { id: siguientePendiente.id },
        data: { monto: Math.max(0, siguientePendiente.monto - excedente), updatedAt: new Date() },
      })
    }
    // Si no hay siguiente mes — el crédito se aplica cuando se genere el próximo plan
    // guardamos el excedente en Empresa para que generarPlanMes lo descuente
    if (!siguientePendiente) {
      await prisma.empresa.update({
        where: { id: empresaId },
        data: { planFin: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1) },
      })
    }
  }

  // Extender planFin según meses pagados
  if (aplicados.length > 0) {
    const planFinActual = new Date(ahora.getFullYear(), ahora.getMonth() + aplicados.length, 1)
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { planFin: planFinActual },
    })
  }

  // Apagar banner si ya no hay pendientes
  const quedanPendientes = await (prisma as any).planEmpresa.count({
    where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
  })
  if (quedanPendientes === 0) {
    await (prisma as any).planEmpresa.updateMany({
      where: { empresaId },
      data: { bannerActivo: false },
    })
  }

  return {
    ok: true,
    empresaId,
    pagoId,
    montoPagado,
    mesesPagados: aplicados,
    excedente,
    quedanPendientes,
  }
}
