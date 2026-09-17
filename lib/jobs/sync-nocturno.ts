/**
 * sync-nocturno — lógica extraída del endpoint
 * Usada por: /api/sync/nocturno/route.ts  y  workers/index.ts
 * Sin dependencia de gestor — accede directo a BD y adapters
 *
 * Flujo slim (2026-09-17):
 *   fetchDeudasDesde (receivableAt) → reconciliar afectados
 *   → actualizarDeudasInactivas (saldos sucios)
 *   → reconstruirCartera (solo afectados)
 *   → invalidarCacheClientes (Redis scoped)
 *
 * fetchDeudasConCursor eliminado — paginaba toda la cartera, no escalable.
 * Pendiente: filtro updatedAt en /cartera/update de UpTres (bloqueado por ellos).
 * Cuando UpTres lo implemente → agregar cursor cartera por updatedAt aquí.
 */
import { prisma } from '@/lib/prisma'
import { invalidatePattern } from '@/lib/cache'
import { invalidarCacheClientes } from '@/lib/cartera/saldoCliente'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import crypto from 'crypto'
import { decrypt } from '@/lib/crypto-uptres'
import { calcularEstado } from '@/lib/cartera/index'
import { nowBogota } from '@/lib/fechas'
import { calcularNSaldoBatch } from '@/lib/cartera/calcularSaldo'
import { actualizarDeudasInactivas } from '@/lib/integracion/sync'

// ── Estado derivado del PagoCartera padre ────────────────────────────────────
// UNICA fuente de verdad: PagoCarteraDeuda.envioEstado por factura. El padre NUNCA
// almacena su propio envioEstado de forma independiente — se calcula aquí, siempre,
// para evitar que padre e hijos se desincronicen (bug real evitado por diseño 24/06).
// Reglas: todas las facturas 'recibido' → 'recibido'. Todas al menos 'enviado'
// (mezcla de enviado/recibido, sin pendientes) → 'enviado'. Cualquier otra
// combinación (al menos una 'pendiente') → 'pendiente'.
export function derivarEnvioEstado(aplicaciones: { envioEstado: string }[]): 'pendiente' | 'enviado' | 'recibido' | 'cierreUptres' {
  if (aplicaciones.length === 0) return 'pendiente'
  const terminados = ['recibido', 'cierreUptres']
  if (aplicaciones.every(a => terminados.includes(a.envioEstado))) {
    return aplicaciones.some(a => a.envioEstado === 'cierreUptres') ? 'cierreUptres' : 'recibido'
  }
  if (aplicaciones.every(a => terminados.includes(a.envioEstado) || a.envioEstado === 'enviado')) return 'enviado'
  return 'pendiente'
}

export async function recalcularEnvioEstadoPago(pagoId: string) {
  const aplicaciones = await (prisma as any).pagoCarteraDeuda.findMany({
    where: { pagoId },
    select: { envioEstado: true }
  })
  const estado = derivarEnvioEstado(aplicaciones)
  const ultimaFecha = await (prisma as any).pagoCarteraDeuda.aggregate({
    where: { pagoId, envioEstado: estado === 'pendiente' ? undefined : { not: 'pendiente' } },
    _max: { envioFecha: true }
  })
  await (prisma as any).pagoCartera.update({
    where: { id: pagoId },
    data: {
      envioEstado: estado,
      envioFecha: estado !== 'pendiente' ? (ultimaFecha._max.envioFecha ?? new Date()) : null,
    }
  })
  return estado
}

