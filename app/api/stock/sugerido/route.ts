import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

// GET — promedios históricos por productoId para la empresa
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const empresaId = getEmpresaId(user)

    const rows = await (prisma as any).$queryRawUnsafe(`
      SELECT
        "productoId",
        AVG(sugerido)::float AS promedio,
        COUNT(*)::int        AS total_guardados
      FROM ${DB_SCHEMA}."StockSugerido"
      WHERE "empresaId" = $1
      GROUP BY "productoId"
    `, empresaId)

    const map: Record<string, { promedio: number; total_guardados: number }> = {}
    for (const r of rows as any[]) {
      map[r.productoId] = { promedio: r.promedio, total_guardados: r.total_guardados }
    }

    return NextResponse.json({ promedios: map }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err: any) {
    console.error('[api/stock/sugerido] GET error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST — guardar snapshot de sugeridos con fecha
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const empresaId = getEmpresaId(user)
    const body = await req.json()
    const { items } = body as {
      items: { productoId: string; nombre: string; costo: number | null; sugerido: number; diferencia: number }[]
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items requerido' }, { status: 400 })
    }

    // Insert batch
    const values = items.map((_, i) => {
      const base = i * 5
      return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, now())`
    }).join(', ')

    const params: any[] = []
    for (const it of items) {
      params.push(empresaId, it.productoId, it.nombre, it.costo ?? null, it.sugerido, it.diferencia)
    }

    await (prisma as any).$executeRawUnsafe(`
      INSERT INTO ${DB_SCHEMA}."StockSugerido"
        ("empresaId", "productoId", nombre, costo, sugerido, diferencia, fecha)
      VALUES ${values}
    `, ...params)

    return NextResponse.json({ ok: true, guardados: items.length })
  } catch (err: any) {
    console.error('[api/stock/sugerido] POST error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
