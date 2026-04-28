import { prisma } from '@/lib/prisma'
import { calcularEstado } from '@/lib/cartera'
import type { AdaptadorIntegracion, DeudaExterna } from './types'
import { UpTresAdapter } from './adapters/uptres'
import { UpTres2Adapter } from './adapters/uptres2'

export async function sincronizarDeudas(
  deudas: DeudaExterna[],
  integracionId: string,
  empresaId: string
): Promise<Set<string>> {
  const clienteApiIds = new Set<string>()

  for (const o of deudas) {
    const externalId = (o.uid || o._id) as string
    const clienteUid = o.cliente?.uid
    if (!externalId || !clienteUid) continue

    const saldo = parseFloat(o.vSaldo as string || '0')
    const activo = (o.condition === true || o.condition === undefined) && saldo > 0

    clienteApiIds.add(clienteUid)

    if (!activo) {
      // Marcar como inactiva si existe
      await (prisma as any).syncDeuda.updateMany({
        where: { integracionId, externalId },
        data: { condition: false }
      })
      continue
    }

    const existing = await (prisma as any).syncDeuda.findUnique({
      where: { integracionId_externalId: { integracionId, externalId } },
      select: { saldo: true }
    })

    await (prisma as any).syncDeuda.upsert({
      where: { integracionId_externalId: { integracionId, externalId } },
      create: {
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
        fechaVencimiento: o.fPago ? new Date(o.fPago) : null,
        condition: true,
        modificadoEn: o.fModificado ? new Date(o.fModificado) : null,
        data: o,
      },
      update: {
        saldoAnterior: existing?.saldo ?? saldo,
        saldo,
        abono: parseFloat(o.vAbono as string || '0'),
        condition: true,
        modificadoEn: o.fModificado ? new Date(o.fModificado) : null,
      }
    })
  }

  return clienteApiIds
}

export function crearAdaptador(tipo: string, config: Record<string, string>): AdaptadorIntegracion {
  if (tipo === 'uptres2') return new UpTres2Adapter(config.apiKey, config.apiSecret)
  return new UpTresAdapter(config.token)
}

export async function actualizarCache(
  clienteApiIds: Set<string>,
  integracionId: string,
  empresaId: string
): Promise<void> {
  if (clienteApiIds.size === 0) return

  const apiIdsArr = [...clienteApiIds]

  // Traer deudas activas de los clientes afectados
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, clienteApiId: { in: apiIdsArr }, condition: true }
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
    where: { syncDeudaId: { in: deudasIds } }
  })
  const pagosMap: Record<string, number> = {}
  pagosLocales.forEach((p: any) => {
    if (p.syncDeudaId) pagosMap[p.syncDeudaId] = (pagosMap[p.syncDeudaId] || 0) + Number(p.monto)
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
      const saldoAnt = Number(d.saldoAnterior ?? d.saldo)
      const pagosLocal = pagosMap[d.id] || 0
      const saldoCambio = Math.abs(saldoSync - saldoAnt) > 0.01
      const saldoReal = saldoCambio ? saldoSync : Math.max(0, saldoSync - pagosLocal)

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
