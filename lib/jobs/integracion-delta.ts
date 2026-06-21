/**
 * integracion-delta — wrapper para el delta cron de integracion/sync
 * Usada por: /api/integracion/sync/route.ts (cron path) y workers/index.ts
 * Sin dependencia de gestor HTTP
 *
 * Historial de recortes (21/06):
 * - sincronizarDeudas/marcarZombis/refrescarDeudasConPagosPendientes removidos.
 *   SyncDeuda.saldo/condition se actualiza SOLO desde sync-nocturno.ts (single writer).
 * - fetchClientes/fetchEmpleados removidos. sync-delta.ts ya cubre clientes/empleados
 *   nuevos cada 30min en horario laboral — este job duplicaba ese trabajo.
 * - recalcularVentasMesImpulsos movido a sync-nocturno.ts (con adapter real, corrige
 *   bug donde se llamaba sin adapter y omitia clientes con apiId).
 *
 * Este job quedo reducido a: refrescar CarteraCache (lectura, sin escribir SyncDeuda).
 */
import { prisma } from '@/lib/prisma'
import { invalidatePattern } from '@/lib/cache'
import { actualizarCache } from '@/lib/integracion/sync'

async function refrescarCacheIntegracion(integ: any) {
  const t0 = Date.now()
  const empresaId = integ.empresaId

  const deudasLocales = await (prisma as any).syncDeuda.findMany({
    where: { integracionId: integ.id, condition: true },
    select: { clienteApiId: true }
  })

  const clienteApiIds = new Set<string>(deudasLocales.map((d: any) => d.clienteApiId).filter(Boolean))
  await actualizarCache(clienteApiIds, integ.id, empresaId)

  await invalidatePattern(`g:${empresaId}:*`)

  const duracionMs = Date.now() - t0
  return { deudasLocales: deudasLocales.length, duracionMs }
}

export async function runIntegracionDelta(): Promise<any[]> {
  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true }
  })

  const resultados: any[] = []
  for (const integ of integraciones) {
    try {
      const r = await refrescarCacheIntegracion(integ)
      resultados.push({ empresaId: integ.empresaId, ok: true, ...r })
    } catch (err: any) {
      resultados.push({ empresaId: integ.empresaId, ok: false, error: err.message })
    }
  }
  return resultados
}
