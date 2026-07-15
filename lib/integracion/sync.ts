import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { calcularNSaldoBatch } from '@/lib/cartera/calcularSaldo'

/**
 * Calcula nSaldo v3 para un conjunto de SyncDeuda IDs.
 * Delega a calcularNSaldoBatch — fuente unica de verdad.
 */
export async function calcularNSaldoPorDeuda(
  deudas: Array<{ id: string; valor: number | string; numeroFactura: number | string; nSaldo?: number | null; saldo?: number | null; nSaldoBase?: number | null; nSaldoBaseAt?: Date | string | null }>,
  empresaId: string
): Promise<Record<string, number>> {
  if (!deudas.length) return {}
  const ids = deudas.map(d => d.id)



  const aplicaciones = await (prisma as any).pagoCarteraDeuda.findMany({
    where: { syncDeudaId: { in: ids } },
    select: {
      syncDeudaId: true, montoAplicado: true, createdAt: true,
      PagoCartera: { select: { saldoAnterior: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  const apls = aplicaciones.map((a: any) => ({
    syncDeudaId: a.syncDeudaId,
    montoAplicado: a.montoAplicado,
    createdAt: a.createdAt,
    saldoAnterior: a.PagoCartera?.saldoAnterior ?? null,
  }))

  const batch = calcularNSaldoBatch(deudas, apls)
  const result: Record<string, number> = {}
  for (const [id, r] of Object.entries(batch)) result[id] = r.nSaldo
  return result
}

import { calcularEstado } from '@/lib/cartera'
import { invalidarCacheCliente, invalidarCacheClientes } from '@/lib/cartera/saldoCliente'
import type { AdaptadorIntegracion, DeudaExterna } from './types'
import { UpTresAdapter } from './adapters/uptres'

export async function sincronizarDeudas(
  deudas: DeudaExterna[],
  integracionId: string,
  empresaId: string
): Promise<Set<string>> {
  const clienteApiIds = new Set<string>()

  // 1. Traer todos los existentes de una sola vez
  const externalIds = deudas.map(o => (o.uid || o._id) as string).filter(Boolean)
  const existentes = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, externalId: { in: externalIds } },
    select: { externalId: true, saldo: true }
  })
  const mapaExistentes = new Map<string, number>(
    existentes.map((e: any) => [e.externalId, parseFloat(e.saldo)])
  )

  // 2. Calcular operaciones en memoria
  const toCreate: any[] = []
  const toUpdateSaldo: Array<{ externalId: string, saldo: number, saldoAnterior: number, condicionUpTres: boolean, fechaVencimiento?: Date | null }> = []
  const toDeactivate: string[] = []

  for (const o of deudas) {
    const externalId = (o.uid || o._id) as string
    const clienteUid = o.cliente?.uid
    if (!externalId || !clienteUid) continue

    const saldo = parseFloat(o.vSaldo as string || '0')
    const condicionUpTres = (o as any).condicionUpTres !== false
    const activo = (o.condition === true || o.condition === undefined) && saldo > 0
    clienteApiIds.add(clienteUid)

    if (!activo) {
      if (mapaExistentes.has(externalId)) toDeactivate.push(externalId)
      continue
    }

    if (mapaExistentes.has(externalId)) {
      // Ya existe — solo actualizar saldo
      const fvenc = (() => {
        if (o.fPago) return new Date(o.fPago)
        const dias = parseInt(String(o.dias || '0'))
        if (dias > 0 && o.fCreado) { const f = new Date(o.fCreado); f.setDate(f.getDate() + dias); return f }
        return null
      })()
      toUpdateSaldo.push({ externalId, saldo, saldoAnterior: mapaExistentes.get(externalId) ?? saldo, condicionUpTres, fechaVencimiento: fvenc })
    } else {
      // Nueva — insertar completa
      const fechaVenc = (() => {
        if (o.fPago) return new Date(o.fPago)
        const dias = parseInt(String(o.dias || '0'))
        if (dias > 0 && o.fCreado) {
          const f = new Date(o.fCreado); f.setDate(f.getDate() + dias); return f
        }
        return null
      })()
      toCreate.push({
        id: `sd-${externalId}`,
        integracionId,
        externalId,
        clienteApiId: clienteUid,
        empleadoExternalId: o.empleado?.uid || null,
        numeroOrden: o.numeroOrden || 0,
        numeroFactura: o.numeroFacturado || 0,
        valor: parseFloat(o.vTotal as string || '0'),
        saldo,
        saldoAnterior: saldo,
        abono: parseFloat(o.vAbono as string || '0'),
        diasCredito: parseInt(o.dias as string || '0'),
        fechaVencimiento: fechaVenc,
        condition: condicionUpTres,
        condicionUpTres,
        modificadoEn: o.fModificado ? new Date(o.fModificado) : null,
        externalUpdatedAt: o.fModificado ? new Date(o.fModificado) : null,
        data: o,
      })
    }
  }

  // 3. Ejecutar todo en una sola transacción — o todo o nada
  await prisma.$transaction(async (tx: any) => {
    if (toCreate.length > 0) {
      await tx.syncDeuda.createMany({ data: toCreate, skipDuplicates: true })
    }
    for (const u of toUpdateSaldo) {
      await tx.syncDeuda.updateMany({
        where: { integracionId, externalId: u.externalId },
        data: {
          saldo: u.saldo, saldoAnterior: u.saldoAnterior,
          condition: u.condicionUpTres, condicionUpTres: u.condicionUpTres,
          ...(u.fechaVencimiento ? { fechaVencimiento: u.fechaVencimiento } : {})
        }
      })
    }
    if (toDeactivate.length > 0) {
      await tx.syncDeuda.updateMany({
        where: { integracionId, externalId: { in: toDeactivate } },
        data: { condition: false }
      })
    }
  }, { timeout: 30000 })

  return clienteApiIds
}



/**
 * Sync completo: trae todas las activas de UpTres y marca como cerradas (zombis)
 * las SyncDeudas locales activas que no vinieron.
 */
export async function marcarZombis(
  externalIdsVivas: Set<string>,
  integracionId: string,
  empresaId: string
): Promise<number> {
  const localesActivas = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, condition: true },
    select: { id: true, externalId: true },
  })
  const zombis = localesActivas.filter((sd: any) => !externalIdsVivas.has(sd.externalId))
  if (zombis.length === 0) return 0
  // Guard anti-wipe: si el set de vivas es muy pequeño vs activas locales, no marcar
  const umbralSeguro = Math.max(100, Math.floor(localesActivas.length * 0.5))
  if (externalIdsVivas.size < umbralSeguro) {
    console.warn(`[marcarZombis] Guard activado — vivas=${externalIdsVivas.size} < umbral=${umbralSeguro} (activas=${localesActivas.length}) — NO se marcan zombis`)
    return 0
  }
  // Transacción: marcar todos los zombis de una vez o ninguno
  await prisma.$transaction(async (tx: any) => {
    await tx.syncDeuda.updateMany({
      where: { id: { in: zombis.map((z: any) => z.id) } },
      data: { saldo: 0, condition: false, externalUpdatedAt: new Date() },
    })
  }, { timeout: 15000 })
  return zombis.length
}

