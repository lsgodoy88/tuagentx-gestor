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
import { nowBogota } from '@/lib/fechas'
import { actualizarDeudasInactivas } from '@/lib/integracion/sync'
import { recalcularVentasMesImpulsos } from '@/lib/integracion/venta-mes'

// ── Reconciliacion de saldo — unico punto que decide si SyncDeuda.saldo
// se actualiza o se preserva mientras UpTres no confirme pagos locales pendientes/enviados.
// Exportada para testing aislado (no depende de adapter ni de la transaccion del sync completo).
export interface ReconciliarInput {
  sdId: string
  externalId: string
  saldo: number          // saldo crudo que UpTres trae AHORA
  valor: number
  condicionUpTres: boolean
  saldoUptresAnterior: number  // SyncDeuda.saldoUptresOriginal ANTES de este sync
  saldoLocalActual: number     // SyncDeuda.saldo ANTES de este sync
  externalUpdatedAt?: Date | null
  receivableAt?: Date | null
  data?: any
}

export async function reconciliarDeuda(u: ReconciliarInput, integracionId: string) {
  const baseUpdate: any = {
    valor: u.valor,
    saldoUptresOriginal: u.saldo,
    externalUpdatedAt: u.externalUpdatedAt ?? null,
    receivableAt: u.receivableAt ?? null,
    sincronizadoEl: new Date(),
    data: u.data,
  }
  const whereSd = { integracionId_externalId: { integracionId, externalId: u.externalId } }

  if (u.condicionUpTres === false) {
    // UpTres certifica deuda saldada — autoridad maxima, sin ambiguedad
    await (prisma as any).pagoCartera.updateMany({
      where: { syncDeudaId: u.sdId, envioEstado: { in: ['pendiente', 'enviado'] } },
      data: { envioEstado: 'recibido' }
    })
    return (prisma as any).syncDeuda.update({ where: whereSd, data: { ...baseUpdate, saldo: u.saldo, condition: false } })
  }

  // Deuda sigue activa en UpTres — ver si bajo por pagos locales ya conocidos
  const delta = u.saldoUptresAnterior - u.saldo // cuanto bajo segun UpTres desde el ultimo sync
  const pagosNoReflejados = await (prisma as any).pagoCartera.findMany({
    where: { syncDeudaId: u.sdId, envioEstado: { in: ['pendiente', 'enviado'] } },
    select: { id: true, monto: true }
  })
  const pendienteLocal = pagosNoReflejados.reduce((s: number, p: any) => s + Number(p.monto), 0)

  if (pendienteLocal > 0 && Math.abs(delta - pendienteLocal) < 1) {
    // Coincidencia exacta — UpTres reflejo justo lo que teniamos pendiente
    await (prisma as any).pagoCartera.updateMany({
      where: { id: { in: pagosNoReflejados.map((p: any) => p.id) } },
      data: { envioEstado: 'recibido' }
    })
    return (prisma as any).syncDeuda.update({ where: whereSd, data: { ...baseUpdate, saldo: u.saldo, condition: u.saldo > 0 } })
  }

  if (delta >= 0 && delta < pendienteLocal) {
    // UpTres bajo, pero no lo suficiente para cubrir lo pendiente — preservar saldo local
    return (prisma as any).syncDeuda.update({ where: whereSd, data: baseUpdate })
  }

  // delta no coincide con pendienteLocal (ni cubre limpio, ni es menor) — ej. cargo nuevo
  // ajeno mezclado con pago pendiente. No inferir: aplicar el ajuste sin tocar pagos.
  const ajuste = u.saldoUptresAnterior - u.saldo // positivo = bajo, negativo = subio
  const saldoLocalNuevo = Math.max(0, u.saldoLocalActual - ajuste)
  return (prisma as any).syncDeuda.update({ where: whereSd, data: { ...baseUpdate, saldo: saldoLocalNuevo, condition: saldoLocalNuevo > 0 } })
}

