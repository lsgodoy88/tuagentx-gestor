import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

// GET — snapshots de rotación enviados al vendedor (misma lógica que /api/impulsar/sugeridos)
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
    const dias = Math.min(30, parseInt(searchParams.get('dias') || '14'))

    const vendedorFilter = user.role === 'vendedor'
      ? `AND ir."vendedorId" = '${user.id}'`
      : ''

    const rows: any[] = await (prisma as any).$queryRawUnsafe(`
      SELECT
        ir.id,
        ir."clienteId",
        c.nombre AS "clienteNombre",
        ir."empleadoId",
        e.nombre AS "impulsadoraNombre",
        ir."productoId",
        p.nombre AS "productoNombre",
        p.linea,
        ir.cantidad,
        ir.precio_venta AS "precioVenta",
        ir."createdAt"
      FROM ${DB_SCHEMA}."ImpulsoRotacion" ir
      JOIN ${DB_SCHEMA}."Cliente" c ON c.id = ir."clienteId"
      JOIN ${DB_SCHEMA}."Empleado" e ON e.id = ir."empleadoId"
      JOIN ${DB_SCHEMA}."Producto" p ON p.id = ir."productoId"
      WHERE ir."empresaId" = $1
        AND ir."createdAt" >= NOW() - INTERVAL '${dias} days'
        ${vendedorFilter}
      ORDER BY ir."createdAt" DESC
      LIMIT 2000
    `, empresaId)

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
        cantidad: row.cantidad,
        precioVenta: row.precioVenta,
      })
    }

    const snapshots = Object.values(grupos).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha))
    return NextResponse.json({ snapshots }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err: any) {
    console.error('[api/impulsar/rotacion-snapshots] GET error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