/**
 * Refresca deudas con pagos locales aun no confrontados, llamando UpTres por cliente.
 * Devuelve { clientesConsultados, pagosConfrontados }.
 */
export async function refrescarDeudasConPagosPendientes(
  adapter: AdaptadorIntegracion,
  integracionId: string,
  empresaId: string
): Promise<{ clientes: number, confrontados: number, deudasActualizadas: number }> {
  // Buscar SyncDeudas activas que tienen pagos locales registrados
  const pagos = await (prisma as any).pagoCartera.findMany({
    where: { syncDeudaId: { not: null } },
    select: { syncDeudaId: true, createdAt: true },
    distinct: ['syncDeudaId'],
  })
  if (pagos.length === 0) return { clientes: 0, confrontados: 0, deudasActualizadas: 0 }

  const sdIds = pagos.map((p: any) => p.syncDeudaId).filter(Boolean)
  const sds = await (prisma as any).syncDeuda.findMany({
    where: { id: { in: sdIds }, integracionId, condition: true },
  })
  const clienteApiIds = Array.from(new Set(sds.map((s: any) => s.clienteApiId).filter(Boolean))) as string[]

  let deudasActualizadas = 0

  for (const cliApiId of clienteApiIds) {
    let externas: DeudaExterna[] = []
    try {
      externas = await adapter.fetchDeudasCliente(cliApiId)
    } catch { continue }

    const externasMap = new Map(externas.map((e: any) => [e.uid || e.id, e]))
    const sdsDelCli = sds.filter((s: any) => s.clienteApiId === cliApiId)

    for (const sd of sdsDelCli) {
      const ext: any = externasMap.get(sd.externalId)
      if (!ext) continue
      const nuevoSaldo = Number(ext.vSaldo ?? 0)
      const nuevoUpd = ext.fModificado ? new Date(ext.fModificado) : new Date()
      const cambioSaldo = Math.abs(nuevoSaldo - Number(sd.saldo)) > 0.01
      const cambioUpd = nuevoUpd.getTime() !== new Date(sd.externalUpdatedAt || 0).getTime()
      if (cambioSaldo || cambioUpd) {
        await (prisma as any).syncDeuda.update({
          where: { id: sd.id },
          data: {
            saldo: nuevoSaldo,
            abono: Math.max(0, Number(sd.valor) - nuevoSaldo),
            condition: nuevoSaldo > 0,
            externalUpdatedAt: nuevoUpd,
          },
        })
        deudasActualizadas++
      }
    }
  }
  return { clientes: clienteApiIds.length, confrontados: 0, deudasActualizadas }
}

