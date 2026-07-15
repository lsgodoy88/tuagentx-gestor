/**
 * calcularSaldo.ts — Fuente unica de verdad para nSaldo v3
 *
 * Prioridad:
 *   Rama 0: nSaldoBase != null → nSaldoBase - pagos posteriores a nSaldoBaseAt
 *           (aplica a todos los vendedores con sync inicial — Carlos, Jackeline, Dolly, futuros)
 *   Rama 2: Fallback — nSaldo persistido en BD → saldo UpTres → valor
 *
 * CRITICO: montoAplicado YA incluye descuento.
 */

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

): Record<string, ResultadoNSaldo> {
  const totalPagado: Record<string, number> = {}

  // mapa deudaId → nSaldoBaseAt para Rama 0
  const baseAtMap: Record<string, Date> = {}
  for (const d of deudas) {
    const base = d.nSaldoBase != null ? Number(d.nSaldoBase) : null
    if (base != null && !isNaN(base) && base > 0 && d.nSaldoBaseAt) {
      baseAtMap[d.id] = new Date(d.nSaldoBaseAt)
    }
  }

  for (const a of aplicaciones) {
    const monto = Number(a.montoAplicado || 0)
    totalPagado[a.syncDeudaId] = (totalPagado[a.syncDeudaId] || 0) + monto
  }

  const result: Record<string, ResultadoNSaldo> = {}

  for (const d of deudas) {
    const tienePagosLocales = totalPagado[d.id] !== undefined
    let nSaldo: number

    if (baseAtMap[d.id]) {
      // Rama 0: sync inicial del vendedor — nSaldoBase menos pagos posteriores a nSaldoBaseAt
      const baseAt = baseAtMap[d.id]
      const nSaldoBaseNum = Number(d.nSaldoBase)
      const pagosPostBase = aplicaciones
        .filter(a => a.syncDeudaId === d.id && new Date(a.createdAt) > baseAt)
        .reduce((s, a) => s + Number(a.montoAplicado || 0), 0)
      nSaldo = Math.max(0, nSaldoBaseNum - pagosPostBase)
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