// ── Reconciliacion de saldo ──────────────────────────────────────────────────
export function encontrarSubsetExacto(
  aplicaciones: { id: string; montoAplicado: any }[],
  target: number
): { id: string; montoAplicado: any }[] | null {
  if (aplicaciones.length === 0 || aplicaciones.length > 20 || target <= 0) return null
  let mejor: { id: string; montoAplicado: any }[] | null = null
  function backtrack(idx: number, acumulado: number, elegidos: { id: string; montoAplicado: any }[]) {
    if (Math.abs(acumulado - target) < 1 && elegidos.length > 0) {
      if (!mejor || elegidos.length < mejor.length) mejor = [...elegidos]
      return
    }
    if (idx >= aplicaciones.length || acumulado > target + 1) return
    const a = aplicaciones[idx]
    const monto = Number(a.montoAplicado)
    elegidos.push(a)
    backtrack(idx + 1, acumulado + monto, elegidos)
    elegidos.pop()
    backtrack(idx + 1, acumulado, elegidos)
  }
  backtrack(0, 0, [])
  return mejor
}

export interface ReconciliarInput {
  sdId: string
  externalId: string
  saldo: number
  valor: number
  condicionUpTres: boolean
  saldoUptresAnterior: number
  saldoLocalActual: number
  externalUpdatedAt?: Date | null
  receivableAt?: Date | null
  fechaVencimiento?: Date | null
  fechaVencimientoActual?: Date | null
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

  async function marcarAplicacionesRecibidasYRecalcular(aplicacionIds: string[], fecha: Date) {
    if (aplicacionIds.length === 0) return
    await (prisma as any).pagoCarteraDeuda.updateMany({
      where: { id: { in: aplicacionIds } },
      data: { envioEstado: 'recibido', envioFecha: fecha, receivableAtUptres: fecha }
    })
    const pagoIds = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { id: { in: aplicacionIds } },
      select: { pagoId: true },
      distinct: ['pagoId']
    })
    await Promise.all(pagoIds.map((p: any) => recalcularEnvioEstadoPago(p.pagoId)))
  }

  async function marcarAplicacionesCierreUptres(aplicacionIds: string[]) {
    if (aplicacionIds.length === 0) return
    await (prisma as any).pagoCarteraDeuda.updateMany({
      where: { id: { in: aplicacionIds } },
      data: { envioEstado: 'cierreUptres' }
    })
    const pagoIds = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { id: { in: aplicacionIds } },
      select: { pagoId: true },
      distinct: ['pagoId']
    })
    await Promise.all(pagoIds.map((p: any) => recalcularEnvioEstadoPago(p.pagoId)))
  }

  if (u.condicionUpTres === false) {
    const aplicacionesPendientes = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { syncDeudaId: u.sdId, envioEstado: { in: ['pendiente', 'enviado'] } },
      select: { id: true }
    })
    if (u.receivableAt) {
      await marcarAplicacionesRecibidasYRecalcular(
        aplicacionesPendientes.map((a: any) => a.id),
        u.receivableAt
      )
    } else {
      await marcarAplicacionesCierreUptres(aplicacionesPendientes.map((a: any) => a.id))
    }
    return (prisma as any).syncDeuda.update({
      where: whereSd,
      data: {
        ...baseUpdate,
        saldo: u.saldo,
        condition: false,
        ...(!u.fechaVencimientoActual && u.fechaVencimiento ? { fechaVencimiento: u.fechaVencimiento } : {})
      }
    })
  }

  const delta = u.saldoUptresAnterior - u.saldo
  const aplicacionesPendientes = await (prisma as any).pagoCarteraDeuda.findMany({
    where: { syncDeudaId: u.sdId, envioEstado: { in: ['pendiente', 'enviado'] } },
    select: { id: true, montoAplicado: true, pagoId: true }
  })
  const pendienteLocal = aplicacionesPendientes.reduce((s: number, a: any) => s + Number(a.montoAplicado), 0)

  if (pendienteLocal > 0 && Math.abs(delta - pendienteLocal) < 1) {
    await marcarAplicacionesRecibidasYRecalcular(
      aplicacionesPendientes.map((a: any) => a.id),
      u.receivableAt ?? new Date()
    )
  } else if (delta > 0 && delta < pendienteLocal) {
    const subset = encontrarSubsetExacto(aplicacionesPendientes, delta)
    if (subset) {
      await marcarAplicacionesRecibidasYRecalcular(
        subset.map((a: any) => a.id),
        u.receivableAt ?? new Date()
      )
    }
  }

  return (prisma as any).syncDeuda.update({
    where: whereSd,
    data: {
      ...baseUpdate,
      saldo: u.saldo,
      ...(!u.fechaVencimientoActual && u.fechaVencimiento ? { fechaVencimiento: u.fechaVencimiento } : {})
    }
  })
}