export function crearAdaptador(tipo: string, config: Record<string, string>): AdaptadorIntegracion {
  return new UpTresAdapter(config.apiKey, config.apiSecret)
}

/**
 * Escribe el saldo final de cada deuda directamente en CarteraCache, usando
 * el valor calculado en el recibo (reciboPago.detalles[i].saldoDespues) como
 * única fuente de verdad. El recibo y el cache siempre muestran el mismo
 * número — cero cálculo adicional, cero race condition, cero divergencia.
 *
 * saldoFinal es un valor ABSOLUTO (el nuevo saldo de la deuda después del
 * pago), no un delta — así no depende del saldo actual del cache para derivar
 * el nuevo, eliminando cualquier posibilidad de acumulación de errores.
 */
export async function aplicarPagoEnCache(
  clienteApiId: string,
  integracionId: string,
  empresaId: string,
  ajustes: Array<{ syncDeudaId: string; saldoFinal: number }>
): Promise<void> {
  if (!ajustes.length) return
  try {
    const cc = await (prisma as any).carteraCache.findUnique({
      where: { integracionId_clienteApiId: { integracionId, clienteApiId } }
    })
    if (!cc) return // No existe aún — el nocturno lo generará

    const deudas: any[] = Array.isArray(cc.deudas) ? [...cc.deudas] : []
    const saldoFinalMap: Record<string, number> = {}
    for (const a of ajustes) saldoFinalMap[a.syncDeudaId] = a.saldoFinal

    let saldoPendiente = 0
    const deudasActualizadas = deudas
      .map((d: any) => {
        const saldoFinal = saldoFinalMap[d.id]
        const nuevoSaldo = saldoFinal !== undefined ? saldoFinal : Number(d.saldo)
        saldoPendiente += nuevoSaldo
        return saldoFinal !== undefined ? { ...d, saldo: nuevoSaldo } : d
      })
      // Una deuda con saldoFinal=0 sale de la vista — igual que hace
      // reconstruirCartera() con el filtro nSaldo > 0
      .filter((d: any) => d.saldo > 0)

    await (prisma as any).carteraCache.update({
      where: { integracionId_clienteApiId: { integracionId, clienteApiId } },
      data: {
        deudas: deudasActualizadas,
        saldoPendiente,
        totalDeudas: deudasActualizadas.length,
        ultimaActualizacion: new Date(),
      }
    })

    // Persistir nSaldo v3 en SyncDeuda para que pago-sync use saldoAntes correcto
    await Promise.all(ajustes.map(a =>
      (prisma as any).syncDeuda.update({
        where: { id: a.syncDeudaId },
        data: { nSaldo: a.saldoFinal }
      })
    ))
    // Invalidar cache Redis del cliente
    await invalidarCacheCliente(empresaId, clienteApiId).catch(() => {})
  } catch (e: any) {
    // No crítico — el sync nocturno reconstruye el cache con valores correctos
    console.error('[aplicarPagoEnCache] error (no critico):', e.message)
  }
}

