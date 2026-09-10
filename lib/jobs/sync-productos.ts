/**
 * sync-productos.ts
 * Sincroniza productos desde UpTres para todas las empresas con integración activa.
 * Llamado por /api/sync/productos — cron cada hora L-S 6am-8pm.
 */

import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto-uptres'
import { syncProductosEmpresa } from '@/lib/jobs/sync-delta'

export async function syncProductosTodas(desde?: Date): Promise<{
  ok: boolean
  empresas: number
  totalUpserted: number
  totalDesactivados: number
}> {
  const ventana = desde ?? new Date(Date.now() - 65 * 60 * 1000) // 65 min — holgura entre runs

  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  let totalUpserted = 0
  let totalDesactivados = 0

  for (const intg of integraciones) {
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const r = await syncProductosEmpresa(intg.empresaId, intg.id, config.apiKey, apiSecret, ventana)
      totalUpserted += r.upserted
      totalDesactivados += r.desactivados
      if (r.upserted > 0 || r.desactivados > 0) {
        console.log(`[sync-productos] ${intg.empresaId}: ${r.upserted} upserted, ${r.desactivados} desactivados`)
      }
    } catch (e: any) {
      console.error(`[sync-productos] error empresa ${intg.empresaId}:`, e.message)
    }
  }

  return { ok: true, empresas: integraciones.length, totalUpserted, totalDesactivados }
}
