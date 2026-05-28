import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { calcularEstado } from '@/lib/cartera'

// ── Reconstruir CarteraCache ────────────────────────────────────────────────
async function reconstruirCartera(integracionId: string, empresaId: string) {
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
    where: { syncDeudaId: { in: deudasIds } },
    select: { syncDeudaId: true, monto: true, descuento: true, createdAt: true }
  })
  const pagosMap: Record<string, number> = {}
  const deudaUpdatedAtMap: Record<string, Date> = {}
  for (const d of deudas) {
    if (d.externalUpdatedAt) deudaUpdatedAtMap[d.id] = new Date(d.externalUpdatedAt)
  }
  pagosLocales.forEach((p: any) => {
    if (!p.syncDeudaId) return
    const externalUpdatedAt = deudaUpdatedAtMap[p.syncDeudaId]
    const pagoFecha = new Date(p.createdAt)
    if (!externalUpdatedAt || pagoFecha > externalUpdatedAt) {
      pagosMap[p.syncDeudaId] = (pagosMap[p.syncDeudaId] || 0) + Number(p.monto) + Number(p.descuento || 0)
    }
  })

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
      const saldoSync = Number(d.saldo)
      const pagosLocal = pagosMap[d.id] || 0
      const saldoReal = Math.max(0, saldoSync - pagosLocal)
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

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const integraciones = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { id: true, empresaId: true, config: true }
  })

  const resultados = []
  for (const intg of integraciones) {
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(config.apiKey, apiSecret)
      await adapter.login()

      // Traer todas las deudas sin filtro de fecha
      const deudas = await adapter.fetchDeudas()
      let insertadas = 0
      let actualizadas = 0

      for (const d of deudas) {
        // DeudaExterna usa uid/_id, vSaldo, vTotal, dias, fModificado
        const externalId = String(d.uid || d._id)
        const saldo = parseFloat(String(d.vSaldo ?? '0'))
        const valor = parseFloat(String(d.vTotal ?? '0'))
        const clienteApiId = d.cliente?.uid || ''
        const empleadoExternalId = d.empleado?.uid || null
        const numeroOrden = d.numeroOrden ? parseInt(String(d.numeroOrden)) : null
        const numeroFactura = d.numeroFacturado ? parseInt(String(d.numeroFacturado)) : null
        const diasCredito = d.dias ? parseInt(String(d.dias)) : null
        const externalUpdatedAt = d.fModificado ? new Date(d.fModificado) : null

        const existing = await (prisma as any).syncDeuda.findUnique({
          where: { integracionId_externalId: { integracionId: intg.id, externalId } },
          select: { id: true }
        })

        if (existing) {
          await (prisma as any).syncDeuda.update({
            where: { integracionId_externalId: { integracionId: intg.id, externalId } },
            data: { saldo, valor, externalUpdatedAt, sincronizadoEl: new Date(), data: d as any }
          })
          actualizadas++
        } else {
          await (prisma as any).syncDeuda.create({
            data: {
              integracionId: intg.id,
              externalId,
              clienteApiId,
              empleadoExternalId,
              numeroOrden,
              numeroFactura,
              valor,
              saldo,
              diasCredito,
              condition: true,
              data: d as any,
              externalUpdatedAt,
              sincronizadoEl: new Date(),
            }
          })
          insertadas++
        }
      }

      // Reconstruir CarteraCache
      const clientesActualizados = await reconstruirCartera(intg.id, intg.empresaId)
      resultados.push({ empresaId: intg.empresaId, deudas: deudas.length, insertadas, actualizadas, clientesCache: clientesActualizados })
    } catch (err: any) {
      resultados.push({ empresaId: intg.empresaId, error: err.message })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
