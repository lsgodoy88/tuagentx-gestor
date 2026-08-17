import { prisma } from '@/lib/prisma'

export async function marcarPlanPagado(empresaId: string, pagoId: string, montoPagado: number, pagoFecha?: Date) {
  const ahora = pagoFecha ?? new Date()

  const empresa = await (prisma as any).empresa.findUnique({
    where: { id: empresaId },
    select: { planFin: true, creditoSaldo: true },
  })

  // Monto efectivo = pago + crédito acumulado
  let restante = montoPagado + (empresa?.creditoSaldo ?? 0)

  // Planes pendientes/vencidos más antiguos primero
  const pendientes = await (prisma as any).planEmpresa.findMany({
    where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
    orderBy: { mes: 'asc' },
  })

  if (pendientes.length === 0) {
    // Sin deuda — todo va a crédito
    await (prisma as any).empresa.update({
      where: { id: empresaId },
      data: { creditoSaldo: restante },
    })
    return { ok: true, empresaId, pagoId, montoPagado, mesesPagados: [], excedente: restante, quedanPendientes: 0 }
  }

  const aplicados: string[] = []

  for (const plan of pendientes) {
    if (restante <= 0) break

    // Agregar pagoId al historial (evitar duplicados)
    const pagoIdsActual: string[] = Array.isArray(plan.pagoIds) ? plan.pagoIds : []
    const pagoIdsNuevo = pagoIdsActual.includes(pagoId) ? pagoIdsActual : [...pagoIdsActual, pagoId]

    if (restante >= plan.saldo) {
      // Cubre el saldo pendiente completo
      await (prisma as any).planEmpresa.update({
        where: { id: plan.id },
        data: {
          estado: 'pagado',
          saldo: 0,
          pagoId,           // último pago que lo cerró
          pagoIds: pagoIdsNuevo,
          pagoFecha: ahora,
          bannerActivo: false,
          updatedAt: new Date(),
        },
      })
      restante -= plan.saldo
      aplicados.push(plan.mes)
    } else {
      // Pago parcial — reduce saldo, montoOriginal intacto
      await (prisma as any).planEmpresa.update({
        where: { id: plan.id },
        data: {
          saldo: plan.saldo - restante,
          pagoIds: pagoIdsNuevo,
          updatedAt: new Date(),
        },
      })
      restante = 0
    }
  }

  // Persistir excedente como crédito
  await (prisma as any).empresa.update({
    where: { id: empresaId },
    data: { creditoSaldo: restante },
  })

  // planFin = MAX(existente, 1er día UTC del mes siguiente al último pagado)
  if (aplicados.length > 0) {
    const ultimoMes = aplicados[aplicados.length - 1]
    const [anio, mes] = ultimoMes.split('-').map(Number)
    const nuevoPlanFin = new Date(Date.UTC(anio, mes, 1))
    const planFinExistente = empresa?.planFin ? new Date(empresa.planFin) : new Date(0)
    const planFinFinal = nuevoPlanFin > planFinExistente ? nuevoPlanFin : planFinExistente

    await (prisma as any).empresa.update({
      where: { id: empresaId },
      data: { planFin: planFinFinal },
    })
  }

  // Apagar banner si no quedan pendientes
  const quedanPendientes = await (prisma as any).planEmpresa.count({
    where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
  })
  if (quedanPendientes === 0) {
    await (prisma as any).planEmpresa.updateMany({
      where: { empresaId },
      data: { bannerActivo: false },
    })
  }

  return { ok: true, empresaId, pagoId, montoPagado, mesesPagados: aplicados, excedente: restante, quedanPendientes }
}
