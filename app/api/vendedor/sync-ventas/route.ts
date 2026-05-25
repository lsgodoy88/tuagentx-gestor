import { fechaHoyBogota } from '@/lib/fechas'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { invalidateKeys, invalidatePattern } from '@/lib/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'

/**
 * POST /api/vendedor/sync-ventas
 * Sync seguro para vendedor — usa ultimaSyncBodega como ventana.
 * Throttle: 1 sync cada 15 min por empresa (no por vendedor).
 * Insert-only idéntico a /api/bodega/sync.
 */

// Throttle en memoria — clave: empresaId → timestamp último sync
const throttle = new Map<string, number>()
const THROTTLE_MS = 15 * 60 * 1000  // 15 min

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'vendedor') return NextResponse.json({ error: 'Solo vendedores' }, { status: 403 })

  const empresaId = getEmpresaId(user)

  // ── Throttle ─────────────────────────────────────────────────────
  const ultimo = throttle.get(empresaId)
  const ahora = Date.now()
  if (ultimo && ahora - ultimo < THROTTLE_MS) {
    const restanMin = Math.ceil((THROTTLE_MS - (ahora - ultimo)) / 60000)
    // Aunque esté throttled, invalida la cache para que el dashboard refresque stats
    const hoyStrThrottle = fechaHoyBogota()
    await invalidatePattern(`g:v:${user.id}:*`) // limpiar todas las fechas, no solo hoy
    return NextResponse.json({
      ok: false,
      throttled: true,
      msg: `Sync disponible en ${restanMin} min`,
      restanMin,
    }, { status: 429 })
  }

  // ── Integración activa ───────────────────────────────────────────
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })
  if (!integracion) return NextResponse.json({ ok: false, msg: 'Sin integración activa' }, { status: 400 })

  // ── Ventana: desde ultimaSyncBodega (o 2 días si nunca sincronizó) ─
  const empresa = await (prisma as any).empresa.findUnique({
    where: { id: empresaId },
    select: { ultimaSyncBodega: true }
  })
  const desde = empresa?.ultimaSyncBodega
    ? new Date(empresa.ultimaSyncBodega)
    : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

  // ── Fetch UpTres ─────────────────────────────────────────────────
  const config = integracion.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(config.apiKey, apiSecret)
  await adapter.login()

  const ordenes = await adapter.fetchVentas(desde)
  const desdeTs = desde.getTime()
  const ordenesFiltradas = ordenes.filter((o: any) => {
    const fc = o.fCreado ? new Date(o.fCreado as string).getTime() : 0
    return fc >= desdeTs
  })

  // ── Insert-only (misma lógica que bodega/sync) ───────────────────
  const ordenesValidas = ordenesFiltradas.filter((o: any) =>
    o.numeroFacturado && o.uid && o.cliente?.uid
  )

  if (ordenesValidas.length === 0) {
    throttle.set(empresaId, ahora)
    return NextResponse.json({ ok: true, nuevas: 0, msg: 'Sin órdenes nuevas' })
  }

  // Buscar existentes por origenId
  const origenIds = ordenesValidas.map((o: any) => String(o.uid || o._id))
  const existentes = await (prisma as any).ordenDespacho.findMany({
    where: { origenId: { in: origenIds }, empresaId },
    select: { origenId: true }
  })
  const existentesSet = new Set(existentes.map((e: any) => e.origenId))
  const nuevasOrdenes = ordenesValidas.filter((o: any) =>
    !existentesSet.has(String(o.uid || o._id))
  )

  if (nuevasOrdenes.length === 0) {
    throttle.set(empresaId, ahora)
    return NextResponse.json({ ok: true, nuevas: 0, msg: 'Sin órdenes nuevas' })
  }

  // Resolver clienteIds
  const clienteApiIds = [...new Set(nuevasOrdenes.map((o: any) => o.cliente?.uid).filter(Boolean))]
  const clientes = await (prisma as any).cliente.findMany({
    where: { empresaId, apiId: { in: clienteApiIds } },
    select: { id: true, apiId: true }
  })
  const clienteMap = new Map(clientes.map((c: any) => [c.apiId, c.id]))

  const toCreate = nuevasOrdenes.map((orden: any) => {
    const clienteId = clienteMap.get(orden.cliente?.uid) || null
    return {
      origenId:      String(orden.uid || orden._id),
      numeroOrden:   String(orden.numeroOrden),
      numeroFactura: String(orden.numeroFacturado),
      vendedorApiId: orden.empleado?.uid || null,
      estado:        'pendiente',
      clienteId,
      clienteApiId:  orden.cliente?.uid || null,
      clienteNombre: orden.clienteNombreApi || null,
      totalOrden:    orden.vTotal ? parseFloat(orden.vTotal) : null,
      fechaOrden:    orden.fCreado ? new Date(orden.fCreado as string) : new Date(),
      empresaId,
    }
  })

  await (prisma as any).ordenDespacho.createMany({ data: toCreate, skipDuplicates: true })

  // Actualizar ultimaSyncBodega y registrar throttle
  await (prisma as any).empresa.update({
    where: { id: empresaId },
    data: { ultimaSyncBodega: new Date() }
  })
  throttle.set(empresaId, ahora)

  // Limpiar caché del vendedor para que el dashboard refleje las nuevas órdenes
  const hoyStr = fechaHoyBogota()
  await invalidatePattern(`g:v:${user.id}:*`) // limpiar todas las fechas, no solo hoy
  return NextResponse.json({ ok: true, nuevas: toCreate.length })
}
