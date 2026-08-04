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

    // Resolver nombres en runtime via JOIN con Empleado
    const ventasRows: any[] = esVendedor && apiId
      ? await (prisma as any).$queryRawUnsafe(`
          SELECT s.mes, s.vendedor_api_id, COALESCE(e.nombre, 'Sin asignar') as nombre, s.datos
          FROM ${DB_SCHEMA}."SnapshotMes" s
          LEFT JOIN ${DB_SCHEMA}."Empleado" e ON e."apiId" = s.vendedor_api_id AND e."empresaId" = $1
          WHERE s.empresa_id = $1 AND s.tipo = 'ventas' AND s.vendedor_api_id = $2
          ORDER BY s.mes DESC`, empresaId, apiId)
      : await (prisma as any).$queryRawUnsafe(`
          SELECT s.mes, s.vendedor_api_id, COALESCE(e.nombre, 'Sin asignar') as nombre, s.datos
          FROM ${DB_SCHEMA}."SnapshotMes" s
          LEFT JOIN ${DB_SCHEMA}."Empleado" e ON e."apiId" = s.vendedor_api_id AND e."empresaId" = $1
          WHERE s.empresa_id = $1 AND s.tipo = 'ventas'
          ORDER BY s.mes DESC`, empresaId)

    const recaudosRows: any[] = esVendedor && empId
      ? await (prisma as any).$queryRawUnsafe(`
          SELECT s.mes, s.empleado_id, s.vendedor_api_id, COALESCE(e.nombre, 'Sin asignar') as nombre, s.datos
          FROM ${DB_SCHEMA}."SnapshotMes" s
          LEFT JOIN ${DB_SCHEMA}."Empleado" e ON e.id = s.empleado_id AND e."empresaId" = $1
          WHERE s.empresa_id = $1 AND s.tipo = 'recaudo' AND (s.empleado_id = $2 OR s.vendedor_api_id = $3)
          ORDER BY s.mes DESC`, empresaId, empId, apiId)
      : await (prisma as any).$queryRawUnsafe(`
          SELECT s.mes, s.empleado_id, s.vendedor_api_id, COALESCE(e.nombre, 'Sin asignar') as nombre, s.datos
          FROM ${DB_SCHEMA}."SnapshotMes" s
          LEFT JOIN ${DB_SCHEMA}."Empleado" e ON e.id = s.empleado_id AND e."empresaId" = $1
          WHERE s.empresa_id = $1 AND s.tipo = 'recaudo'
          ORDER BY s.mes DESC`, empresaId)

    // Agrupar por mes
    const mesMap = new Map<string, { mes: string; totalVentas: number; totalRecaudo: number; vendedores: Record<string, any> }>()

    for (const r of ventasRows) {
      if (!mesMap.has(r.mes)) mesMap.set(r.mes, { mes: r.mes, totalVentas: 0, totalRecaudo: 0, vendedores: {} })
      const e = mesMap.get(r.mes)!
      // Agrupar Sin asignar en una sola fila, resto por vendedor_api_id
      const k = r.nombre === 'Sin asignar' ? '__sin_asignar__' : r.vendedor_api_id
      if (!e.vendedores[k]) e.vendedores[k] = { nombre: r.nombre, apiId: r.vendedor_api_id, ventas: 0, recaudo: 0, ordenes: 0, cobros: 0, meta: 0 }
      e.vendedores[k].ventas  += Number(r.datos.total   ?? 0)
      e.vendedores[k].ordenes += Number(r.datos.ordenes ?? 0)
      if (r.datos.meta) e.vendedores[k].meta = r.datos.meta
      e.totalVentas += Number(r.datos.total ?? 0)
    }

    for (const r of recaudosRows) {
      if (!mesMap.has(r.mes)) mesMap.set(r.mes, { mes: r.mes, totalVentas: 0, totalRecaudo: 0, vendedores: {} })
      const e = mesMap.get(r.mes)!
      const k = r.nombre === 'Sin asignar' ? '__sin_asignar__' : (r.empleado_id || r.vendedor_api_id)
      if (!e.vendedores[k]) e.vendedores[k] = { nombre: r.nombre, apiId: r.vendedor_api_id, ventas: 0, recaudo: 0, ordenes: 0, cobros: 0, metaRecaudo: 0 }
      e.vendedores[k].recaudo += Number(r.datos.total  ?? 0)
      e.vendedores[k].cobros  += Number(r.datos.cobros ?? 0)
      if (r.datos.meta) e.vendedores[k].metaRecaudo = r.datos.meta
      e.totalRecaudo += Number(r.datos.total ?? 0)
    }

    const meses = Array.from(mesMap.values())
      .map(m => ({
        ...m,
        vendedores: Object.values(m.vendedores)
          .sort((a: any, b: any) => b.ventas - a.ventas)
      }))
      .sort((a, b) => b.mes.localeCompare(a.mes))

    const res = NextResponse.json({ meses })
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  } catch (err: any) {
    console.error('[stats/historico]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