// ── Reconstruir CarteraCache ─────────────────────────────────────────────────
export async function reconstruirCartera(integracionId: string, empresaId: string, soloClienteApiIds?: string[]) {
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: {
      integracionId, condition: true, saldo: { gt: 0 }, // condition=true (UpTres activa) AND saldo>0
      ...(soloClienteApiIds && soloClienteApiIds.length > 0 ? { clienteApiId: { in: soloClienteApiIds } } : {})
    }
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

  const porCliente: Record<string, any[]> = {}
  for (const d of deudas) {
    if (!porCliente[d.clienteApiId]) porCliente[d.clienteApiId] = []
    porCliente[d.clienteApiId].push(d)
  }

  const ahora = nowBogota()
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

    // d.saldo ya es confiable — reconciliarDeuda() lo actualizo justo antes en este mismo
    // ciclo del nocturno. Aplicar calcularSaldoReal encima causaba doble resta (removido 21/06).
    const deudasDetalle = deudasOrdenadas.map((d: any) => {
      const saldoReal = Number(d.saldo)
      const valor = Number(d.valor)
      const { estado } = calcularEstado(saldoReal, valor, Number(d.abono), d.fechaVencimiento)
      porEstado[estado] = (porEstado[estado] || 0) + saldoReal
      saldoTotal += valor
      saldoPendiente += saldoReal
      return { id: d.id, externalId: d.externalId, numeroOrden: d.numeroOrden, numeroFactura: d.numeroFactura, valor, saldo: saldoReal, abono: Number(d.abono), diasCredito: d.diasCredito, fechaVencimiento: d.fechaVencimiento, estado }
    })

    // No incluir clientes sin saldo pendiente real
    if (saldoPendiente <= 0) continue

    await (prisma as any).carteraCache.upsert({
      where: { integracionId_clienteApiId: { integracionId, clienteApiId: apiId } },
      create: { id: `cc-${integracionId}-${apiId}`, empresaId, integracionId, clienteId: cliente.id, clienteApiId: apiId, nombre: cliente.nombre, nit: cliente.nit, telefono: cliente.telefono, ciudad: cliente.ciudad, empleadoExternalId: empleadoPrincipal, empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null, saldoTotal, saldoPendiente, porEstado, deudas: deudasDetalle, totalDeudas: deudasDetalle.length, ultimaActualizacion: ahora },
      update: { clienteId: cliente.id, nombre: cliente.nombre, nit: cliente.nit, telefono: cliente.telefono, ciudad: cliente.ciudad, empleadoExternalId: empleadoPrincipal, empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null, saldoTotal, saldoPendiente, porEstado, deudas: deudasDetalle, totalDeudas: deudasDetalle.length, ultimaActualizacion: ahora }
    })
  }

  // Limpiar cache con saldo=0 (deudas ya pagadas)
  await (prisma as any).carteraCache.deleteMany({
    where: { integracionId, saldoPendiente: { lte: 0 } }
  })

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
        select: { id: true, externalId: true, saldo: true, saldoUptresOriginal: true, clienteApiId: true }
      })
      const existentesMap = new Map(existentes.map((e: any) => [e.externalId, e]))
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
          const sdLocal: any = existentesMap.get(externalId)
          toUpdate.push({
            externalId, saldo, valor, externalUpdatedAt, receivableAt, data: d,
            condicionUpTres: Boolean(d.condicionUpTres !== false),
            sdId: sdLocal.id,
            clienteApiId: d.cliente?.uid || sdLocal.clienteApiId || '',
            saldoLocalActual: Number(sdLocal.saldo),
            saldoUptresAnterior: sdLocal.saldoUptresOriginal != null ? Number(sdLocal.saldoUptresOriginal) : Number(sdLocal.saldo),
          })
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
            condition: Boolean(d.condicionUpTres !== false), // condition real de UpTres
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

      // Reconciliacion — delegada a reconciliarDeuda (testeada aisladamente)
      const CHUNK = 100
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const chunk = toUpdate.slice(i, i + CHUNK)
        await Promise.all(chunk.map((u: any) => reconciliarDeuda({
          sdId: u.sdId, externalId: u.externalId, saldo: u.saldo, valor: u.valor,
          condicionUpTres: u.condicionUpTres, saldoUptresAnterior: u.saldoUptresAnterior,
          saldoLocalActual: u.saldoLocalActual, externalUpdatedAt: u.externalUpdatedAt,
          receivableAt: u.receivableAt, data: u.data,
        }, intg.id)))
      }

      if (modo === 'completo') {
        const externalIdsActivos = new Set(externalIds)
        // fetchAll trae todo sin filtro condition — seguro marcar masivamente
        await (prisma as any).syncDeuda.updateMany({
          where: { integracionId: intg.id, condition: true, externalId: { notIn: Array.from(externalIdsActivos) } },
          data: { condition: false, sincronizadoEl: new Date() }
        })
      }

      const clienteApiIdsAfectados = [...new Set([
        ...toInsert.map((t: any) => t.clienteApiId).filter(Boolean),
        ...toUpdate.map((u: any) => u.clienteApiId).filter(Boolean),
      ])] as string[]

      const clientesActualizados = modo === 'completo'
        ? await reconstruirCartera(intg.id, intg.empresaId)
        : (clienteApiIdsAfectados.length > 0 ? await reconstruirCartera(intg.id, intg.empresaId, clienteApiIdsAfectados) : 0)

      // Deudas condition=false con saldo>0 residual — UpTres ya las cerro pero quedo
      // un saldo local sin limpiar. Solo en modo completo (costoso, 1 query por cliente).
      // Estaba importada pero nunca invocada antes de hoy (21/06) — cableada ahora.
      if (modo === 'completo') {
        try {
          await actualizarDeudasInactivas(adapter, intg.id)
        } catch (eInactivas: any) {
          console.error(`[sync-nocturno] actualizarDeudasInactivas fallo (no critico):`, eInactivas.message)
        }
      }

      // Impulso/Rutas Fijas — con adapter real (ya logueado arriba), corrige bug
      // donde integracion-delta.ts lo llamaba sin adapter y omitia clientes con apiId.
      try {
        await recalcularVentasMesImpulsos(intg.empresaId, adapter)
      } catch (eImpulso: any) {
        console.error(`[sync-nocturno] recalcularVentasMesImpulsos fallo (no critico):`, eImpulso.message)
      }

      // Nocturno invalida todo — corre 1 vez/día, datos masivos
      await invalidatePattern('g:*')

      resultados.push({ empresaId: intg.empresaId, deudas: deudas.length, insertadas: toInsert.length, actualizadas: toUpdate.length, clientesCache: clientesActualizados })
    } catch (err: any) {
      console.error(`[sync-nocturno] Error integracion ${intg.id}:`, err.message)
      // Guardar error en SyncLog para visibilidad
      try {
        await (prisma as any).syncLog.create({
          data: {
            integracionId: intg.id,
            inicio: new Date(),
            fin: new Date(),
            disparadoPor: 'cron',
            tipo: 'nocturno',
            estado: 'error',
            errores: [{ mensaje: err.message, ts: new Date().toISOString() }],
          }
        })
      } catch {}
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
          deudasSincronizadas: r.deudas ?? 0,
          clientesActualizados: r.clientesCache ?? 0,
          errores: r.error ? { message: r.error } : undefined,
        },
      })
    )
  )

  return resultados
}