export async function actualizarCache(
  clienteApiIds: Set<string>,
  integracionId: string,
  empresaId: string
): Promise<void> {
  if (clienteApiIds.size === 0) return

  const apiIdsArr = [...clienteApiIds]

  // FIX 26/06 — ya no filtramos por saldo crudo de UpTres > 0. Una deuda puede
  // tener saldo>0 en UpTres pero nSaldo<=0 si ya la cubrimos con nuestros propios
  // pagos (ver reconstruirCartera() en sync-nocturno.ts, misma lógica aquí).
  // Traemos TODAS las deudas activas (condition=true) o condition=false con
  // saldo>0 residual, y filtramos por nSaldo más abajo, después de calcularlo.
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: {
      integracionId, clienteApiId: { in: apiIdsArr },
      OR: [{ condition: true }, { condition: false, saldo: { gt: 0 } }],
    }
  })

  // Traer clientes
  const clientes = await (prisma as any).cliente.findMany({
    where: { apiId: { in: apiIdsArr }, empresaId },
    select: { id: true, apiId: true, nombre: true, nit: true, telefono: true, ciudad: true }
  })
  const clienteMap: Record<string, any> = {}
  clientes.forEach((c: any) => { clienteMap[c.apiId] = c })

  // Traer empleados
  const empleadoApiIds = [...new Set(deudas.map((d: any) => d.empleadoExternalId).filter(Boolean))] as string[]
  const empleados = await (prisma as any).empleado.findMany({
    where: { apiId: { in: empleadoApiIds }, empresaId },
    select: { apiId: true, nombre: true }
  })
  const empleadoMap: Record<string, string> = {}
  empleados.forEach((e: any) => { empleadoMap[e.apiId] = e.nombre })

  // Agrupar por cliente
  const porCliente: Record<string, any[]> = {}
  for (const d of deudas) {
    if (!porCliente[d.clienteApiId]) porCliente[d.clienteApiId] = []
    porCliente[d.clienteApiId].push(d)
  }

  const ahora = new Date()



  for (const apiId of apiIdsArr) {
    const cliente = clienteMap[apiId]
    if (!cliente) continue

    const deudasCliente = porCliente[apiId] || []

    // Si no tiene deudas activas → eliminar de cache
    if (deudasCliente.length === 0) {
      await (prisma as any).carteraCache.deleteMany({
        where: { integracionId, clienteApiId: apiId }
      })
      continue
    }

    const conteoEmpleado: Record<string, number> = {}
    for (const d of deudasCliente) {
      if (d.empleadoExternalId) conteoEmpleado[d.empleadoExternalId] = (conteoEmpleado[d.empleadoExternalId] || 0) + 1
    }
    const empleadoPrincipal = Object.keys(conteoEmpleado).sort((a, b) => conteoEmpleado[b] - conteoEmpleado[a])[0] ?? null

    const porEstado: Record<string, number> = { pendiente: 0, vencida: 0, mora: 0, critica: 0, pagada: 0 }
    let saldoTotal = 0
    let saldoPendiente = 0

    // nSaldo via calcularNSaldoBatch — misma lógica que reconstruirCartera().
    // Se llama tras crear o eliminar un pago individual para mantener consistencia.
    const sdIdsCliente = deudasCliente.map((d: any) => d.id)
    const aplsCliente = sdIdsCliente.length > 0 ? (await (prisma as any).pagoCarteraDeuda.findMany({
      where: { syncDeudaId: { in: sdIdsCliente } },
      select: { syncDeudaId: true, montoAplicado: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    })).map((a: any) => ({ syncDeudaId: a.syncDeudaId, montoAplicado: a.montoAplicado, createdAt: a.createdAt })) : []
    const nSaldoMapCliente = calcularNSaldoBatch(
      deudasCliente.map((d: any) => ({ id: d.id, valor: d.valor, numeroFactura: d.numeroFactura, nSaldo: d.nSaldo, saldo: d.saldo, nSaldoBase: d.nSaldoBase, nSaldoBaseAt: d.nSaldoBaseAt })),
      aplsCliente
    )

    const deudasDetalle = deudasCliente
      .map((d: any) => {
        const valor = Number(d.valor)
        const nSaldo = nSaldoMapCliente[d.id]?.nSaldo ?? Math.max(0, Number(d.nSaldo ?? d.saldo ?? d.valor))
        const { estado } = calcularEstado(nSaldo, valor, Number(d.abono), d.fechaVencimiento)
        return {
          id: d.id,
          externalId: d.externalId,
          numeroOrden: d.numeroOrden,
          numeroFactura: d.numeroFactura,
          valor,
          saldo: nSaldo,
          abono: Number(d.abono),
          diasCredito: d.diasCredito,
          fechaVencimiento: d.fechaVencimiento,
          estado,
          _nSaldo: nSaldo,
        }
      })
      .filter((d: any) => d._nSaldo > 0)

    for (const d of deudasDetalle) {
      porEstado[d.estado] = (porEstado[d.estado] || 0) + d.saldo
      saldoTotal += d.saldo    // usar nSaldo (d.saldo) no valor bruto
      saldoPendiente += d.saldo
      delete (d as any)._nSaldo
    }

    // No incluir clientes sin saldo pendiente real
    if (saldoPendiente <= 0) {
      await (prisma as any).carteraCache.deleteMany({
        where: { integracionId, clienteApiId: apiId }
      })
      continue
    }

    await (prisma as any).carteraCache.upsert({
      where: { integracionId_clienteApiId: { integracionId, clienteApiId: apiId } },
      create: {
        id: `cc-${integracionId}-${apiId}`,
        empresaId,
        integracionId,
        clienteId: cliente.id,
        clienteApiId: apiId,
        nombre: cliente.nombre,
        nit: cliente.nit,
        telefono: cliente.telefono,
        ciudad: cliente.ciudad,
        empleadoExternalId: empleadoPrincipal,
        empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null,
        saldoTotal,
        saldoPendiente,
        porEstado,
        deudas: deudasDetalle,
        totalDeudas: deudasDetalle.length,
        ultimaActualizacion: ahora,
      },
      update: {
        clienteId: cliente.id,
        nombre: cliente.nombre,
        nit: cliente.nit,
        telefono: cliente.telefono,
        ciudad: cliente.ciudad,
        empleadoExternalId: empleadoPrincipal,
        empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null,
        saldoTotal,
        saldoPendiente,
        porEstado,
        deudas: deudasDetalle,
        totalDeudas: deudasDetalle.length,
        ultimaActualizacion: ahora,
      }
    })

    // Persistir nSaldo v3 en SyncDeuda (incluye deudas eliminadas del detalle por saldo=0)
    await Promise.all(deudasCliente.map((d: any) => {
      const det = deudasDetalle.find((x: any) => x.id === d.id)
      return (prisma as any).syncDeuda.update({
        where: { id: d.id },
        data: { nSaldo: det ? det.saldo : 0 }
      })
    }))
    // Invalidar cache Redis del cliente
    await invalidarCacheCliente(empresaId, apiId).catch(() => {})
  }
}


