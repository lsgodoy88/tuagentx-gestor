/**
 * Utilidades compartidas de cartera
 * Usadas por: sync-nocturno.ts, sync.ts (actualizarCache)
 */

/**
 * Calcula el saldo real de una deuda descontando pagos enviados
 * con lógica anti-doble-descuento (saldoBaseEnvio).
 */
export function calcularSaldoReal(
  saldoUptres: number,
  pagosEnviados: Array<{ monto: any; reciboPago?: any; envioVariacion?: any }>
): number {
  if (pagosEnviados.length === 0) return saldoUptres
  const totalEnviado = pagosEnviados.reduce((s, p) => s + Number(p.monto), 0)
  const base = Number(
    pagosEnviados[0]?.envioVariacion?.saldoBaseEnvio ??
    pagosEnviados[0]?.reciboPago?.saldoAnterior ??
    saldoUptres + totalEnviado
  )
  const saldoEsperado = base - totalEnviado
  if (saldoUptres <= saldoEsperado + 1) return saldoUptres
  return Math.max(0, saldoUptres - totalEnviado)
}
