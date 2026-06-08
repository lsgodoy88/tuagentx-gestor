/**
 * integracion-delta — wrapper para el delta cron de integracion/sync
 * Usada por: /api/integracion/sync/route.ts (cron path) y workers/index.ts
 * Sin dependencia de gestor HTTP
 */
import { prisma } from '@/lib/prisma'
import { crearAdaptador, sincronizarDeudas, actualizarCache, marcarZombis, refrescarDeudasConPagosPendientes } from '@/lib/integracion/sync'
import { decrypt } from '@/lib/crypto-uptres'
import { recalcularVentasMesImpulsos } from '@/lib/integracion/venta-mes'

function resolverConfig(config: any): Record<string, string> {
  return {
    apiKey: config.apiKey,
    apiSecret: decrypt(config.apiSecret, process.env.UPTRES_SECRET!),
  }
}

// Importar ejecutarDelta directamente desde el módulo de sync
// Re-implementamos solo la parte cron para no duplicar lógica
async function ejecutarDeltaParaIntegracion(integ: any, incluirImpulsos = true) {
  const logs: string[] = []
  const T = (m: string, t: number) => { logs.push(`${m} (${Date.now()-t}ms)`) }
  const inicio = new Date()
  const t0 = Date.now()

  const config = resolverConfig(integ.config)
  const adapter = crearAdaptador(integ.tipo, config)
  await adapter.login()

  const empresaId = integ.empresaId
  const desde = integ.ultimaSync ? new Date(integ.ultimaSync) : undefined

  // Clientes
  let _t = Date.now()
  const clientes = await adapter.fetchClientes(desde)
  T(`fetchClientes (${clientes.length})`, _t)

  _t = Date.now()
  const empleados = await adapter.fetchEmpleados(desde)
  T(`fetchEmpleados (${empleados.length})`, _t)

  _t = Date.now()
  const deudas = await adapter.fetchDeudas(desde)
  T(`fetchDeudas (${deudas.length})`, _t)

  _t = Date.now()
  const afectados = await sincronizarDeudas(deudas, integ.id, empresaId)
  T(`sincronizarDeudas (afectados ${afectados.size})`, _t)

  _t = Date.now()
  const externalIdsVivas = new Set<string>(deudas.map((d: any) => String(d.uid || d._id)).filter(Boolean))
  const zombis = await marcarZombis(externalIdsVivas, integ.id, empresaId)
  T(`marcarZombis (${zombis})`, _t)

  _t = Date.now()
  const { confrontados: confrontadosResult } = await refrescarDeudasConPagosPendientes(adapter, integ.id, empresaId)
  const confrontados = confrontadosResult
  T(`refrescarDeudasConPagosPendientes (${confrontados})`, _t)

  _t = Date.now()
  const clienteApiIds = new Set<string>((deudas as any[]).map((d: any) => d.cliente?.uid || d.clienteApiId).filter(Boolean))
  await actualizarCache(clienteApiIds, integ.id, empresaId)
  T(`actualizarCache`, _t)

  // Actualizar ultimaSync
  await (prisma as any).integracion.update({
    where: { id: integ.id },
    data: { ultimaSync: new Date() }
  })

  if (incluirImpulsos) {
    try {
      await recalcularVentasMesImpulsos(empresaId)
    } catch {}
  }

  const duracionMs = Date.now() - t0
  return { clientes: clientes.length, empleados: empleados.length, deudas: deudas.length, zombis, confrontados, duracionMs }
}

export async function runIntegracionDelta(): Promise<any[]> {
  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true }
  })

  const resultados: any[] = []
  for (const integ of integraciones) {
    try {
      const r = await ejecutarDeltaParaIntegracion(integ, true)
      resultados.push({ empresaId: integ.empresaId, ok: true, ...r })
    } catch (err: any) {
      resultados.push({ empresaId: integ.empresaId, ok: false, error: err.message })
    }
  }
  return resultados
}
