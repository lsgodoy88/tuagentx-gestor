import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calcularEstado } from '@/lib/cartera'

async function poblarCarteraCache(integracionId: string, empresaId: string) {
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
  const pagosLocales = await (prisma as any).pagoCartera.findMany({
    where: { syncDeudaId: { in: deudasIds } }
  })
  const pagosMap: Record<string, number> = {}
  pagosLocales.forEach((p: any) => {
    if (p.syncDeudaId) pagosMap[p.syncDeudaId] = (pagosMap[p.syncDeudaId] || 0) + Number(p.monto)
  })

  const porCliente: Record<string, any[]> = {}
  for (const d of deudas) {
    if (!porCliente[d.clienteApiId]) porCliente[d.clienteApiId] = []
    porCliente[d.clienteApiId].push(d)
  }

  const ahora = new Date()
  for (const [apiId, deudasCliente] of Object.entries(porCliente)) {
    const cliente = clienteMap[apiId]
    if (!cliente) continue

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

  return Object.keys(porCliente).length
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true }
  })

  let total = 0
  for (const integ of integraciones) {
    total += await poblarCarteraCache(integ.id, integ.empresaId)
  }

  return NextResponse.json({ ok: true, clientes: total })
}
