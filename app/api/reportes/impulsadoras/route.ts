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

    // Ventas impulsadoras desde ReporteImpulsoMes
    const reportes: any[] = await prisma.$queryRawUnsafe(`
      SELECT r.resultados
      FROM ${DB_SCHEMA}."ReporteImpulsoMes" r
      WHERE r."empresaId" = $1 AND r.mes = $2 AND r.anio = $3
      LIMIT 1
    `, empresaId, mes, anio)

    let ventasMap: Record<string, { ventas: number; meta: number }> = {}
    if (reportes.length > 0) {
      const res = reportes[0].resultados
      const impulsadoras = res.impulsadoras || []
      impulsadoras.forEach((imp: any) => {
        ventasMap[imp.id] = { ventas: imp.totalMes || 0, meta: imp.totalMeta || 0 }
      })
    }

    // Visitas y gastos por impulsadora
    const impulsadoras: any[] = await prisma.$queryRawUnsafe(`
      SELECT e.id, e.nombre,
        COUNT(DISTINCT v.id) as visitas,
        COALESCE(SUM(g.valor), 0) as gastos
      FROM ${DB_SCHEMA}."Empleado" e
      LEFT JOIN ${DB_SCHEMA}."Visita" v ON v."empleadoId" = e.id
        AND v."createdAt" >= $1 AND v."createdAt" < $2
      LEFT JOIN ${DB_SCHEMA}."Gasto" g ON g."empleadoId" = e.id
        AND g."createdAt" >= $1 AND g."createdAt" < $2
      WHERE e."empresaId" = $3 AND e.rol = 'impulsadora' AND e.activo = true
      GROUP BY e.id, e.nombre
      ORDER BY e.nombre
    `, inicio, fin, empresaId)

    const data = impulsadoras.map((e: any) => ({
      id: e.id,
      nombre: e.nombre,
      ventas: ventasMap[e.id]?.ventas ?? 0,
      meta: ventasMap[e.id]?.meta ?? 0,
      visitas: Number(e.visitas),
      gastos: Number(e.gastos),
    }))

    return NextResponse.json({ ok: true, data, mes, anio, empresaId })
  } catch (e: any) {
    console.error('[reportes/impulsadoras]', e.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
