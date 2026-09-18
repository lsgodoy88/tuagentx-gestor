import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

// GET — historial de envíos agrupados por envioId
// ?tipo=sugerido|rotacion&limit=20&cursor=<createdAt ISO>
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['impulsadora', 'empresa', 'supervisor', 'vendedor'].includes(user.role)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }

    const empresaId = getEmpresaId(user)
    const { searchParams } = new URL(req.url)
    const tipo = searchParams.get('tipo') || 'sugerido' // sugerido | rotacion
    const limit = Math.min(20, parseInt(searchParams.get('limit') || '10'))
    const cursor = searchParams.get('cursor') // ISO datetime del último envío visto

    // Scope por rol
    const whereEmpleado = user.role === 'impulsadora' ? `AND t."empleadoId" = '${user.id}'` : ''
    const whereCursor = cursor ? `AND t."createdAt" < '${cursor}'` : ''

    const tabla = tipo === 'rotacion' ? 'ImpulsoRotacion' : 'ImpulsoInventario'

    // Columnas específicas por tipo
    const colsAgr = tipo === 'rotacion'
      ? `SUM(t.cantidad * t.precio_venta) AS total`
      : `SUM(t.sugerido * p.precio) AS total`
    const joinProducto = tipo === 'rotacion' ? '' : `JOIN ${DB_SCHEMA}."Producto" p ON p.id = t."productoId"`

    // 1. Obtener envíos agrupados (un row por envioId)
    const envios: any[] = await (prisma as any).$queryRawUnsafe(`
      SELECT
        t."envioId",
        t."empleadoId",
        e.nombre AS "empleadoNombre",
        t."clienteId",
        c.nombre AS "clienteNombre",
        MIN(t."createdAt") AS "createdAt",
        COUNT(t.id)::int AS productos,
        ${colsAgr}
      FROM ${DB_SCHEMA}."${tabla}" t
      JOIN ${DB_SCHEMA}."Cliente" c ON c.id = t."clienteId"
      JOIN ${DB_SCHEMA}."Empleado" e ON e.id = t."empleadoId"
      ${joinProducto}
      WHERE t."empresaId" = $1
        AND t."envioId" != ''
        ${whereEmpleado}
        ${whereCursor}
      GROUP BY t."envioId", t."empleadoId", e.nombre, t."clienteId", c.nombre
      ORDER BY MIN(t."createdAt") DESC
      LIMIT ${limit + 1}
    `, empresaId)

    const hasMore = envios.length > limit
    const rows = hasMore ? envios.slice(0, limit) : envios
    const nextCursor = hasMore ? rows[rows.length - 1].createdAt?.toISOString() : null

    // 2. Traer detalle de productos para cada envioId
    const envioIds = rows.map((r: any) => r.envioId).filter(Boolean)
    let detalles: any[] = []
    if (envioIds.length > 0) {
      const placeholders = envioIds.map((_: any, i: number) => `$${i + 2}`).join(',')
      const colsDetalle = tipo === 'rotacion'
        ? `t.cantidad, t.precio_venta AS "precioVenta", t.cantidad * t.precio_venta AS subtotal`
        : `t.sugerido, t.inventario, t.sugerido * p.precio AS subtotal`
      const joinDet = tipo === 'rotacion' ? '' : `JOIN ${DB_SCHEMA}."Producto" p ON p.id = t."productoId"`
      detalles = await (prisma as any).$queryRawUnsafe(`
        SELECT
          t."envioId",
          t."productoId",
          pr.nombre AS "productoNombre",
          pr.linea,
          ${colsDetalle}
        FROM ${DB_SCHEMA}."${tabla}" t
        JOIN ${DB_SCHEMA}."Producto" pr ON pr.id = t."productoId"
        ${joinDet}
        WHERE t."empresaId" = $1 AND t."envioId" IN (${placeholders})
        ORDER BY t."envioId", pr.nombre
      `, empresaId, ...envioIds)
    }

    // Agrupar detalles por envioId
    const detallePorEnvio: Record<string, any[]> = {}
    for (const d of detalles) {
      if (!detallePorEnvio[d.envioId]) detallePorEnvio[d.envioId] = []
      detallePorEnvio[d.envioId].push(d)
    }

    const fmtBogota = (d: Date) => {
      const bog = new Date(d.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
      const dd = String(bog.getDate()).padStart(2,'0')
      const mm = String(bog.getMonth()+1).padStart(2,'0')
      const yy = String(bog.getFullYear()).slice(-2)
      const hh = bog.getHours()
      const min = String(bog.getMinutes()).padStart(2,'0')
      const mer = hh >= 12 ? 'p. m.' : 'a. m.'
      const h12 = hh % 12 || 12
      return `${dd}/${mm}/${yy}, ${h12}:${min} ${mer}`
    }

    const resultado = rows.map((r: any) => ({
      envioId: r.envioId,
      empleadoNombre: r.empleadoNombre,
      clienteNombre: r.clienteNombre,
      createdAt: r.createdAt ? fmtBogota(new Date(r.createdAt)) : '',
      productos: r.productos,
      total: Number(r.total ?? 0),
      detalle: detallePorEnvio[r.envioId] ?? [],
    }))

    return NextResponse.json({ envios: resultado, hasMore, nextCursor })
  } catch (err: any) {
    console.error('[api/impulsar/historial] GET error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
