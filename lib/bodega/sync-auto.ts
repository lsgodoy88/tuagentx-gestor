import { prisma } from '@/lib/prisma'
import { UpTresAdapter, parseFechaUptresBogota } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { invalidatePattern } from '@/lib/cache'
import { testigo } from '@/lib/testigo'
import fs from 'fs'
import path from 'path'

const municipiosDANE: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/municipios_dane.json'), 'utf-8')
)

async function syncEmpresa(empresaIdConIntegracion: string, origenVinculadaId: string | null = null) {
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId: empresaIdConIntegracion, tipo: 'uptres', activa: true },
  })
  if (!integracion) return { empresaId: empresaIdConIntegracion, error: 'Sin integración' }

  const config = integracion.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(config.apiKey, apiSecret)
  await adapter.login()

  const empresaData = await prisma.empresa.findUnique({
    where: { id: empresaIdConIntegracion },
    select: { ultimaSyncBodega: true },
  })
  const desde = empresaData?.ultimaSyncBodega ?? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

  const ordenes = await adapter.fetchVentas(desde)
  const desdeTs = desde.getTime()
  const ordenesFiltradas = ordenes.filter((o: any) => {
    const fc = o.fCreado ? new Date(o.fCreado as string).getTime() : 0
    const fi = o.invoicedAt ? new Date(o.invoicedAt as string).getTime() : 0
    return fc >= desdeTs || fi >= desdeTs
  })

  const ordenesValidas = ordenesFiltradas.filter((orden: any) => {
    const numFactura = orden.numeroFacturado ? String(orden.numeroFacturado) : null
    const origenId = String(orden.uid || orden._id || '')
    return numFactura && origenId
  })

  const origenIds = ordenesValidas.map((o: any) => String(o.uid || o._id))
  const existentes = await (prisma as any).ordenDespacho.findMany({
    where: { empresaId: empresaIdConIntegracion, origenId: { in: origenIds } },
    select: { origenId: true },
  })
  const existentesSet = new Set(existentes.map((e: any) => e.origenId))
  const nuevasOrdenes = ordenesValidas.filter((o: any) => !existentesSet.has(String(o.uid || o._id)))

  if (nuevasOrdenes.length === 0) {
    await prisma.empresa.update({ where: { id: empresaIdConIntegracion }, data: { ultimaSyncBodega: new Date() } })
    return { empresaId: empresaIdConIntegracion, ordenes: ordenesFiltradas.length, nuevas: 0, actualizadas: 0 }
  }

  const clienteApiIds = [...new Set(nuevasOrdenes.map((o: any) => o.cliente?.uid).filter(Boolean))]
  const clienteNits = [...new Set(nuevasOrdenes.map((o: any) => o.clienteNit).filter(Boolean))]
  const clientesLocales = await (prisma as any).cliente.findMany({
    where: {
      empresaId: empresaIdConIntegracion,
      OR: [
        clienteApiIds.length > 0 ? { apiId: { in: clienteApiIds } } : undefined,
        clienteNits.length > 0 ? { nit: { in: clienteNits } } : undefined,
      ].filter(Boolean),
    },
    select: { apiId: true, nit: true, ciudad: true, direccion: true, telefono: true },
  })
  const mapaClientePorApiId = new Map(clientesLocales.filter((c: any) => c.apiId).map((c: any) => [c.apiId, c]))
  const mapaClientePorNit = new Map(clientesLocales.filter((c: any) => c.nit).map((c: any) => [c.nit, c]))

  const toCreate = nuevasOrdenes.map((orden: any) => {
    const origenId = String(orden.uid || orden._id)
    const vendedorApiId = orden.empleado?.uid || null
    const clienteApiId = orden.cliente?.uid || null

    let ciudadNombre = (orden.ciudad as string) || ''
    if (orden.cityId && municipiosDANE[String(orden.cityId)]) {
      ciudadNombre = municipiosDANE[String(orden.cityId)]
    } else if (ciudadNombre.includes('/')) {
      ciudadNombre = ciudadNombre.split('/').pop()?.trim() || ciudadNombre
    }

    let direccion = orden.direccion || ''
    let telefono = orden.telefono || ''
    let clienteNit = orden.clienteNit || ''

    const cli = (clienteApiId && mapaClientePorApiId.get(clienteApiId)) ||
                (clienteNit && mapaClientePorNit.get(clienteNit))
    if (cli) {
      if (!ciudadNombre && cli.ciudad) ciudadNombre = cli.ciudad
      if (!direccion && cli.direccion) direccion = cli.direccion
      if (!telefono && cli.telefono) telefono = cli.telefono
      if (!clienteNit && cli.nit) clienteNit = cli.nit
    }

    return {
      numeroOrden: String(orden.numeroOrden || ''),
      numeroFactura: String(orden.numeroFacturado),
      vendedorApiId,
      clienteApiId,
      clienteNombre: orden.clienteNombre || orden.clienteNombreApi || 'Sin nombre',
      clienteNit,
      ciudad: ciudadNombre,
      direccion,
      telefono,
      fechaOrden: orden.fCreado ? parseFechaUptresBogota(orden.fCreado as string) : new Date(),
      fechaOrdenBogota: orden.fCreado ? parseFechaUptresBogota(orden.fCreado as string) : new Date(),
      totalOrden: orden.vTotal ? parseFloat(orden.vTotal) : null,
      isFacturada: orden.isInvoiced === true,
      isActiva: (orden as any).isActiva !== false,
      fechaFactura: orden.invoicedAt ? parseFechaUptresBogota(orden.invoicedAt) : null,
      empresaId: empresaIdConIntegracion,
      origen: 'propia',
      origenId,
      origenVinculadaId: null,
      estado: 'pendiente',
    }
  })

  const canceladasIds = ordenes
    .filter((o: any) => (o as any).isActiva === false)
    .map((o: any) => String(o.uid || o._id))

  await prisma.$transaction(async (tx: any) => {
    await tx.ordenDespacho.createMany({ data: toCreate, skipDuplicates: true })
    if (canceladasIds.length > 0) {
      await tx.ordenDespacho.updateMany({
        where: { origenId: { in: canceladasIds }, empresaId: empresaIdConIntegracion },
        data: { isActiva: false },
      })
    }
    await tx.empresa.update({ where: { id: empresaIdConIntegracion }, data: { ultimaSyncBodega: new Date() } })
  }, { timeout: 30000 })

  return { empresaId: empresaIdConIntegracion, ordenes: ordenesFiltradas.length, nuevas: toCreate.length, actualizadas: 0 }
}

export async function syncAutoTodas() {
  const resultados: any[] = []

  const empresas = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { empresaId: true },
  })

  for (const { empresaId } of empresas) {
    try {
      const r = await syncEmpresa(empresaId)
      resultados.push(r)

      const vinculadas = await (prisma as any).empresaVinculada.findMany({
        where: { empresaId, activa: true },
        select: { id: true, nombre: true, empresaClienteId: true },
      })

      for (const v of vinculadas) {
        try {
          const rv = await syncEmpresa(v.empresaClienteId, v.id)
          resultados.push({ ...rv, vinculada: v.nombre })
        } catch (err: any) {
          resultados.push({ vinculada: v.nombre, error: err.message })
        }
      }
    } catch (err: any) {
      resultados.push({ empresaId, error: err.message })
    }
  }

  const totalOrdenes = resultados.reduce((a: number, r: any) => a + (r.insertadas || 0), 0)
  await testigo({ evento: 'sync_bodega', ok: true, ordenes_nuevas: totalOrdenes, total: totalOrdenes, ms: 0 })

  const totalNuevas = resultados.reduce((a: number, r: any) => a + (r.nuevas || 0), 0)
  if (totalNuevas > 0) await invalidatePattern('g:v:*')

  return { ok: true, resultados }
}
