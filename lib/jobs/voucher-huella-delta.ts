/**
 * voucher-huella-delta.ts
 * Corre cada 15 min via cron.
 * Busca VoucherHuella con referencia+valor+fecha duplicados en distintos pagos
 * y actualiza el campo notas del PagoCartera con alerta de duplicado.
 */
import { prisma } from '@/lib/prisma'

export async function runVoucherHuellaDelta() {
  // Buscar huellas con match exacto en referencia+valor+fecha, agrupadas
  const duplicados: any[] = await (prisma as any).$queryRaw`
    SELECT referencia, valor, fecha, array_agg(pago_id) as pago_ids, array_agg(empresa_id) as empresa_ids, array_agg(vendedor_nombre) as vendedores
    FROM gestor."VoucherHuella"
    WHERE referencia IS NOT NULL AND valor IS NOT NULL AND fecha IS NOT NULL
    GROUP BY referencia, valor, fecha
    HAVING count(*) > 1
  `

  if (!duplicados.length) return

  for (const dup of duplicados) {
    const pagoIds: string[] = dup.pago_ids
    const vendedores: string[] = dup.vendedores
    // Construir mensaje de alerta para cada pago involucrado
    for (let i = 0; i < pagoIds.length; i++) {
      const otrosPagos = pagoIds.filter((_: string, j: number) => j !== i)
      const otrosVendedores = vendedores.filter((_: string, j: number) => j !== i)
      const alerta = `⚠️ Comprobante duplicado. Ref: ${dup.referencia} $${dup.valor} ${dup.fecha}. También en recibo(s): ${otrosPagos.join(', ')} (${otrosVendedores.filter(Boolean).join(', ')})`
      await (prisma as any).pagoCartera.update({
        where: { id: pagoIds[i] },
        data: { notas: alerta }
      })
    }
  }

  console.log(`[voucher-delta] ${duplicados.length} grupos duplicados procesados`)
}
