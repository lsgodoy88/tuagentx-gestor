import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const mes = parseInt(searchParams.get('mes') || String(new Date().getMonth() + 1))
    const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()))
    const empresaId = searchParams.get('empresaId') || user.empresaId || user.id

    const inicio = new Date(`${anio}-${String(mes).padStart(2,'0')}-01T05:00:00.000Z`)
    const fin = new Date(inicio)
    fin.setMonth(fin.getMonth() + 1)

    // Recaudos por vendedor
    const recaudos: any[] = await prisma.$queryRawUnsafe(`
      SELECT e.id, e.nombre, e.rol,
        COALESCE(SUM(p.monto), 0) as recaudos,
        COUNT(p.id) as num_recaudos
      FROM ${DB_SCHEMA}."Empleado" e
      LEFT JOIN ${DB_SCHEMA}."PagoCartera" p ON p."empleadoId" = e.id
        AND p."createdAt" >= $1 AND p."createdAt" < $2
      WHERE e."empresaId" = $3 AND e.rol = 'vendedor' AND e.activo = true
      GROUP BY e.id, e.nombre, e.rol
      ORDER BY recaudos DESC
    `, inicio, fin, empresaId)

    // Gastos por vendedor con desglose por tipo
    const gastos: any[] = await prisma.$queryRawUnsafe(`
      SELECT g."empleadoId",
        COALESCE(SUM(g.valor), 0) as gastos,
        COUNT(g.id) as num_gastos,
        json_agg(json_build_object('tipo', g.tipo, 'valor', g.valor, 'concepto', g.concepto)) as detalle
      FROM ${DB_SCHEMA}."Gasto" g
      JOIN ${DB_SCHEMA}."Empleado" e ON e.id = g."empleadoId"
      WHERE e."empresaId" = $1 AND e.rol = 'vendedor'
        AND g."createdAt" >= $2 AND g."createdAt" < $3
      GROUP BY g."empleadoId"
    `, empresaId, inicio, fin)

    // Ventas por vendedor via SyncDeuda (integracion de la empresa)
    const ventas: any[] = await prisma.$queryRawUnsafe(`
      SELECT e.id as empleado_id, COALESCE(SUM(sd.valor), 0) as ventas, COUNT(sd.id) as num_facturas
      FROM ${DB_SCHEMA}."SyncDeuda" sd
      JOIN ${DB_SCHEMA}."Integracion" i ON i.id = sd."integracionId"
      JOIN ${DB_SCHEMA}."Empleado" e ON e."apiId" = sd."empleadoExternalId" AND e."empresaId" = i."empresaId"
      WHERE i."empresaId" = $1
        AND sd."createdAt" >= $2 AND sd."createdAt" < $3
        AND e.rol = 'vendedor'
      GROUP BY e.id
    `, empresaId, inicio, fin)

    const gastosMap = Object.fromEntries(gastos.map((g:any) => [g.empleadoId, { gastos: Number(g.gastos), num_gastos: Number(g.num_gastos), detalle: g.detalle || [] }]))
    const ventasMap = Object.fromEntries(ventas.map((v:any) => [v.empleado_id, { ventas: Number(v.ventas), num_facturas: Number(v.num_facturas) }]))

    const data = recaudos.map((e: any) => ({
      id: e.id,
      nombre: e.nombre,
      rol: e.rol,
      ventas: ventasMap[e.id]?.ventas ?? 0,
      numFacturas: ventasMap[e.id]?.num_facturas ?? 0,
      recaudos: Number(e.recaudos),
      numRecaudos: Number(e.num_recaudos),
      gastos: gastosMap[e.id]?.gastos ?? 0,
      numGastos: gastosMap[e.id]?.num_gastos ?? 0,
      gastosDetalle: gastosMap[e.id]?.detalle ?? [],
    }))

    // Metas empresa del mes
    const [metasV, metasR] = await Promise.all([
      (prisma as any).metaVenta.findMany({ where: { empresaId, mes, anio }, select: { metaPesos: true } }),
      (prisma as any).metaRecaudo.findMany({ where: { empresaId, mes, anio }, select: { metaPesos: true } }),
    ])
    const metaVentaTotal = metasV.reduce((s: number, r: any) => s + Number(r.metaPesos || 0), 0)
    const metaRecaudoTotal = metasR.reduce((s: number, r: any) => s + Number(r.metaPesos || 0), 0)

    return NextResponse.json({ ok: true, data, mes, anio, empresaId, metaVentaTotal, metaRecaudoTotal })
  } catch (e: any) {
    console.error('[reportes/vendedores]', e.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
