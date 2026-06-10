/**
 * sync-nocturno — lógica extraída del endpoint
 * Usada por: /api/sync/nocturno/route.ts  y  workers/index.ts
 * Sin dependencia de gestor — accede directo a BD y adapters
 */
import { prisma } from '@/lib/prisma'
import { invalidatePattern } from '@/lib/cache'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { calcularEstado } from '@/lib/cartera'

// ── Reconstruir CarteraCache ─────────────────────────────────────────────────
export async function reconstruirCartera(integracionId: string, empresaId: string) {
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, condition: true }
  })

  const apiIds = [...new Set(deudas.map((d: any) => d.clienteApiId))]
  const clientes = await (prisma as any).cliente.findMany({
    where: { apiId: { in: apiIds }, empresaId },
    select: { id: true, apiId: true, nombre: true, nit: true, telefono: true, ciudad: true }
  })
  const clienteMap: Record<string, any> = {}
  clientes.forEach((c: any) => { clienteMap[c.apiId] = c })

  const empleadoApiIds = [...new Set(deudas.map((d: any) => d.empleadoExternalId).filter(Boolean))] as string[]
  const empleados = await (prisma as any).empleado.findMany({
    where: { apiId: { in: empleadoApiIds }, empresaId },
    select: { apiId: true, nombre: true }
  })
  const empleadoMap: Record<string, string> = {}
  empleados.forEach((e: any) => { empleadoMap[e.apiId] = e.nombre })

  const deudasIds = deudas.map((d: any) => d.id)
  // Saldo tomado directamente de SyncDeuda (fuente: UpTres)
  // No se descuentan pagos locales — UpTres es la fuente de verdad del saldo
  const pagosMap: Record<string, number> = {}

  const porCliente: Record<string, any[]> = {}
  for (const d of deudas) {
    if (!porCliente[d.clienteApiId]) porCliente[d.clienteApiId] = []
    porCliente[d.clienteApiId].push(d)
  }

  const ahora = new Date(Date.now() - 5 * 60 * 60 * 1000)
  for (const [apiId, deudasCliente] of Object.entries(porCliente)) {
    const cliente = clienteMap[apiId]
    if (!cliente) continue

    const conteoEmpleado: Record<string, number> = {}
    for (const d of deudasCliente) {
      if (d.empleadoExternalId) conteoEmpleado[d.empleadoExternalId] = (conteoEmpleado[d.empleadoExternalId] || 0) + 1
    }
    const empleadoPrincipal = Object.keys(conteoEmpleado).sort((a, b) => conteoEmpleado[b] - conteoEmpleado[a])[0] ?? null

    let saldoTotal = 0
    let saldoPendiente = 0
    const porEstado: Record<string, number> = { critica: 0, mora: 0, vencida: 0, proxima: 0, pendiente: 0, vigente: 0, abonada: 0, pagada: 0 }

    const deudasOrdenadas = [...deudasCliente].sort((a: any, b: any) => {
      const fa = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity
      const fb = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity
      return fa - fb
    })

    const deudasDetalle = deudasOrdenadas.map((d: any) => {
      const saldoReal = Number(d.saldo)
      const valor = Number(d.valor)
      const { estado } = calcularEstado(saldoReal, valor, Number(d.abono), d.fechaVencimiento)
      porEstado[estado] = (porEstado[estado] || 0) + saldoReal
      saldoTotal += valor
      saldoPendiente += saldoReal
      return { id: d.id, externalId: d.externalId, numeroOrden: d.numeroOrden, numeroFactura: d.numeroFactura, valor, saldo: saldoReal, abono: Number(d.abono), diasCredito: d.diasCredito, fechaVencimiento: d.fechaVencimiento, estado }
    })

    await (prisma as any).carteraCache.upsert({
      where: { integracionId_clienteApiId: { integracionId, clienteApiId: apiId } },
      create: { id: `cc-${integracionId}-${apiId}`, empresaId, integracionId, clienteId: cliente.id, clienteApiId: apiId, nombre: cliente.nombre, nit: cliente.nit, telefono: cliente.telefono, ciudad: cliente.ciudad, empleadoExternalId: empleadoPrincipal, empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null, saldoTotal, saldoPendiente, porEstado, deudas: deudasDetalle, totalDeudas: deudasDetalle.length, ultimaActualizacion: ahora },
      update: { clienteId: cliente.id, nombre: cliente.nombre, nit: cliente.nit, telefono: cliente.telefono, ciudad: cliente.ciudad, empleadoExternalId: empleadoPrincipal, empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null, saldoTotal, saldoPendiente, porEstado, deudas: deudasDetalle, totalDeudas: deudasDetalle.length, ultimaActualizacion: ahora }
    })
  }
  return Object.keys(porCliente).length
}

