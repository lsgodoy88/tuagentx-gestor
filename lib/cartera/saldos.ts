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
  // Fuente única: SaldoMovimiento — misma tabla que usa /api/saldos e /ingresos
  const rows = await (prisma as any).saldoMovimiento.groupBy({
    by: ['tab_key'],
    where: { empresaId },
    _sum: { ingreso: true, egreso: true },
  })

  const calc = (key: string) => {
    const row = rows.find((r: any) => r.tab_key === key)
    if (!row) return 0
    return Math.round(Number(row._sum.ingreso || 0) - Number(row._sum.egreso || 0))
  }

  return {
    efectivo: calc('efectivo'),
    bancos:   calc('bancos'),
    otros:    calc('otros'),
  }
}
