/**
 * saldoCliente.ts — Saldo por cliente desde SyncDeuda.nSaldo
 *
 * Fuente única de verdad para CPC, Dashboard y Modal.
 * Cache Redis TTL 5min por cliente. Fallback a BD si Redis cae.
 * Se invalida al registrar un pago via invalidarCacheCliente().
 */
import { prisma } from '@/lib/prisma'
import { withCache, invalidateKeys } from '@/lib/cache'
import { calcularNSaldoPorDeuda } from '@/lib/integracion/sync'

const TTL = 300 // 5 minutos

function cacheKey(empresaId: string, clienteApiId: string) {
  return `g:${empresaId}:sc:${clienteApiId}`
}

export interface SaldoClienteResult {
  clienteApiId: string
  saldoTotal: number
  deudas: Array<{
    id: string
    externalId: string
    numeroFactura: number | null
    valor: number
    nSaldo: number
    saldo: number
    condition: boolean
    fechaVencimiento: string | null
    diasCredito: number | null
    empleadoExternalId: string | null
  }>
}

/**
 * Obtiene saldo de un cliente desde SyncDeuda.nSaldo.
 * Redis TTL 5min — fallback a BD si Redis cae.
 */
export async function getSaldoCliente(
  empresaId: string,
  clienteApiId: string,
  integracionId: string
): Promise<SaldoClienteResult> {
  const key = cacheKey(empresaId, clienteApiId)

  return withCache(key, TTL, async () => {
    const deudas = await (prisma as any).syncDeuda.findMany({
      where: { integracionId, clienteApiId, condition: true },
      select: {
        id: true, externalId: true, numeroFactura: true,
        valor: true, nSaldo: true, saldo: true, condition: true,
        fechaVencimiento: true, diasCredito: true, empleadoExternalId: true
      }
    })

    if (!deudas.length) return { clienteApiId, saldoTotal: 0, deudas: [] }

    // Calcular nSaldo real usando función central
    const nSaldoMap = await calcularNSaldoPorDeuda(
      deudas.map((d: any) => ({ id: d.id, valor: d.valor, numeroFactura: d.numeroFactura, nSaldo: d.nSaldo, saldo: d.saldo })),
      empresaId
    )

    const deudasConSaldo = deudas.map((d: any) => ({
      ...d,
      nSaldo: nSaldoMap[d.id] ?? Math.max(0, Number(d.nSaldo ?? d.saldo ?? d.valor)),
      valor: Number(d.valor),
      saldo: Number(d.saldo ?? 0),
      fechaVencimiento: d.fechaVencimiento ? new Date(d.fechaVencimiento).toISOString() : null,
    }))

    const saldoTotal = deudasConSaldo.reduce((s: number, d: any) => s + d.nSaldo, 0)

    return { clienteApiId, saldoTotal, deudas: deudasConSaldo }
  })
}

/**
 * Invalida cache de un cliente tras registrar pago.
 * Llamar desde aplicarPagoEnCache y actualizarCache.
 */
export async function invalidarCacheCliente(
  empresaId: string,
  clienteApiId: string
): Promise<void> {
  await invalidateKeys(cacheKey(empresaId, clienteApiId))
}

/**
 * Invalida cache de múltiples clientes (ej: tras sync nocturno).
 */
export async function invalidarCacheClientes(
  empresaId: string,
  clienteApiIds: string[]
): Promise<void> {
  if (!clienteApiIds.length) return
  await invalidateKeys(...clienteApiIds.map(id => cacheKey(empresaId, id)))
}
