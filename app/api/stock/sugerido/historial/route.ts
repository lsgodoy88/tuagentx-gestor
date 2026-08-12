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
    const productoId = req.nextUrl.searchParams.get('productoId')
    if (!productoId) return NextResponse.json({ error: 'productoId requerido' }, { status: 400 })

    const items = await (prisma as any).$queryRawUnsafe(`
      SELECT sugerido, fecha
      FROM ${DB_SCHEMA}."StockSugerido"
      WHERE "empresaId" = $1 AND "productoId" = $2
      ORDER BY fecha DESC
    `, empresaId, productoId)

    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err: any) {
    console.error('[api/stock/sugerido/historial]', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
