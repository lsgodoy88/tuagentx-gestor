import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

// GET — snapshots de inventario enviados al vendedor
// Agrupa por (empleadoId, clienteId, fecha_dia) — muestra el último envío por impulsadora+cliente+día
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['vendedor', 'empresa', 'supervisor'].includes(user.role)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }

    const empresaId = getEmpresaId(user)
    const { searchParams } = new URL(req.url)
    const dias = Math.min(30, parseInt(searchParams.get('dias') || '7'))

    // Para vendedor: filtrar por su id. Para admin/supervisor: todos.
    const vendedorFilter = user.role === 'vendedor'
      ? `AND ii."vendedorId" = '${user.id}'`
      : ''

    const rows: any[] = await (prisma as any).$queryRawUnsafe(`
      SELECT
        ii.id,
        ii."clienteId",
        c.nombre AS "clienteNombre",
        ii."empleadoId",
        e.nombre AS "impulsadoraNombre",
        ii."productoId",
        p.nombre AS "productoNombre",
        p.linea,
        p.precio,
        ii.sugerido,
        ii.inventario,
        ii."createdAt"
      FROM ${DB_SCHEMA}."ImpulsoInventario" ii
      JOIN ${DB_SCHEMA}."Cliente" c ON c.id = ii."clienteId"
      JOIN ${DB_SCHEMA}."Empleado" e ON e.id = ii."empleadoId"
      JOIN ${DB_SCHEMA}."Producto" p ON p.id = ii."productoId"
      WHERE ii."empresaId" = $1
        AND ii."createdAt" >= NOW() - INTERVAL '${dias} days'
        ${vendedorFilter}
      ORDER BY ii."createdAt" DESC
      LIMIT 2000
    `, empresaId)

    // Agrupar: { [clienteId-empleadoId-fecha]: { meta, filas[] } }
    const grupos: Record<string, any> = {}
    for (const row of rows) {
      const fecha = new Date(row.createdAt).toISOString().slice(0, 10)
      const key = `${row.clienteId}|${row.empleadoId}|${fecha}`
      if (!grupos[key]) {
        grupos[key] = {
          key,
          clienteId: row.clienteId,
          clienteNombre: row.clienteNombre,
          impulsadoraId: row.empleadoId,
          impulsadoraNombre: row.impulsadoraNombre,
          fecha,
          filas: []
        }
      }
      grupos[key].filas.push({
        productoId: row.productoId,
        productoNombre: row.productoNombre,
        linea: row.linea,
        precio: row.precio,
        sugerido: row.sugerido,
        inventario: row.inventario,
      })
    }

    const snapshots = Object.values(grupos).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha))

    return NextResponse.json({ snapshots }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err: any) {
    console.error('[api/impulsar/gestion] GET error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