// ── Reconstruir CarteraCache ─────────────────────────────────────────────────
export async function reconstruirCartera(integracionId: string, empresaId: string, soloClienteApiIds?: string[]) {
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: {
      integracionId, condition: true,
      ...(soloClienteApiIds && soloClienteApiIds.length > 0 ? { clienteApiId: { in: soloClienteApiIds } } : {})
    }
  })

  const sdIds = deudas.map((d: any) => d.id)
  const todasLasAplicaciones = sdIds.length > 0 ? await (prisma as any).pagoCarteraDeuda.findMany({
    where: { syncDeudaId: { in: sdIds } },
    select: { syncDeudaId: true, montoAplicado: true, createdAt: true, PagoCartera: { select: { saldoAnterior: true } } },
    orderBy: { createdAt: 'asc' }
  }) : []
  const apls = todasLasAplicaciones.map((a: any) => ({
    syncDeudaId: a.syncDeudaId,
    montoAplicado: a.montoAplicado,
    createdAt: a.createdAt,
    saldoAnterior: a.PagoCartera?.saldoAnterior ?? null,
  }))
  const nSaldoMap = calcularNSaldoBatch(
    deudas.map((d: any) => ({ id: d.id, valor: d.valor, numeroFactura: d.numeroFactura, nSaldo: d.nSaldo, saldo: d.saldo, nSaldoBase: d.nSaldoBase, nSaldoBaseAt: d.nSaldoBaseAt, ajusteManual: d.ajusteManual })),
    apls
  )

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

    const deudasDetalle = deudasOrdenadas
      .map((d: any) => {
        const valor = Number(d.valor)
        const nSaldo = nSaldoMap[d.id]?.nSaldo ?? Math.max(0, Number(d.nSaldo ?? d.saldo ?? d.valor))
        const { estado } = calcularEstado(nSaldo, valor, Number(d.abono), d.fechaVencimiento)
        const abonoEfectivo = d.nSaldoBase != null ? Math.max(0, valor - nSaldo) : Number(d.abono)
        return { id: d.id, externalId: d.externalId, numeroOrden: d.numeroOrden, numeroFactura: d.numeroFactura, valor, saldo: nSaldo, abono: abonoEfectivo, diasCredito: d.diasCredito, fechaVencimiento: d.fechaVencimiento, estado, electronicInvoiceNumber: (d.data as any)?.electronicInvoiceNumber || null, _nSaldo: nSaldo }
      })
      .filter((d: any) => d._nSaldo > 0)

    for (const d of deudasDetalle) {
      porEstado[d.estado] = (porEstado[d.estado] || 0) + d.saldo
      saldoTotal += d.valor
      saldoPendiente += d.saldo
      delete (d as any)._nSaldo
    }

    if (saldoPendiente <= 0) {
      await (prisma as any).carteraCache.deleteMany({ where: { integracionId, clienteApiId: apiId } })
      continue
    }

    await (prisma as any).carteraCache.upsert({
      where: { integracionId_clienteApiId: { integracionId, clienteApiId: apiId } },
      create: { id: `cc-${integracionId}-${apiId}`, empresaId, integracionId, clienteId: cliente.id, clienteApiId: apiId, nombre: cliente.nombre, nit: cliente.nit, telefono: cliente.telefono, ciudad: cliente.ciudad, empleadoExternalId: empleadoPrincipal, empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null, saldoTotal, saldoPendiente, porEstado, deudas: deudasDetalle, totalDeudas: deudasDetalle.length, ultimaActualizacion: ahora },
      update: { clienteId: cliente.id, nombre: cliente.nombre, nit: cliente.nit, telefono: cliente.telefono, ciudad: cliente.ciudad, empleadoExternalId: empleadoPrincipal, empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null, saldoTotal, saldoPendiente, porEstado, deudas: deudasDetalle, totalDeudas: deudasDetalle.length, ultimaActualizacion: ahora }
    })

    await Promise.all(deudasDetalle.map((d: any) =>
      (prisma as any).syncDeuda.update({
        where: { id: d.id },
        data: { nSaldo: d.saldo }
      })
    ))
  }

  await (prisma as any).carteraCache.deleteMany({
    where: { integracionId, saldoPendiente: { lte: 0 } }
  })

  return Object.keys(porCliente).length
}

