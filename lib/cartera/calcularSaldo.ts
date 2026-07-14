/**
 * calcularSaldo.ts — Fuente unica de verdad para nSaldo v3
 *
 * Prioridad:
 *   1. Lumeli + LumeliSaldoInicial0206 → saldoInicial - pagos post-corte
 *   2. Todas las demás empresas → nSaldo persistido en BD (calculado por
 *      aplicarPagoEnCache post-pago, y preservado por reconstruirCartera).
 *      Fallback: saldo (crudo UpTres) → valor.
 *      El nocturno NO toca nSaldo — inmune al lag de UpTres.
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
  nSaldoBase?: number | null    // write-once: base de saldo al sync inicial del vendedor
  nSaldoBaseAt?: Date | string | null // fecha de inicio de pagos gestor
}

export interface AplicacionPago {
  syncDeudaId: string
  montoAplicado: number | string
  createdAt: Date | string
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

  // mapa deudaId → nSaldoBaseAt para Rama 0
  const baseAtMap: Record<string, Date> = {}
  for (const d of deudas) {
    if (d.nSaldoBase != null && d.nSaldoBaseAt) {
      baseAtMap[d.id] = new Date(d.nSaldoBaseAt)
    }
  }

  for (const a of aplicaciones) {
    const monto = Number(a.montoAplicado || 0)
    totalPagado[a.syncDeudaId] = (totalPagado[a.syncDeudaId] || 0) + monto
    if (new Date(a.createdAt) > CORTE_LUMELI) {
      totalPostCorte[a.syncDeudaId] = (totalPostCorte[a.syncDeudaId] || 0) + monto
    }
  }

  const result: Record<string, ResultadoNSaldo> = {}

  for (const d of deudas) {
    const saldoInicialLumeli = saldosInicialesLumeli[Number(d.numeroFactura)]
    const tienePagosLocales = totalPagado[d.id] !== undefined
    let nSaldo: number

    if (d.nSaldoBase != null && baseAtMap[d.id]) {
      // Rama 0: sync inicial del vendedor — nSaldoBase menos pagos posteriores a nSaldoBaseAt
      const baseAt = baseAtMap[d.id]
      const pagosPostBase = aplicaciones
        .filter(a => a.syncDeudaId === d.id && new Date(a.createdAt) > baseAt)
        .reduce((s, a) => s + Number(a.montoAplicado || 0), 0)
      nSaldo = Math.max(0, Number(d.nSaldoBase) - pagosPostBase)
    } else if (empresaId === EMPRESA_LUMELI && saldoInicialLumeli !== undefined) {
      // Rama 1: Lumeli — saldoInicial del corte menos pagos post-corte
      nSaldo = Math.max(0, saldoInicialLumeli - (totalPostCorte[d.id] || 0))
    } else {
      // Rama 2: todas las demás empresas — usar nSaldo persistido en BD
      // El nSaldo en BD se calcula correctamente como:
      //   saldo_uptres_inicial (snapshot al llegar a Gestor) - pagos nuestros
      // Esto es correcto tanto para facturas sin abonos previos (saldo_inicial=valor)
      // como para facturas con abonos previos en UpTres (saldo_inicial<valor).
      // La fuente de ese valor es aplicarPagoEnCache (post-pago inmediato) y
      // reconstruirCartera (nocturno). El nocturno actualiza saldoUptresOriginal
      // (referencia) pero ya NO toca nSaldo — inmune al lag de UpTres.
      // Fallback: si nSaldo no existe aún, usar saldo (crudo UpTres) → es correcto
      // para facturas donde nunca hemos registrado un pago.
      nSaldo = Math.max(0, Number(d.nSaldo ?? d.saldo ?? d.valor))
    }

    result[d.id] = { nSaldo, tienePagosLocales, anclaUsada: null }
  }

  return result
}
