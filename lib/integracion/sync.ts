import { prisma } from '@/lib/prisma'
import { calcularEstado } from '@/lib/cartera'
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

export async function actualizarCache(
  clienteApiIds: Set<string>,
  integracionId: string,
  empresaId: string
): Promise<void> {
  if (clienteApiIds.size === 0) return

  const apiIdsArr = [...clienteApiIds]

  // Traer deudas activas de los clientes afectados
  // Incluir condition=false si aún tienen saldo pendiente (UpTres las cerró pero no se cobró)
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, clienteApiId: { in: apiIdsArr }, saldo: { gt: 0 } }
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

  // Traer pagos locales
  const deudasIds = deudas.map((d: any) => d.id)
  const pagosLocales = await (prisma as any).pagoCartera.findMany({
    where: { syncDeudaId: { in: deudasIds } },
    select: { syncDeudaId: true, monto: true, descuento: true, createdAt: true }
  })
  // Mapa externalUpdatedAt por deuda
  const deudaUpdMap: Record<string, Date> = {}
  for (const d of deudas) {
    if (d.externalUpdatedAt) deudaUpdMap[d.id] = new Date(d.externalUpdatedAt)
  }
  // Solo contar pagos posteriores al último updatedAt de UpTres
  const pagosMap: Record<string, number> = {}
  pagosLocales.forEach((p: any) => {
    if (!p.syncDeudaId) return
    const extUpd = deudaUpdMap[p.syncDeudaId]
    const pagoFecha = new Date(p.createdAt)
    if (!extUpd || pagoFecha > extUpd) {
      pagosMap[p.syncDeudaId] = (pagosMap[p.syncDeudaId] || 0) + Number(p.monto) + Number(p.descuento || 0)
    }
  })

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

    const deudasDetalle = deudasCliente.map((d: any) => {
      const saldoSync = Number(d.saldo)
      const pagosLocal = pagosMap[d.id] || 0
      const saldoReal = Math.max(0, saldoSync - pagosLocal)

      const valor = Number(d.valor)
      const { estado } = calcularEstado(saldoReal, valor, Number(d.abono), d.fechaVencimiento)
      porEstado[estado] = (porEstado[estado] || 0) + saldoReal

      saldoTotal += valor
      saldoPendiente += saldoReal

      return {
        id: d.id,
        externalId: d.externalId,
        numeroOrden: d.numeroOrden,
        numeroFactura: d.numeroFactura,
        valor,
        saldo: saldoReal,
        abono: Number(d.abono),
        diasCredito: d.diasCredito,
        fechaVencimiento: d.fechaVencimiento,
        estado,
      }
    })

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
