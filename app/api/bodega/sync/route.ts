import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { haceNDiasBogota } from '@/lib/fechas'
import fs from 'fs'
import path from 'path'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
// UTC → Bogotá (UTC-5)
function toBogota(d: Date | null): Date | null {
  return d ? new Date(d.getTime() - 5 * 60 * 60 * 1000) : null
}


import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'

const municipiosDANE: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/municipios_dane.json'), 'utf-8')
)

export async function POST(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN_BODEGA.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const body = await req.json().catch(() => ({}))
  const vinculadaId: string | null = body.vinculadaId || null

  // FIX 2026-06-20: la orden ya no se duplica bajo la empresa del proveedor
  // de bodega (Lumeli) — siempre se guarda bajo la empresa REAL dueña de la
  // venta en UpTres (integracionEmpresaId). origenVinculadaId queda solo
  // informativo, no determina dónde vive la fila.
  let integracionEmpresaId = empresaId
  let origenVinculadaId: string | null = null

  if (vinculadaId) {
    const vinculada = await (prisma as any).empresaVinculada.findFirst({
      where: { id: vinculadaId, empresaId, activa: true },
      select: { id: true, empresaClienteId: true }
    })
    if (!vinculada || !vinculada.empresaClienteId) {
      return NextResponse.json({ error: 'Empresa vinculada no encontrada' }, { status: 400 })
    }
    integracionEmpresaId = vinculada.empresaClienteId
    origenVinculadaId = vinculadaId
  }

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId: integracionEmpresaId, tipo: 'uptres', activa: true }
  })
  if (!integracion) return NextResponse.json({ error: 'Sin integración activa' }, { status: 400 })

  const config = integracion.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(config.apiKey, apiSecret)
  await adapter.login()

  // diasHistorialBodega de la empresa (default 30)
  const empresaRow = await (prisma as any).empresa.findUnique({
    where: { id: integracionEmpresaId },
    select: { diasHistorialBodega: true }
  })
  const dias = empresaRow?.diasHistorialBodega ?? 30
  const desde = haceNDiasBogota(dias)

  const ordenes = await adapter.fetchVentas(desde)
  const desdeTs = desde.getTime()
  const ordenesFiltradas = ordenes.filter((o: any) => {
    const fc = o.fCreado ? new Date(o.fCreado as string).getTime() : 0
    return fc >= desdeTs
  })

  // 1. Filtrar válidas: con factura, nombre y origenId
  const ordenesValidas = ordenesFiltradas.filter((o: any) => {
    const numFactura = o.numeroFacturado ? String(o.numeroFacturado) : null
    const nombre = o.clienteNombre || o.clienteNombreApi
    const origenId = String(o.uid || o._id || '')
    return numFactura && nombre && origenId
  })

  // 2. Un query para saber cuáles ya existen
  const origenIds = ordenesValidas.map((o: any) => String(o.uid || o._id))
  const existentes = await (prisma as any).ordenDespacho.findMany({
    where: {
      empresaId: integracionEmpresaId,
      origenId: { in: origenIds },
    },
    select: { origenId: true }
  })
  const existentesSet = new Set(existentes.map((e: any) => e.origenId))

  const nuevasOrdenes = ordenesValidas.filter((o: any) => !existentesSet.has(String(o.uid || o._id)))

  if (nuevasOrdenes.length === 0) {
    await (prisma as any).empresa.update({ where: { id: empresaId }, data: { ultimaSyncBodega: new Date() } })
    return NextResponse.json({ ok: true, sincronizados: 0, nuevas: 0, actualizadas: 0 })
  }

  // 3. Un query para todos los clientes necesarios
  const clienteApiIds = [...new Set(nuevasOrdenes.map((o: any) => o.cliente?.uid).filter(Boolean))]
  const clienteNits = [...new Set(nuevasOrdenes.map((o: any) => o.clienteNit).filter(Boolean))]
  const clientesLocales = await (prisma as any).cliente.findMany({
    where: {
      empresaId: integracionEmpresaId,
      OR: [
        clienteApiIds.length > 0 ? { apiId: { in: clienteApiIds } } : undefined,
        clienteNits.length > 0 ? { nit: { in: clienteNits } } : undefined,
      ].filter(Boolean)
    },
    select: { apiId: true, nit: true, ciudad: true, direccion: true, telefono: true }
  })
  const mapaClientePorApiId = new Map(clientesLocales.filter((c: any) => c.apiId).map((c: any) => [c.apiId, c]))
  const mapaClientePorNit = new Map(clientesLocales.filter((c: any) => c.nit).map((c: any) => [c.nit, c]))

  // 4. Construir en memoria
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
      fechaOrdenBogota: orden.fCreado ? toBogota(new Date(orden.fCreado as string)) : toBogota(new Date()),
      totalOrden: orden.vTotal ? parseFloat(orden.vTotal) : null,
      empresaId: integracionEmpresaId,
      origen: 'propia',
      origenId,
      origenVinculadaId: null,
      estado: 'pendiente',
    }
  })

  // 5. Transacción — todo o nada
  await prisma.$transaction(async (tx: any) => {
    await tx.ordenDespacho.createMany({ data: toCreate, skipDuplicates: true })
    await tx.empresa.update({ where: { id: empresaId }, data: { ultimaSyncBodega: new Date() } })
  }, { timeout: 30000 })

  return NextResponse.json({
    ok: true,
    sincronizados: toCreate.length,
    nuevas: toCreate.length,
    actualizadas: 0
  })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
