import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { invalidatePattern } from '@/lib/cache'
import fs from 'fs'
import path from 'path'

const municipiosDANE: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/municipios_dane.json'), 'utf-8')
)

async function deltaEmpresa(empresaId: string, integracionId: string, apiKey: string, apiSecret: string, origenVinculadaId: string | null = null, empresaDestinoId?: string) {
  const destino = empresaDestinoId || empresaId
  const adapter = new UpTresAdapter(apiKey, apiSecret)
  await adapter.login()

  // Ventana delta: desde ultimaSyncBodega, fallback 2 días
  const empresa = await prisma.empresa.findUnique({ where: { id: destino }, select: { ultimaSyncBodega: true } })
  const desde = empresa?.ultimaSyncBodega ?? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

  const ordenes = await adapter.fetchVentas(desde)
  // #3 fix: si no hay órdenes, avanzar ultimaSyncBodega a now() — el delta corrió OK
  // Solo no avanzar si el fetch falló (error), no si vino vacío legitimamente
  if (!ordenes.length) {
    await prisma.empresa.update({ where: { id: destino }, data: { ultimaSyncBodega: new Date() } })
    return { empresaId: destino, ordenes: 0, nuevasOrdenes: 0, nuevasDeudas: 0 }
  }

  // ── OrdenDespacho ────────────────────────────────────────────────────────
  const ordenesValidas = ordenes.filter((o: any) => {
    const numFactura = o.numeroFacturado ? String(o.numeroFacturado) : null
    const nombre = o.clienteNombre || o.clienteNombreApi
    const origenId = String(o.uid || o._id || '')
    return numFactura && nombre && origenId
  })

  const origenIds = ordenesValidas.map((o: any) => String(o.uid || o._id))
  const existentes = await (prisma as any).ordenDespacho.findMany({
    where: { empresaId: destino, origenId: { in: origenIds }, ...(origenVinculadaId ? { origenVinculadaId } : { origenVinculadaId: null }) },
    select: { origenId: true }
  })
  const existentesSet = new Set(existentes.map((e: any) => e.origenId))
  const nuevasOrdenes = ordenesValidas.filter((o: any) => !existentesSet.has(String(o.uid || o._id)))

  // Fallback clientes
  const clienteApiIds = [...new Set(nuevasOrdenes.map((o: any) => o.cliente?.uid).filter(Boolean))]
  const clienteNits = [...new Set(nuevasOrdenes.map((o: any) => o.clienteNit).filter(Boolean))]
  const clientesLocales = await (prisma as any).cliente.findMany({
    where: { empresaId, OR: [...(clienteApiIds.length ? [{ apiId: { in: clienteApiIds } }] : []), ...(clienteNits.length ? [{ nit: { in: clienteNits } }] : [])] },
    select: { apiId: true, nit: true, ciudad: true, direccion: true, telefono: true }
  })
  const porApiId = new Map(clientesLocales.filter((c: any) => c.apiId).map((c: any) => [c.apiId, c]))
  const porNit = new Map(clientesLocales.filter((c: any) => c.nit).map((c: any) => [c.nit, c]))

  const toCreate = nuevasOrdenes.map((orden: any) => {
    const origenId = String(orden.uid || orden._id)
    let ciudadNombre = (orden.ciudad as string) || ''
    if (orden.cityId && municipiosDANE[String(orden.cityId)]) ciudadNombre = municipiosDANE[String(orden.cityId)]
    else if (ciudadNombre.includes('/')) ciudadNombre = ciudadNombre.split('/').pop()?.trim() || ciudadNombre
    let direccion = orden.direccion || ''
    let telefono = orden.telefono || ''
    let clienteNit = orden.clienteNit || ''
    const clienteApiId = orden.cliente?.uid || null
    const cli = (clienteApiId && porApiId.get(clienteApiId)) || (clienteNit && porNit.get(clienteNit))
    if (cli) {
      if (!ciudadNombre && cli.ciudad) ciudadNombre = cli.ciudad
      if (!direccion && cli.direccion) direccion = cli.direccion
      if (!telefono && cli.telefono) telefono = cli.telefono
      if (!clienteNit && cli.nit) clienteNit = cli.nit
    }
    return {
      numeroOrden: String(orden.numeroOrden || ''),
      numeroFactura: String(orden.numeroFacturado),
      vendedorApiId: orden.empleado?.uid || null,
      clienteApiId,
      clienteNombre: orden.clienteNombre || orden.clienteNombreApi,
      clienteNit,
      ciudad: ciudadNombre,
      direccion,
      telefono,
      fechaOrden: orden.fCreado ? new Date(orden.fCreado as string) : new Date(),
      totalOrden: orden.vTotal ? parseFloat(orden.vTotal) : null,
      isFacturada: orden.isInvoiced === true,
      isActiva: (orden as any).isActiva !== false,
      fechaFactura: orden.invoicedAt ? new Date(orden.invoicedAt) : null,
      empresaId: destino,
      origen: origenVinculadaId ? 'vinculada' : 'propia',
      origenId,
      origenVinculadaId,
      estado: 'pendiente',
    }
  })

  // ── SyncDeuda — órdenes de crédito nuevas ────────────────────────────────
  const ordenesCredito = ordenesValidas.filter((o: any) =>
    (o as any).paymentType === 'credito' &&
    parseFloat((o as any).balance ?? '0') > 0 &&
    (o as any).isActiva !== false
  )
  const externalIdsCredito = ordenesCredito.map((o: any) => String(o.uid || o._id))
  const deudaExistentes = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, externalId: { in: externalIdsCredito } },
    select: { externalId: true }
  })
  const deudaExistentesSet = new Set(deudaExistentes.map((d: any) => d.externalId))
  const nuevasDeudas = ordenesCredito.filter((o: any) => !deudaExistentesSet.has(String(o.uid || o._id)))

  const deudaToCreate = nuevasDeudas.map((o: any) => ({
    integracionId,
    externalId: String(o.uid || o._id),
    clienteApiId: o.cliente?.uid || o.customerId || '',
    empleadoExternalId: o.empleado?.uid || o.employeeId || null,
    numeroOrden: o.numeroOrden ? parseInt(String(o.numeroOrden)) : null,
    numeroFactura: o.numeroFacturado ? parseInt(String(o.numeroFacturado)) : null,
    valor: parseFloat(o.vTotal ?? o.total ?? '0'),
    saldo: parseFloat(o.balance ?? '0'),
    diasCredito: o.creditDay ? parseInt(String(o.creditDay)) : null,
    condition: true,
    data: o,
    externalUpdatedAt: o.updatedAt ? new Date(o.updatedAt) : null,
    sincronizadoEl: new Date(),
  }))

  // ── Transacción ───────────────────────────────────────────────────────────
  const canceladasIds = ordenesValidas.filter((o: any) => (o as any).isActiva === false).map((o: any) => String(o.uid || o._id))

  // ultimaSyncBodega avanza a now() — el delta corrió correctamente
  const proximoDesde = new Date()

  await prisma.$transaction(async (tx: any) => {
    if (toCreate.length) await tx.ordenDespacho.createMany({ data: toCreate, skipDuplicates: true })
    if (canceladasIds.length) await tx.ordenDespacho.updateMany({ where: { origenId: { in: canceladasIds }, empresaId: destino }, data: { isActiva: false } })
    if (deudaToCreate.length) await tx.syncDeuda.createMany({ data: deudaToCreate, skipDuplicates: true })
    await tx.empresa.update({ where: { id: destino }, data: { ultimaSyncBodega: proximoDesde } })
  }, { timeout: 30000 })

  // Invalida Redis solo si hubo cambios reales
  if (toCreate.length || deudaToCreate.length) {
    // Patrones reales usados por los endpoints con cache
    await invalidatePattern('g:v:*')        // vendedor/stats → g:v:{userId}:{fecha}
    await invalidatePattern('g:*:stats:*') // stats admin → g:{empresaId}:stats:{fecha}
    await invalidatePattern('g:*:cartera:*') // cartera/resumen → g:{empresaId}:cartera:*
  }

  return { empresaId: destino, ordenes: ordenes.length, nuevasOrdenes: toCreate.length, nuevasDeudas: deudaToCreate.length }
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
      const r = await deltaEmpresa(intg.empresaId, intg.id, config.apiKey, apiSecret)
      resultados.push(r)

      // Vinculadas
      const vinculadas = await (prisma as any).empresaVinculada.findMany({
        where: { empresaId: intg.empresaId, activa: true },
        select: { id: true, nombre: true, empresaClienteId: true }
      })
      for (const v of vinculadas) {
        try {
          const rv = await deltaEmpresa(v.empresaClienteId, intg.id, config.apiKey, apiSecret, v.id, intg.empresaId)
          resultados.push({ ...rv, vinculada: v.nombre })
        } catch (err: any) {
          resultados.push({ vinculada: v.nombre, error: err.message })
        }
      }
    } catch (err: any) {
      resultados.push({ empresaId: intg.empresaId, error: err.message })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
