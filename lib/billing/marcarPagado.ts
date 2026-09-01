import { prisma, DB_SCHEMA } from '@/lib/prisma'

// Genera número de voucher: PAIDMES-YYMMXXXXX (consecutivo mensual reinicia c/mes)
const TIPO_PREFIJO: Record<string, string> = { PAIDMES: 'PM', NEWPLAN: 'NP', ADDROL: 'NR' }

async function generarVoucherNum(tipo: 'PAIDMES' | 'NEWPLAN' | 'ADDROL', ahora: Date): Promise<string> {
  const yy = String(ahora.getFullYear()).slice(2)
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const prefijo = `${TIPO_PREFIJO[tipo] ?? tipo}${yy}${mm}`

  // Contar vouchers del mismo tipo y mes para consecutivo
  const rows = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT COUNT(*)::int AS cnt FROM ${DB_SCHEMA}."PlanEmpresa"
     WHERE "voucherNum" LIKE $1`,
    `${prefijo}%`
  )
  const siguiente = (rows[0]?.cnt ?? 0) + 1
  return `${prefijo}${String(siguiente).padStart(3, '0')}`
}

export async function marcarPlanPagado(
  empresaId: string,
  pagoId: string,
  montoPagado: number,
  pagoFecha?: Date,
  tipo: 'PAIDMES' | 'NEWPLAN' | 'ADDROL' = 'PAIDMES'
) {
  const ahora = pagoFecha ?? new Date()

  const empresa = await (prisma as any).empresa.findUnique({
    where: { id: empresaId },
    select: { planFin: true, creditoSaldo: true },
  })

  let restante = montoPagado + (empresa?.creditoSaldo ?? 0)

  const pendientes = await (prisma as any).planEmpresa.findMany({
    where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
    orderBy: { mes: 'asc' },
  })

  if (pendientes.length === 0) {
    await (prisma as any).empresa.update({
      where: { id: empresaId },
      data: { creditoSaldo: restante },
    })
    return { ok: true, empresaId, pagoId, montoPagado, mesesPagados: [], excedente: restante, quedanPendientes: 0, voucherNum: null }
  }

  const aplicados: string[] = []
  let voucherNum: string | null = null

  for (const plan of pendientes) {
    if (restante <= 0) break

    const pagoIdsActual: string[] = Array.isArray(plan.pagoIds) ? plan.pagoIds : []
    const pagoIdsNuevo = pagoIdsActual.includes(pagoId) ? pagoIdsActual : [...pagoIdsActual, pagoId]

    if (restante >= plan.saldo) {
      // Generar voucher solo en el primer mes pagado completo
      if (!voucherNum) {
        voucherNum = await generarVoucherNum(tipo, ahora)
      }
      await (prisma as any).planEmpresa.update({
        where: { id: plan.id },
        data: {
          estado: 'pagado',
          saldo: 0,
          pagoId,
          pagoIds: pagoIdsNuevo,
          pagoFecha: ahora,
          bannerActivo: false,
          voucherNum,
          voucherTipo: tipo,
          updatedAt: new Date(),
        },
      })
      restante -= plan.saldo
      aplicados.push(plan.mes)
    } else {
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

  await (prisma as any).empresa.update({
    where: { id: empresaId },
    data: { creditoSaldo: restante },
  })

  if (aplicados.length > 0) {
    const ultimoMes = aplicados[aplicados.length - 1]
    const [anioStr, mesStr] = ultimoMes.split('-')
    const nuevoPlanFin = new Date(Date.UTC(Number(anioStr), Number(mesStr), 6)) // mes 1-indexed compensa 0-indexed de UTC → día 6 mes siguiente
    const planFinExistente = empresa?.planFin ? new Date(empresa.planFin) : new Date(0)
    const planFinFinal = nuevoPlanFin > planFinExistente ? nuevoPlanFin : planFinExistente
    await (prisma as any).empresa.update({
      where: { id: empresaId },
      data: { planFin: planFinFinal },
    })
  }

  const quedanPendientes = await (prisma as any).planEmpresa.count({
    where: { empresaId, estado: { in: ['pendiente', 'vencido'] } },
  })
  if (quedanPendientes === 0) {
    await (prisma as any).planEmpresa.updateMany({
      where: { empresaId },
      data: { bannerActivo: false },
    })
  }

  return { ok: true, empresaId, pagoId, montoPagado, mesesPagados: aplicados, excedente: restante, quedanPendientes, voucherNum }
}