/**
 * actualizarDeudasInactivas — nocturno completo
 * Para deudas condition=false con saldo>0 en BD,
 * consulta UpTres con condition=false y actualiza el saldo real.
 * Si UpTres devuelve balance=0 o no las incluye → marca saldo=0, condition=false.
 */
export async function actualizarDeudasInactivas(
  adapter: UpTresAdapter,
  integracionId: string
): Promise<number> {
  // Traer deudas condition=false con saldo>0 agrupadas por clienteApiId
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, condition: false, saldo: { gt: 0 } },
    select: { id: true, externalId: true, clienteApiId: true, saldo: true, numeroFactura: true }
  })

  if (!deudas.length) return 0

  // Agrupar por clienteApiId para hacer una sola llamada por cliente
  const porCliente: Record<string, any[]> = {}
  for (const d of deudas) {
    if (!porCliente[d.clienteApiId]) porCliente[d.clienteApiId] = []
    porCliente[d.clienteApiId].push(d)
  }

  let actualizadas = 0

  for (const [clienteApiId, deudasCliente] of Object.entries(porCliente)) {
    try {
      // Consultar UpTres con condition=false para este cliente
      const deudasUptres = await adapter.fetchDeudasClienteInactivas(clienteApiId)
      const mapaUptres: Record<string, any> = {}
      for (const d of deudasUptres) {
        mapaUptres[d.uid] = d
      }

      for (const deuda of deudasCliente) {
        const uptres = mapaUptres[deuda.externalId]
        const nuevoSaldo = uptres ? parseFloat(String(uptres.vSaldo || 0)) : 0

        if (Math.abs(nuevoSaldo - deuda.saldo) > 0.01) {
          await (prisma as any).syncDeuda.update({
            where: { id: deuda.id },
            data: {
              saldo: nuevoSaldo,
              condition: nuevoSaldo > 0,
              externalUpdatedAt: new Date(),
            }
          })
          actualizadas++
        }
      }
    } catch {
      // Si falla un cliente, continuar con los demás
      continue
    }
  }

  return actualizadas
}
