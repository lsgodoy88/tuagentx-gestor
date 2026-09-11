import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor'].includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const mes = parseInt(searchParams.get('mes') || String(new Date().getMonth() + 1))
    const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()))
    const empresaId = searchParams.get('empresaId') || user.empresaId || user.id

    const cats: any[] = await prisma.$queryRawUnsafe(`
      SELECT ec.key, ec.label, ec.emoji,
        COALESCE(SUM(e.valor - e.retencion - e.descuento), 0) as total,
        COUNT(e.id) as cantidad
      FROM ${DB_SCHEMA}."EgresoCategoria" ec
      LEFT JOIN ${DB_SCHEMA}."Egreso" e ON e.categoria = ec.key
        AND e."empresaId" = ec."empresaId"
        AND e.mes = $1 AND e.anio = $2
      WHERE ec."empresaId" = $3
      GROUP BY ec.key, ec.label, ec.emoji, ec.orden
      ORDER BY ec.orden
    `, mes, anio, empresaId)

    return NextResponse.json({ ok: true, data: cats.map((c: any) => ({ ...c, total: Number(c.total), cantidad: Number(c.cantidad) })) })
  } catch (e: any) {
    console.error('[reportes/categorias]', e.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