// ── Función principal exportada ──────────────────────────────────────────────
export interface SyncNocturnoOpts {
  modo?: 'completo' | 'delta'
}

export interface SyncNocturnoResultado {
  empresaId: string
  deudas?: number
  insertadas?: number
  actualizadas?: number
  clientesCache?: number
  error?: string
}

export async function runSyncNocturno(opts: SyncNocturnoOpts = {}): Promise<SyncNocturnoResultado[]> {
  const modo = opts.modo ?? 'completo'

  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  const resultados: SyncNocturnoResultado[] = []

  for (const intg of integraciones) {
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(config.apiKey, apiSecret)
      await adapter.login()

      let desde: Date | undefined
      if (modo === 'delta') {
        const ultima = await (prisma as any).syncDeuda.aggregate({
          where: { integracionId: intg.id },
          _max: { externalUpdatedAt: true }
        })
        desde = ultima._max.externalUpdatedAt
          ? new Date(new Date(ultima._max.externalUpdatedAt).getTime() - 5 * 60 * 1000)
          : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }

      const deudas = await adapter.fetchDeudas(desde)
      const externalIds = deudas.map((d: any) => String(d.uid || d._id))
      const existentes = await (prisma as any).syncDeuda.findMany({
        where: { integracionId: intg.id, externalId: { in: externalIds } },
        select: { externalId: true }
      })
      const existentesSet = new Set(existentes.map((e: any) => e.externalId))

      const toInsert: any[] = []
      const toUpdate: any[] = []

      for (const d of deudas) {
        const externalId = String(d.uid || d._id)
        const saldo = parseFloat(String(d.vSaldo ?? '0'))
        const valor = parseFloat(String(d.vTotal ?? '0'))
        const externalUpdatedAt = d.fModificado ? new Date(d.fModificado) : null
        const receivableAt = d.receivableAt ? new Date(d.receivableAt) : null

        if (existentesSet.has(externalId)) {
          toUpdate.push({ externalId, saldo, valor, externalUpdatedAt, receivableAt, data: d })
        } else {
          toInsert.push({
            integracionId: intg.id,
            externalId,
            clienteApiId: d.cliente?.uid || '',
            empleadoExternalId: d.empleado?.uid || null,
            numeroOrden: d.numeroOrden ? parseInt(String(d.numeroOrden)) : null,
            numeroFactura: d.numeroFacturado ? parseInt(String(d.numeroFacturado)) : null,
            valor,
            saldo,
            diasCredito: d.dias ? parseInt(String(d.dias)) : null,
            condition: true,
            data: d as any,
            externalUpdatedAt,
            receivableAt,
            sincronizadoEl: new Date(),
          })
        }
      }

      if (toInsert.length) {
        await (prisma as any).syncDeuda.createMany({ data: toInsert, skipDuplicates: true })
      }

      const CHUNK = 100
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const chunk = toUpdate.slice(i, i + CHUNK)
        await Promise.all(chunk.map((u: any) =>
          (prisma as any).syncDeuda.update({
            where: { integracionId_externalId: { integracionId: intg.id, externalId: u.externalId } },
            data: { saldo: u.saldo, valor: u.valor, condition: u.saldo > 0, externalUpdatedAt: u.externalUpdatedAt, receivableAt: u.receivableAt, sincronizadoEl: new Date(), data: u.data }
          })
        ))
      }

      if (modo === 'completo') {
        const externalIdsActivos = new Set(externalIds)
        await (prisma as any).syncDeuda.updateMany({
          where: { integracionId: intg.id, condition: true, externalId: { notIn: Array.from(externalIdsActivos) } },
          data: { condition: false, sincronizadoEl: new Date() }
        })
      }

      const clientesActualizados = modo === 'completo'
        ? await reconstruirCartera(intg.id, intg.empresaId)
        : 0

      // Nocturno invalida todo — corre 1 vez/día, datos masivos
      await invalidatePattern('g:*')

      resultados.push({ empresaId: intg.empresaId, deudas: deudas.length, insertadas: toInsert.length, actualizadas: toUpdate.length, clientesCache: clientesActualizados })
    } catch (err: any) {
      resultados.push({ empresaId: intg.empresaId, error: err.message })
    }
  }

  // SyncLog
  const integracionesMap = Object.fromEntries(integraciones.map((i: any) => [i.empresaId, i.id]))
  await Promise.allSettled(
    resultados.map((r) =>
      prisma.syncLog.create({
        data: {
          integracionId: integracionesMap[r.empresaId] ?? 'system',
          inicio: new Date(),
          fin: new Date(),
          tipo: 'nocturno',
          estado: r.error ? 'error' : 'ok',
          disparadoPor: 'cron',
          empresaId: r.empresaId,
          errores: r.error ? { message: r.error } : undefined,
        },
      })
    )
  )

  return resultados
}