// ── Función principal exportada ──────────────────────────────────────────────
export interface SyncNocturnoOpts {
  modo?: string // ignorado — mantenido por compatibilidad con route.ts
}

export interface SyncNocturnoResultado {
  empresaId: string
  clientesCache?: number
  inactivas?: number
  error?: string
}

export async function runSyncNocturno(opts: SyncNocturnoOpts = {}): Promise<SyncNocturnoResultado[]> {
  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  const resultados: SyncNocturnoResultado[] = []

  for (const intg of integraciones) {
    const _t0 = Date.now()
    const _det: Record<string, number> = {}
    const _t = (k: string, s: number) => { _det[k] = Date.now() - s }
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(config.apiKey, apiSecret)
      let _s = Date.now(); await adapter.login(); _t('login', _s)

      // ── fetchDeudasDesde — deudas con receivableAt reciente (pagos/vencimientos) ──
      const maxReceivable = await (prisma as any).syncDeuda.aggregate({
        where: { integracionId: intg.id, receivableAt: { not: null } },
        _max: { receivableAt: true }
      })
      const desdeCartera = maxReceivable._max.receivableAt
        ? new Date(new Date(maxReceivable._max.receivableAt).getTime() - 5 * 60 * 1000)
        : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

      _s = Date.now(); const deudasConPago = await adapter.fetchDeudasDesde(desdeCartera); _t('fetchDeudasDesde', _s)

      const clienteApiIdsAfectados: string[] = []

      if (deudasConPago.length > 0) {
        const extIds = deudasConPago.map((d: any) => String(d.uid || d._id))
        const sdExistentes = await (prisma as any).syncDeuda.findMany({
          where: { integracionId: intg.id, externalId: { in: extIds } },
          select: { id: true, externalId: true, saldo: true, saldoUptresOriginal: true, clienteApiId: true, fechaVencimiento: true }
        })
        const sdMap = new Map(sdExistentes.map((sd: any) => [sd.externalId, sd]))

        _s = Date.now()
        for (const d of deudasConPago) {
          const externalId = String(d.uid || d._id)
          const sdLocal: any = sdMap.get(externalId)
          if (!sdLocal) continue // deuda nueva — la crea sync-delta
          clienteApiIdsAfectados.push(sdLocal.clienteApiId)
          await reconciliarDeuda({
            sdId: sdLocal.id,
            externalId,
            saldo: parseFloat(String(d.vSaldo ?? '0')),
            valor: parseFloat(String(d.vTotal ?? '0')),
            condicionUpTres: Boolean(d.condicionUpTres !== false),
            saldoUptresAnterior: sdLocal.saldoUptresOriginal != null ? Number(sdLocal.saldoUptresOriginal) : Number(sdLocal.nSaldo ?? sdLocal.saldo),
            saldoLocalActual: Number(sdLocal.nSaldo ?? sdLocal.saldo),
            externalUpdatedAt: d.fModificado ? new Date(d.fModificado) : null,
            receivableAt: d.receivableAt ? new Date(d.receivableAt) : null,
            data: d,
            fechaVencimientoActual: sdLocal.fechaVencimiento ?? null,
          }, intg.id)
        }
        _t('reconciliacion', _s)
      }

      // ── reconstruirCartera — solo clientes afectados ──
      _s = Date.now()
      const clientesActualizados = clienteApiIdsAfectados.length > 0
        ? await reconstruirCartera(intg.id, intg.empresaId, [...new Set(clienteApiIdsAfectados)])
        : 0
      _t('reconstruirCartera', _s)

      // ── actualizarDeudasInactivas — saldos sucios condition=false (modo legacy) ──
      let inactivasActualizadas = 0
      try {
        _s = Date.now(); inactivasActualizadas = await actualizarDeudasInactivas(adapter, intg.id); _t('actualizarDeudasInactivas', _s)
      } catch (eInactivas: any) {
        console.error(`[sync-nocturno] actualizarDeudasInactivas fallo (no critico):`, eInactivas.message)
      }

      // ── Redis — invalida solo clientes afectados ──
      await invalidarCacheClientes(intg.empresaId, [...new Set(clienteApiIdsAfectados)]).catch(() => {})

      const totalMs = Date.now() - _t0
      console.log(`[sync-nocturno] ${intg.empresaId} OK ${totalMs}ms | ${Object.entries(_det).map(([k, v]) => k + ':' + v + 'ms').join(' | ')}`)
      resultados.push({ empresaId: intg.empresaId, clientesCache: clientesActualizados, inactivas: inactivasActualizadas })
    } catch (err: any) {
      console.error(`[sync-nocturno] Error integracion ${intg.id}:`, err.message)
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

  // SyncLog — snapshot de conteos para visibilidad/diagnóstico
  const integracionesMap = Object.fromEntries(integraciones.map((i: any) => [i.empresaId, i.id]))
  await Promise.allSettled(
    resultados.map(async (r) => {
      let snapshot: Record<string, number> | null = null
      try {
        const [clientesTotal, deudasActivas, empleadosActivos, listasTotal] = await Promise.all([
          (prisma as any).cliente.count({ where: { empresaId: r.empresaId } }),
          (prisma as any).syncDeuda.count({ where: { integracionId: integracionesMap[r.empresaId], condition: true } }),
          (prisma as any).empleado.count({ where: { empresaId: r.empresaId, activo: true } }),
          (prisma as any).listaClientes.count({ where: { empresaId: r.empresaId } }),
        ])
        snapshot = { clientesTotal, deudasActivas, empleadosActivos, listasTotal }
      } catch (eSnap: any) {
        console.error(`[sync-nocturno] snapshot fallo (no critico) para ${r.empresaId}:`, eSnap.message)
      }

      return prisma.syncLog.create({
        data: {
          integracionId: integracionesMap[r.empresaId] ?? 'system',
          inicio: new Date(),
          fin: new Date(),
          tipo: 'nocturno',
          estado: r.error ? 'error' : 'ok',
          disparadoPor: 'cron',
          empresaId: r.empresaId,
          deudasSincronizadas: 0,
          clientesActualizados: r.clientesCache ?? 0,
          errores: r.error
            ? { message: r.error, ...(snapshot ? { _snapshot: snapshot } : {}) }
            : (snapshot ? { _snapshot: snapshot } : undefined),
        },
      })
    })
  )

  // Purga SyncLog
  try {
    const schema = process.env.DB_SCHEMA || 'gestor'
    const sql = [
      'DELETE FROM ' + schema + '."SyncLog" WHERE',
      "  (tipo = 'delta' AND \"createdAt\" < NOW() - INTERVAL '7 days') OR",
      "  (tipo IN ('voucher-huella-delta','sms-polling','sms-facturas') AND \"createdAt\" < NOW() - INTERVAL '15 days') OR",
      "  (tipo NOT IN ('delta','voucher-huella-delta','sms-polling','sms-facturas','nocturno','sync-transprensa','rutas-dia','sync-productos','diagnostico-ia') AND \"createdAt\" < NOW() - INTERVAL '90 days')",
    ].join(' ')
    const deleted = await prisma.$executeRawUnsafe(sql)
    if (deleted > 0) console.log('[sync-nocturno] purga SyncLog: ' + deleted + ' filas')
  } catch (e: any) {
    console.error('[sync-nocturno] purga SyncLog error:', e.message)
  }

  return resultados
}
