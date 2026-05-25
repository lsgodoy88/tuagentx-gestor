import { NextRequest, NextResponse } from 'next/server'
import { testigo } from '@/lib/testigo'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import fs from 'fs'
import path from 'path'

const municipiosDANE: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/municipios_dane.json'), 'utf-8')
)

async function syncEmpresa(empresaIdConIntegracion: string, origenVinculadaId: string | null = null, empresaBodegaId?: string) {
  // empresaIdConIntegracion: dueño de la API de UpTres (de donde traemos órdenes)
  // empresaBodegaId: dónde guardamos los OrdenDespacho (default = misma empresa)
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId: empresaIdConIntegracion, tipo: 'uptres', activa: true }
  })
  if (!integracion) return { empresaId: empresaIdConIntegracion, error: 'Sin integración' }

  const config = integracion.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(config.apiKey, apiSecret)
  await adapter.login()

  // Días historial de la empresa PRINCIPAL (no la vinculada)
  const principal = empresaBodegaId || empresaIdConIntegracion

  // SIEMPRE traer 30 días desde UpTres; la vista filtra localmente
  const dias = 30
  const desde = new Date(Date.now() - 5*60*60*1000)
  desde.setDate(desde.getDate() - dias)

  const ordenes = await adapter.fetchVentas(desde)
  const desdeTs = desde.getTime()
  const ordenesFiltradas = ordenes.filter((o: any) => {
    const fc = o.fCreado ? new Date(o.fCreado as string).getTime() : 0
    return fc >= desdeTs
  })

    // Insert-only: traer una vez, guardar, nunca sobreescribir
  let nuevas = 0
  const empresaDestino = empresaBodegaId || empresaIdConIntegracion

  // 1. Filtrar órdenes válidas (con factura y nombre)
  const ordenesValidas = ordenesFiltradas.filter((orden: any) => {
    const numFactura = orden.numeroFacturado ? String(orden.numeroFacturado) : null
    const nombre = orden.clienteNombre || orden.clienteNombreApi
    const origenId = String(orden.uid || orden._id || '')
    return numFactura && nombre && origenId
  })

  // 2. Un solo query para saber cuáles ya existen
  const origenIds = ordenesValidas.map((o: any) => String(o.uid || o._id))
  const existentes = await (prisma as any).ordenDespacho.findMany({
    where: {
      empresaId: empresaDestino,
      origenId: { in: origenIds },
      ...(origenVinculadaId ? { origenVinculadaId } : { origenVinculadaId: null })
    },
    select: { origenId: true }
  })
  const existentesSet = new Set(existentes.map((e: any) => e.origenId))

  // 3. Solo las nuevas
  const nuevasOrdenes = ordenesValidas.filter((o: any) => !existentesSet.has(String(o.uid || o._id)))
  if (nuevasOrdenes.length === 0) {
    await prisma.empresa.update({ where: { id: empresaDestino }, data: { ultimaSyncBodega: new Date() } })
    return { empresaId: empresaDestino, ordenes: ordenesFiltradas.length, nuevas: 0, actualizadas: 0 }
  }

  // 4. Fallback de clientes — un solo query por todos los apiIds/nits únicos
  const clienteApiIds = [...new Set(nuevasOrdenes.map((o: any) => o.cliente?.uid).filter(Boolean))]
  const clienteNits = [...new Set(nuevasOrdenes.map((o: any) => o.clienteNit).filter(Boolean))]
  const clientesLocales = await (prisma as any).cliente.findMany({
    where: {
      empresaId: empresaIdConIntegracion,
      OR: [
        clienteApiIds.length > 0 ? { apiId: { in: clienteApiIds } } : undefined,
        clienteNits.length > 0 ? { nit: { in: clienteNits } } : undefined,
      ].filter(Boolean)
    },
    select: { apiId: true, nit: true, ciudad: true, direccion: true, telefono: true }
  })
  const mapaClientePorApiId = new Map(clientesLocales.filter((c: any) => c.apiId).map((c: any) => [c.apiId, c]))
  const mapaClientePorNit = new Map(clientesLocales.filter((c: any) => c.nit).map((c: any) => [c.nit, c]))

  // 5. Construir registros en memoria
  const toCreate = nuevasOrdenes.map((orden: any) => {
    const origenId = String(orden.uid || orden._id)
    const numPedido = String(orden.numeroOrden || '')
    const numFactura = String(orden.numeroFacturado)
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

    // Fallback desde mapa de clientes ya cargado
    const cli = (clienteApiId && mapaClientePorApiId.get(clienteApiId)) ||
                (clienteNit && mapaClientePorNit.get(clienteNit))
    if (cli) {
      if (!ciudadNombre && cli.ciudad) ciudadNombre = cli.ciudad
      if (!direccion && cli.direccion) direccion = cli.direccion
      if (!telefono && cli.telefono) telefono = cli.telefono
      if (!clienteNit && cli.nit) clienteNit = cli.nit
    }

    return {
      numeroOrden: numPedido,
      numeroFactura: numFactura,
      vendedorApiId,
      clienteApiId,
      clienteNombre: orden.clienteNombre || orden.clienteNombreApi,
      clienteNit,
      ciudad: ciudadNombre,
      direccion,
      telefono,
      fechaOrden: orden.fCreado ? new Date(orden.fCreado as string) : new Date(),
      totalOrden: orden.vTotal ? parseFloat(orden.vTotal) : null,
      isFacturada: orden.isInvoiced === true,
      fechaFactura: orden.invoicedAt ? new Date(orden.invoicedAt) : null,
      empresaId: empresaDestino,
      origen: origenVinculadaId ? 'vinculada' : 'propia',
      origenId,
      origenVinculadaId,
      estado: 'pendiente',
    }
  })

  // 6. Insertar todo en una transacción
  await prisma.$transaction(async (tx: any) => {
    await tx.ordenDespacho.createMany({ data: toCreate, skipDuplicates: true })
    await tx.empresa.update({ where: { id: empresaDestino }, data: { ultimaSyncBodega: new Date() } })
  }, { timeout: 30000 })

  nuevas = toCreate.length

  return { empresaId: empresaDestino, ordenes: ordenesFiltradas.length, nuevas, actualizadas: 0 }
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const resultados = []

  // Empresas con integración uptres activa
  const empresas = await (prisma as any).integracion.findMany({
    where: { tipo: 'uptres', activa: true },
    select: { empresaId: true }
  })

  for (const { empresaId } of empresas) {
    try {
      // Sync propia
      const r = await syncEmpresa(empresaId)
      resultados.push(r)

      // Sync empresas vinculadas (las que no tienen bodega propia)
      const vinculadas = await (prisma as any).empresaVinculada.findMany({
        where: { empresaId, activa: true },
        select: { id: true, nombre: true, empresaClienteId: true }
      })

      for (const v of vinculadas) {
        try {
          const rv = await syncEmpresa(v.empresaClienteId, v.id, empresaId)
          resultados.push({ ...rv, vinculada: v.nombre })
        } catch (err: any) {
          resultados.push({ vinculada: v.nombre, error: err.message })
        }
      }
    } catch (err: any) {
      resultados.push({ empresaId, error: err.message })
    }
  }

  // Contar total de órdenes procesadas
  const totalOrdenes = resultados.reduce((a: number, r: any) => a + (r.insertadas || 0), 0)
  await testigo({ evento: 'sync_bodega', ok: true, ordenes_nuevas: totalOrdenes, total: totalOrdenes, ms: 0 })

  return NextResponse.json({ ok: true, resultados })
}
