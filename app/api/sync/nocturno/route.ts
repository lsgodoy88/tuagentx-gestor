import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { invalidatePattern } from '@/lib/cache'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { calcularEstado } from '@/lib/cartera'

// UTC → Bogotá (UTC-5)
function toBogota(utcDate: Date | null): Date | null {
  if (!utcDate) return null
  return new Date(utcDate.getTime() - 5 * 60 * 60 * 1000)
}

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

  const resultados: any[] = []
  for (const intg of integraciones) {
    try {
      const config = intg.config as any
      const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
      const adapter = new UpTresAdapter(config.apiKey, apiSecret)
      await adapter.login()

      // Traer todas las deudas sin filtro de fecha
      const deudas = await adapter.fetchDeudas()
      // #1 fix: batch en lugar de N+1
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

      // Batch insert
      if (toInsert.length) {
        await (prisma as any).syncDeuda.createMany({ data: toInsert, skipDuplicates: true })
      }

      // Batch update — chunks de 100 para no sobrecargar
      const CHUNK = 100
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const chunk = toUpdate.slice(i, i + CHUNK)
        await Promise.all(chunk.map((u: any) =>
          (prisma as any).syncDeuda.update({
            where: { integracionId_externalId: { integracionId: intg.id, externalId: u.externalId } },
            data: { saldo: u.saldo, valor: u.valor, externalUpdatedAt: u.externalUpdatedAt, receivableAt: u.receivableAt, sincronizadoEl: new Date(), data: u.data }
          })
        ))
      }

      const insertadas = toInsert.length
      const actualizadas = toUpdate.length

      // #2 fix: marcar como inactivas deudas que ya no están en UpTres
      const externalIdsActivos = new Set(externalIds)
      const huerfanas = await (prisma as any).syncDeuda.updateMany({
        where: {
          integracionId: intg.id,
          condition: true,
          externalId: { notIn: Array.from(externalIdsActivos) }
        },
        data: { condition: false, sincronizadoEl: new Date() }
      })


      // Reconstruir CarteraCache
      const clientesActualizados = await reconstruirCartera(intg.id, intg.empresaId)

      // #4 fix: invalidar Redis para que dashboard vea datos frescos
      await invalidatePattern('g:v:*')
      await invalidatePattern('g:*:stats:*')
      await invalidatePattern('g:*:cartera:*')

      resultados.push({ empresaId: intg.empresaId, deudas: deudas.length, insertadas, actualizadas, clientesCache: clientesActualizados })
    } catch (err: any) {
      resultados.push({ empresaId: intg.empresaId, error: err.message })
    }
  }

  // ── Limpieza SyncLog — retención 2 días ────────────────────────────────
  try {
    const hace2dias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const eliminados = await (prisma as any).syncLog.deleteMany({
      where: { createdAt: { lt: hace2dias } }
    })
    if (eliminados.count > 0) {
      console.log(`[nocturno] SyncLog limpieza: ${eliminados.count} registros eliminados (>2 días — retención 2 días)`)
    }
  } catch (err: any) {
    console.error('[nocturno] SyncLog limpieza error:', err.message)
  }

  return NextResponse.json({ ok: true, resultados })
}
