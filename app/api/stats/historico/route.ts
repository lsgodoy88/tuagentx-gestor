import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const role = user.role as string

    if (!['empresa', 'supervisor', 'vendedor'].includes(role))
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const empresaId = getEmpresaId(user)
    const esVendedor = role === 'vendedor'
    const apiId = user.apiId as string | null
    const empId = user.id as string | null
    const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

    // Leer snapshots de ventas
    const ventasWhere = esVendedor && apiId
      ? `WHERE empresa_id = $1 AND tipo = 'ventas' AND vendedor_api_id = $2`
      : `WHERE empresa_id = $1 AND tipo = 'ventas'`

    const ventasRows: any[] = esVendedor && apiId
      ? await (prisma as any).$queryRawUnsafe(
          `SELECT mes, vendedor_api_id, entidad_nombre, datos FROM ${DB_SCHEMA}."SnapshotMes" WHERE empresa_id = $1 AND tipo = 'ventas' AND vendedor_api_id = $2 ORDER BY mes DESC`,
          empresaId, apiId)
      : await (prisma as any).$queryRawUnsafe(
          `SELECT mes, vendedor_api_id, entidad_nombre, datos FROM ${DB_SCHEMA}."SnapshotMes" WHERE empresa_id = $1 AND tipo = 'ventas' ORDER BY mes DESC`,
          empresaId)

    // Leer snapshots de recaudo
    const recaudosRows: any[] = esVendedor && empId
      ? await (prisma as any).$queryRawUnsafe(
          `SELECT mes, empleado_id, entidad_nombre, datos FROM ${DB_SCHEMA}."SnapshotMes" WHERE empresa_id = $1 AND tipo = 'recaudo' AND (empleado_id = $2 OR vendedor_api_id = $3) ORDER BY mes DESC`,
          empresaId, empId, apiId)
      : await (prisma as any).$queryRawUnsafe(
          `SELECT mes, empleado_id, entidad_nombre, datos FROM ${DB_SCHEMA}."SnapshotMes" WHERE empresa_id = $1 AND tipo = 'recaudo' ORDER BY mes DESC`,
          empresaId)

    // Agrupar por mes
    const mesMap = new Map<string, { mes: string; totalVentas: number; totalRecaudo: number; vendedores: Record<string, any> }>()

    for (const r of ventasRows) {
      if (!mesMap.has(r.mes)) mesMap.set(r.mes, { mes: r.mes, totalVentas: 0, totalRecaudo: 0, vendedores: {} })
      const e = mesMap.get(r.mes)!
      const k = r.vendedor_api_id
      if (!e.vendedores[k]) e.vendedores[k] = { nombre: r.entidad_nombre, ventas: 0, recaudo: 0, ordenes: 0, cobros: 0 }
      e.vendedores[k].ventas += r.datos.total ?? 0
      e.vendedores[k].ordenes += r.datos.ordenes ?? 0
      e.totalVentas += r.datos.total ?? 0
    }

    for (const r of recaudosRows) {
      if (!mesMap.has(r.mes)) mesMap.set(r.mes, { mes: r.mes, totalVentas: 0, totalRecaudo: 0, vendedores: {} })
      const e = mesMap.get(r.mes)!
      const k = r.empleado_id
      if (!e.vendedores[k]) e.vendedores[k] = { nombre: r.entidad_nombre, ventas: 0, recaudo: 0, ordenes: 0, cobros: 0 }
      e.vendedores[k].recaudo += r.datos.total ?? 0
      e.vendedores[k].cobros += r.datos.cobros ?? 0
      e.totalRecaudo += r.datos.total ?? 0
    }

    const meses = Array.from(mesMap.values())
      .map(m => ({ ...m, vendedores: Object.values(m.vendedores).sort((a: any, b: any) => b.ventas - a.ventas) }))
      .sort((a, b) => b.mes.localeCompare(a.mes))

    const res = NextResponse.json({ meses })
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  } catch (err: any) {
    console.error('[stats/historico]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
