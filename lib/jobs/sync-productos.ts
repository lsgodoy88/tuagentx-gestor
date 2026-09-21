/**
 * sync-productos.ts
 * Sincroniza productos desde UpTres para todas las empresas con integración activa.
 * Llamado por /api/sync/productos — cron cada hora L-S 6am-8pm.
 * Sync completo cada hora — UpTres no actualiza updatedAt al facturar.
 */

import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto-uptres'
import { syncProductosEmpresa } from '@/lib/jobs/sync-delta'

const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

export async function syncProductosTodas(desde?: Date): Promise<{
  ok: boolean
  empresas: number
  totalUpserted: number
  totalDesactivados: number
}> {
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

      // Sync completo siempre — UpTres no actualiza updatedAt al facturar,
      // cursor por updatedAt no detecta cambios de inventario por ventas.
      const r = await syncProductosEmpresa(
        intg.empresaId,
        intg.id,
        config.apiKey,
        apiSecret,
        null  // sin cursor → trae todos → detecta cualquier cambio de inventory
      )

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
