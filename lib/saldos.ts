import { prisma } from '@/lib/prisma'

export interface SaldoActual {
  efectivo: number
  bancos:   number
  otros:    number
}

/**
 * Calcula el saldo acumulado (ingresos - egresos) hasta hoy para cada tipo.
 * Fuente única reutilizada por /api/saldos y /api/stats.
 */
export interface EgresosMes {
  total:     number
  pagado:    number
  pendiente: number
}

export async function calcularEgresosMes(empresaId: string, mes: number, anio: number): Promise<EgresosMes> {
  const agg = await (prisma as any).egreso.aggregate({
    where: { empresaId, mes, anio },
    _sum: { valor: true, abonoPago: true, saldo: true },
  })
  return {
    total:     Math.round(Number(agg._sum.valor    || 0)),
    pagado:    Math.round(Number(agg._sum.abonoPago || 0)),
    pendiente: Math.round(Number(agg._sum.saldo     || 0)),
  }
}

export async function calcularSaldoActual(empresaId: string): Promise<SaldoActual> {
  const [efectivo, bancos, otros] = await Promise.all([
    (prisma as any).saldoEfectivo.aggregate({
      where: { empresaId },
      _sum: { ingreso: true, egreso: true },
    }),
    (prisma as any).saldoBancos.aggregate({
      where: { empresaId },
      _sum: { ingreso: true, egreso: true },
    }),
    (prisma as any).saldoOtros.aggregate({
      where: { empresaId },
      _sum: { ingreso: true, egreso: true },
    }),
  ])

  const calc = (agg: any) =>
    Math.round(Number(agg._sum.ingreso || 0) - Number(agg._sum.egreso || 0))

  return {
    efectivo: calc(efectivo),
    bancos:   calc(bancos),
    otros:    calc(otros),
  }
}
