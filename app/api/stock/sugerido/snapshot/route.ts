import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const empresaId = getEmpresaId(user)
    const fecha = req.nextUrl.searchParams.get('fecha')
    if (!fecha) return NextResponse.json({ error: 'fecha requerida' }, { status: 400 })

    const items = await (prisma as any).$queryRawUnsafe(`
      SELECT nombre, diferencia, costo, sugerido, fecha
      FROM ${DB_SCHEMA}."StockSugerido"
      WHERE "empresaId" = $1
        AND date_trunc('minute', fecha) = date_trunc('minute', $2::timestamptz)
      ORDER BY nombre
    `, empresaId, fecha)

    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err: any) {
    console.error('[api/stock/sugerido/snapshot]', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
