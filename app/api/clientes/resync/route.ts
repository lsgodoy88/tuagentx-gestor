/**
 * POST /api/clientes/resync
 * Re-sincroniza un cliente específico desde UpTres:
 *   1. Reconcilia SyncDeuda — corrige clienteApiId y saldos
 *   2. Reconstruye CarteraCache para ese cliente
 *   3. Invalida Redis cache
 *
 * Nota: no actualiza datos maestros (nombre/NIT) porque UpTres no tiene
 * endpoint por UID y el updatedAt de clientes es epoch — sin forma confiable
 * de traer un cliente puntual. Eso se hace manualmente si es necesario.
 *
 * Protegido con x-cron-secret — solo desde Master.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { reconstruirCartera } from '@/lib/jobs/sync-nocturno'
import { invalidarCacheClientes } from '@/lib/cartera/saldoCliente'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { empresaId, clienteApiId } = await req.json()
  if (!empresaId || !clienteApiId)
    return NextResponse.json({ error: 'empresaId y clienteApiId requeridos' }, { status: 400 })

  // 1. Integración activa
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
  })
  if (!integracion)
    return NextResponse.json({ error: 'Sin integración UpTres activa' }, { status: 400 })

  const config = integracion.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(config.apiKey, apiSecret)
  await adapter.login()

  const resultado: Record<string, any> = {}

  // 2. Reconciliar SyncDeuda — deudas activas e inactivas del cliente
  try {
    const [deudasActivas, deudasInactivas] = await Promise.all([
      adapter.fetchDeudasCliente(clienteApiId),
      adapter.fetchDeudasClienteInactivas(clienteApiId),
    ])
    const todasDeudas = [...deudasActivas, ...deudasInactivas]

    let actualizadas = 0
    let corregidas = 0

    for (const d of todasDeudas) {
      const externalId = String((d as any).uid || (d as any)._id || '')
      if (!externalId) continue

      const existing = await (prisma as any).syncDeuda.findFirst({
        where: { integracionId: integracion.id, externalId },
        select: { id: true, clienteApiId: true },
      })
      if (!existing) continue

      const updates: any = {
        saldo: (d as any).saldo ?? (d as any).balance,
        ...(d.fechaVencimiento ? { fechaVencimiento: new Date(String(d.fechaVencimiento)) } : {}),
      }
      if (existing.clienteApiId !== clienteApiId) {
        updates.clienteApiId = clienteApiId
        corregidas++
      }
      await (prisma as any).syncDeuda.update({ where: { id: existing.id }, data: updates })
      actualizadas++
    }

    resultado.deudas = { encontradas: todasDeudas.length, actualizadas, clienteApiIdCorregido: corregidas }
  } catch (e: any) {
    resultado.errorDeudas = e.message
  }

  // 3. Reconstruir CarteraCache
  try {
    await reconstruirCartera(integracion.id, empresaId, [clienteApiId])
    resultado.carteraCache = 'reconstruida'
  } catch (e: any) {
    resultado.errorCartera = e.message
  }

  // 4. Invalidar Redis cache
  try {
    await invalidarCacheClientes(empresaId, [clienteApiId])
    resultado.cache = 'invalidado'
  } catch (e: any) {
    resultado.errorCache = e.message
  }

  return NextResponse.json({ ok: true, resultado })
}
