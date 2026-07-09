/**
 * calcularSaldo.ts — Fuente unica de verdad para nSaldo v3
 *
 * Prioridad:
 *   1. Lumeli + LumeliSaldoInicial0206 -> saldoInicial - pagos post-corte
 *   2. Con pagos locales -> ancla (saldoAnterior primer pago) - total pagado
 *   3. Sin pagos -> nSaldo persistido (sync nocturno) -> saldo -> valor bruto
 *
 * CRITICO: montoAplicado YA incluye descuento.
 */

export const EMPRESA_LUMELI = 'cmn7oiutk0001vmega46373b4'
export const CORTE_LUMELI = new Date('2026-06-01T05:00:00Z')

export interface DeudaParaSaldo {
  id: string
  valor: number | string
  numeroFactura: number | string
  nSaldo?: number | null
  saldo?: number | null
}

export interface AplicacionPago {
  syncDeudaId: string
  montoAplicado: number | string
  createdAt: Date | string
  // saldoAnterior no se usa — PagoCartera.saldoAnterior es saldo del cliente, no de la factura
}

export interface ResultadoNSaldo {
  nSaldo: number
  tienePagosLocales: boolean
  anclaUsada: number | null
}

/**
 * Calcula nSaldo para un conjunto de deudas dado los pagos ya cargados.
 * No hace queries — recibe los datos ya consultados.
 */
export function calcularNSaldoBatch(
  deudas: DeudaParaSaldo[],
  aplicaciones: AplicacionPago[],
  saldosInicialesLumeli: Record<number, number>,
  empresaId: string
): Record<string, ResultadoNSaldo> {
  const totalPagado: Record<string, number> = {}
  const totalPostCorte: Record<string, number> = {}
  const ancla: Record<string, number> = {}

  for (const a of aplicaciones) {
    const monto = Number(a.montoAplicado || 0)
    totalPagado[a.syncDeudaId] = (totalPagado[a.syncDeudaId] || 0) + monto
    if (new Date(a.createdAt) > CORTE_LUMELI) {
      totalPostCorte[a.syncDeudaId] = (totalPostCorte[a.syncDeudaId] || 0) + monto
    }
    // NOTA: saldoAnterior de PagoCartera es saldo TOTAL del cliente, no de la factura.
    // No usar como ancla por factura — ver rama 2 abajo.
  }

  const result: Record<string, ResultadoNSaldo> = {}

  for (const d of deudas) {
    const saldoInicialLumeli = saldosInicialesLumeli[Number(d.numeroFactura)]
    const tienePagosLocales = totalPagado[d.id] !== undefined
    let nSaldo: number

    if (empresaId === EMPRESA_LUMELI && saldoInicialLumeli !== undefined) {
      // Rama 1: Lumeli — saldoInicial del corte menos pagos post-corte
      nSaldo = Math.max(0, saldoInicialLumeli - (totalPostCorte[d.id] || 0))
    } else {
      // Rama 2: todas las demás empresas — usar nSaldo persistido en BD
      // aplicarPagoEnCache actualiza nSaldo inmediatamente post-pago
      // sync-nocturno lo reconcilia cada noche
      // nSaldo es siempre la fuente de verdad por factura individual
      nSaldo = Math.max(0, Number(d.nSaldo ?? d.saldo ?? d.valor))
    }

    result[d.id] = { nSaldo, tienePagosLocales, anclaUsada: null }
  }

  return result
}
