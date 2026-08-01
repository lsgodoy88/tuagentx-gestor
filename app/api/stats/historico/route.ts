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
    const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'
    const esVendedor = role === 'vendedor'
    const apiId = user.apiId as string | null
    const empId = user.id as string | null

    const ventasRows: any[] = esVendedor && apiId
      ? await (prisma as any).$queryRawUnsafe(`
          SELECT DATE_TRUNC('month', od."createdAt" AT TIME ZONE 'America/Bogota') AS mes,
            od."vendedorApiId" AS vendedor_api_id, e.nombre,
            SUM(od."totalOrden")::float AS ventas, COUNT(*)::int AS ordenes
          FROM ${DB_SCHEMA}."OrdenDespacho" od
          LEFT JOIN ${DB_SCHEMA}."Empleado" e ON e."apiId" = od."vendedorApiId"
          WHERE od."empresaId" = $1 AND od."vendedorApiId" = $2
          GROUP BY 1,2,3 ORDER BY 1 DESC, 4 DESC`, empresaId, apiId)
      : await (prisma as any).$queryRawUnsafe(`
          SELECT DATE_TRUNC('month', od."createdAt" AT TIME ZONE 'America/Bogota') AS mes,
            od."vendedorApiId" AS vendedor_api_id, e.nombre,
            SUM(od."totalOrden")::float AS ventas, COUNT(*)::int AS ordenes
          FROM ${DB_SCHEMA}."OrdenDespacho" od
          LEFT JOIN ${DB_SCHEMA}."Empleado" e ON e."apiId" = od."vendedorApiId"
          WHERE od."empresaId" = $1
          GROUP BY 1,2,3 ORDER BY 1 DESC, 4 DESC`, empresaId)

    const recaudosRows: any[] = esVendedor && empId
      ? await (prisma as any).$queryRawUnsafe(`
          SELECT DATE_TRUNC('month', v."fechaBogota" AT TIME ZONE 'America/Bogota') AS mes,
            v."empleadoId" AS empleado_id, e.nombre,
            SUM(v.monto)::float AS recaudo, COUNT(*)::int AS cobros
          FROM ${DB_SCHEMA}."Visita" v
          JOIN ${DB_SCHEMA}."Empleado" e ON e.id = v."empleadoId"
          WHERE e."empresaId" = $1 AND v."empleadoId" = $2 AND v.tipo = 'cobro'
          GROUP BY 1,2,3 ORDER BY 1 DESC, 4 DESC`, empresaId, empId)
      : await (prisma as any).$queryRawUnsafe(`
          SELECT DATE_TRUNC('month', v."fechaBogota" AT TIME ZONE 'America/Bogota') AS mes,
            v."empleadoId" AS empleado_id, e.nombre,
            SUM(v.monto)::float AS recaudo, COUNT(*)::int AS cobros
          FROM ${DB_SCHEMA}."Visita" v
          JOIN ${DB_SCHEMA}."Empleado" e ON e.id = v."empleadoId"
          WHERE e."empresaId" = $1 AND v.tipo = 'cobro'
          GROUP BY 1,2,3 ORDER BY 1 DESC, 4 DESC`, empresaId)

    const mesKey = (d: Date) => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}` }
    const mesMap = new Map<string, { mes:string; totalVentas:number; totalRecaudo:number; vendedores:Record<string,any> }>()

    for (const r of ventasRows) {
      const k = mesKey(r.mes)
      if (!mesMap.has(k)) mesMap.set(k, { mes:k, totalVentas:0, totalRecaudo:0, vendedores:{} })
      const e = mesMap.get(k)!
      if (!e.vendedores[r.vendedor_api_id]) e.vendedores[r.vendedor_api_id] = { nombre: r.nombre||'Sin asignar', ventas:0, recaudo:0, ordenes:0, cobros:0 }
      e.vendedores[r.vendedor_api_id].ventas += r.ventas
      e.vendedores[r.vendedor_api_id].ordenes += r.ordenes
      e.totalVentas += r.ventas
    }

    for (const r of recaudosRows) {
      const k = mesKey(r.mes)
      if (!mesMap.has(k)) mesMap.set(k, { mes:k, totalVentas:0, totalRecaudo:0, vendedores:{} })
      const e = mesMap.get(k)!
      if (!e.vendedores[r.empleado_id]) e.vendedores[r.empleado_id] = { nombre: r.nombre||'Sin asignar', ventas:0, recaudo:0, ordenes:0, cobros:0 }
      e.vendedores[r.empleado_id].recaudo += r.recaudo
      e.vendedores[r.empleado_id].cobros += r.cobros
      e.totalRecaudo += r.recaudo
    }

    const meses = Array.from(mesMap.values())
      .map(m => ({ ...m, vendedores: Object.values(m.vendedores).sort((a:any,b:any) => b.ventas - a.ventas) }))
      .sort((a,b) => b.mes.localeCompare(a.mes))

    const res = NextResponse.json({ meses })
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  } catch (err: any) {
    console.error('[stats/historico]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
