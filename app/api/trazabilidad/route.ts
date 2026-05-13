import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 20


// Construye WHERE SQL parametrizado a partir del objeto where dinámico
function buildWhereSQL(where: any): { sql: string; params: any[] } {
  const parts: string[] = []
  const params: any[] = []
  let i = 1
  const empresaId = where.empresaId
  const origenVinculadaId = where.origenVinculadaId
  if (empresaId && origenVinculadaId === null) {
    parts.push(`"empresaId" = \$${i++}`); params.push(empresaId)
    parts.push(`"origenVinculadaId" IS NULL`)
  } else if (where.OR && Array.isArray(where.OR) && where.OR[0]?.empresaId) {
    const orParts: string[] = []
    for (const cond of where.OR) {
      if (cond.empresaId && cond.origenVinculadaId === null) {
        orParts.push(`("empresaId" = \$${i++} AND "origenVinculadaId" IS NULL)`)
        params.push(cond.empresaId)
      } else if (cond.origenVinculadaId?.in) {
        const placeholders = cond.origenVinculadaId.in.map(() => `\$${i++}`).join(',')
        orParts.push(`"origenVinculadaId" IN (${placeholders})`)
        params.push(...cond.origenVinculadaId.in)
      }
    }
    if (orParts.length > 0) parts.push(`(${orParts.join(' OR ')})`)
  } else if (where.origenVinculadaId?.in) {
    const placeholders = where.origenVinculadaId.in.map(() => `\$${i++}`).join(',')
    parts.push(`"origenVinculadaId" IN (${placeholders})`)
    params.push(...where.origenVinculadaId.in)
  } else if (empresaId) {
    parts.push(`"empresaId" = \$${i++}`); params.push(empresaId)
  }
  if (where.estado) { parts.push(`"estado" = \$${i++}`); params.push(where.estado) }
  if (where.fechaOrden?.gte) { parts.push(`"fechaOrden" >= \$${i++}`); params.push(where.fechaOrden.gte) }
  if (where.fechaOrden?.lte) { parts.push(`"fechaOrden" <= \$${i++}`); params.push(where.fechaOrden.lte) }
  if (where.OR && where.OR[0]?.numeroOrden) {
    // búsqueda q
    const qOrParts: string[] = []
    for (const cond of where.OR) {
      if (cond.numeroOrden?.contains) {
        qOrParts.push(`"numeroOrden" ILIKE \$${i++}`); params.push(`%${cond.numeroOrden.contains}%`)
      }
      if (cond.clienteNombre?.contains) {
        qOrParts.push(`"clienteNombre" ILIKE \$${i++}`); params.push(`%${cond.clienteNombre.contains}%`)
      }
    }
    if (qOrParts.length > 0) parts.push(`(${qOrParts.join(' OR ')})`)
  }
  return { sql: parts.length > 0 ? parts.join(' AND ') : 'TRUE', params }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const esVendedor = user.role === 'vendedor'
  const esEntregas = user.role === 'entregas'
  if (!['empresa', 'supervisor', 'superadmin', 'vendedor', 'bodega', 'entregas'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const estado = searchParams.get('estado') || ''
  const desde = searchParams.get('desde') || ''
  const hasta = searchParams.get('hasta') || ''
  const cursor = searchParams.get('cursor') || null
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const useCursor = !!cursor || searchParams.has('cursor') || (searchParams.has('limit') && !searchParams.has('page'))

  // Rol entregas: solo sus órdenes entregadas (repartidorId = empleadoId)
  if (esEntregas) {
    const empleadoId = user.id // En sesión, user.id = id del Empleado
    const where: any = {
      empresaId: user.empresaId,
      estado: 'entregado',
      OR: [
        { repartidorId: empleadoId },
        { visitas: { some: { empleadoId, tipo: 'entrega' } } },
      ]
    }
    if (q) where.OR = [
      { numeroOrden: { contains: q, mode: 'insensitive' } },
      { clienteNombre: { contains: q, mode: 'insensitive' } },
    ]
    if (desde || hasta) {
      where.entregadoEl = {}
      if (desde) where.entregadoEl.gte = new Date(desde)
      if (hasta) where.entregadoEl.lte = new Date(hasta + 'T23:59:59')
    }
    const [total, ordenes] = await Promise.all([
      prisma.ordenDespacho.count({ where }),
      prisma.ordenDespacho.findMany({
        where,
        orderBy: { entregadoEl: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, numeroOrden: true, clienteNombre: true, ciudad: true,
          estado: true, fechaOrden: true, alistadoEl: true, entregadoEl: true,
          fotosAlistamiento: true, firmaEntrega: true,
          alistadoPor: { select: { nombre: true } },
          repartidor: { select: { nombre: true } },
          visitas: {
            where: { tipo: 'entrega' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { id: true, firma: true, createdAt: true, empleado: { select: { nombre: true } } }
          }
        }
      })
    ])
    return NextResponse.json({ ordenes, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  }

  // Vendedor: filtrar por sus propios clientes via SyncDeuda
  if (esVendedor) {
    // Buscar SyncEmpleado por nombre del empleado logueado
    const syncEmp = await (prisma as any).syncEmpleado.findFirst({
      where: {
        integracion: { empresaId: user.empresaId },
        nombre: { contains: user.name, mode: 'insensitive' }
      }
    })
    const externalId = syncEmp?.externalId || null

    // Obtener NITs de clientes asignados a este vendedor
    const clientesApiIds = externalId ? await (prisma as any).syncDeuda.findMany({
      where: { empleadoExternalId: externalId },
      select: { clienteApiId: true },
      distinct: ['clienteApiId']
    }) : []

    const apiIds = clientesApiIds.map((d: any) => d.clienteApiId).filter(Boolean)

    // Obtener NITs reales de esos clientes
    const clientes = apiIds.length > 0 ? await prisma.cliente.findMany({
      where: { apiId: { in: apiIds }, empresaId: user.empresaId },
      select: { nit: true }
    }) : []

    const nits = clientes.map((c: any) => c.nit).filter(Boolean)

    const where: any = {
      empresaId: user.empresaId,
      origenVinculadaId: null, // Solo órdenes propias, no vinculadas
      ...(nits.length > 0 ? { clienteNit: { in: nits } } : { clienteNit: '__ninguno__' })
    }
    if (q) where.OR = [
      { numeroOrden: { contains: q, mode: 'insensitive' } },
      { clienteNombre: { contains: q, mode: 'insensitive' } },
    ]
    if (estado) where.estado = estado
    if (desde || hasta) {
      where.fechaOrden = {}
      if (desde) where.fechaOrden.gte = new Date(desde)
      if (hasta) where.fechaOrden.lte = new Date(hasta + 'T23:59:59')
    }

    const [total, ordenes] = await Promise.all([
      prisma.ordenDespacho.count({ where }),
      prisma.ordenDespacho.findMany({
        where,
        orderBy: { fechaOrden: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, numeroOrden: true, clienteNombre: true, ciudad: true,
          estado: true, fechaOrden: true, alistadoEl: true, entregadoEl: true,
          fotosAlistamiento: true, firmaEntrega: true,
          alistadoPor: { select: { nombre: true } },
          repartidor: { select: { nombre: true } },
          visitas: {
            where: { tipo: 'entrega' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { id: true, firma: true, createdAt: true, empleado: { select: { nombre: true } } }
          }
        }
      })
    ])
    return NextResponse.json({ ordenes, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: user.empresaId },
    select: { bodegaPuedeEnviar: true }
  })
  const vinculaciones = await prisma.empresaVinculada.findMany({
    where: { empresaClienteId: user.empresaId, activa: true }
  })
  const vinculacionesBodega = await prisma.empresaVinculada.findMany({
    where: { empresaId: user.empresaId, activa: true }
  })

  let where: any = {}
  if (user.role === 'bodega') {
    // Bodega ve todo: propias + todas las vinculadas
    const vinIds = vinculacionesBodega.map((v: any) => v.id)
    where = vinIds.length > 0
      ? { OR: [{ empresaId: user.empresaId, origenVinculadaId: null }, { origenVinculadaId: { in: vinIds } }] }
      : { empresaId: user.empresaId }
  } else if (vinculaciones.length > 0 && !empresa?.bodegaPuedeEnviar) {
    // Empresa cliente (Leche): solo sus propias órdenes en la bodega de Lumeli
    where = { origenVinculadaId: { in: vinculaciones.map((v: any) => v.id) } }
  } else {
    // Empresa con bodega propia (Lumeli) o sin vinculación: solo sus órdenes propias
    where = { empresaId: user.empresaId, origenVinculadaId: null }
  }

  if (q) {
    where.OR = [
      { numeroOrden: { contains: q, mode: 'insensitive' } },
      { clienteNombre: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (estado) where.estado = estado
  if (desde || hasta) {
    where.fechaOrden = {}
    if (desde) where.fechaOrden.gte = new Date(desde)
    if (hasta) where.fechaOrden.lte = new Date(hasta + 'T23:59:59')
  }

  const baseSelect = {
    id: true,
    numeroOrden: true,
    clienteNombre: true,
    ciudad: true,
    estado: true,
    fechaOrden: true,
    alistadoEl: true,
    entregadoEl: true,
    fotosAlistamiento: true,
    firmaEntrega: true,
    repartidorId: true,
    alistadoPor: { select: { nombre: true } },
    repartidor: { select: { nombre: true } },
    visitas: {
      where: { tipo: 'entrega' },
      orderBy: { createdAt: 'asc' as const },
      take: 1,
      select: { id: true, firma: true, createdAt: true, empleado: { select: { nombre: true } } }
    }
  }

  if (useCursor) {
    const { sql: whereSQL, params } = buildWhereSQL(where)
    // Obtener PAGE_SIZE+1 IDs ordenados numéricamente en SQL
    let cursorClause = ''
    if (cursor) {
      const cursorRow: any[] = await prisma.$queryRawUnsafe(
        `SELECT "numeroOrden", "fechaOrden" FROM gestor."OrdenDespacho" WHERE id = $1`,
        cursor
      )
      if (cursorRow[0]) {
        const ord = parseInt(cursorRow[0].numeroOrden, 10) || 0
        const fec = cursorRow[0].fechaOrden ? new Date(cursorRow[0].fechaOrden).toISOString() : null
        cursorClause = ` AND ((CASE WHEN "numeroOrden" ~ '^[0-9]+$' THEN CAST("numeroOrden" AS INTEGER) ELSE 0 END) < ${ord} OR ((CASE WHEN "numeroOrden" ~ '^[0-9]+$' THEN CAST("numeroOrden" AS INTEGER) ELSE 0 END) = ${ord} AND "fechaOrden" < '${fec}'::timestamp))`
      }
    }
    const idRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM gestor."OrdenDespacho" WHERE ${whereSQL}${cursorClause}
       ORDER BY (CASE WHEN "numeroOrden" ~ '^[0-9]+$' THEN CAST("numeroOrden" AS INTEGER) ELSE 0 END) DESC, "fechaOrden" DESC
       LIMIT ${PAGE_SIZE + 1}`,
      ...params
    )
    const hasMore = idRows.length > PAGE_SIZE
    const finalIds = (hasMore ? idRows.slice(0, PAGE_SIZE) : idRows).map((r: any) => r.id)
    const ordenesRaw = await prisma.ordenDespacho.findMany({
      where: { id: { in: finalIds } },
      select: baseSelect,
    })
    const orderMap = new Map(finalIds.map((id, i) => [id, i]))
    const data = ordenesRaw.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
    const nextCursor = hasMore ? data[data.length - 1].id : null
    return NextResponse.json({ ordenes: data, nextCursor, hasMore })
  }

  const { sql: whereSQL, params } = buildWhereSQL(where)
  const [countRow]: any[] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM gestor."OrdenDespacho" WHERE ${whereSQL}`,
    ...params
  )
  const total = countRow.c
  const offset = (page - 1) * PAGE_SIZE
  const idRows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM gestor."OrdenDespacho" WHERE ${whereSQL}
     ORDER BY (CASE WHEN "numeroOrden" ~ '^[0-9]+$' THEN CAST("numeroOrden" AS INTEGER) ELSE 0 END) DESC, "fechaOrden" DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    ...params
  )
  const finalIds = idRows.map((r: any) => r.id)
  const ordenesRaw = await prisma.ordenDespacho.findMany({
    where: { id: { in: finalIds } },
    select: baseSelect,
  })
  const orderMap = new Map(finalIds.map((id, i) => [id, i]))
  const ordenes = ordenesRaw.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
  return NextResponse.json({ ordenes, total, page, pages: Math.ceil(total / PAGE_SIZE) })
}
