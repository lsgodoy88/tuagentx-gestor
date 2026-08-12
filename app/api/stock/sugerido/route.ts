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

    // Si piden snapshots: agrupar por fecha (truncada al minuto) con total acumulado
    const snapshots = req.nextUrl.searchParams.get('snapshots')
    if (snapshots) {
      const snaps = await (prisma as any).$queryRawUnsafe(`
        SELECT
          date_trunc('minute', fecha) AS fecha,
          SUM(COALESCE(costo,0) * diferencia)::float AS total,
          COUNT(DISTINCT "productoId")::int AS productos
        FROM ${DB_SCHEMA}."StockSugerido"
        WHERE "empresaId" = $1
        GROUP BY date_trunc('minute', fecha)
        ORDER BY fecha DESC
      `, empresaId)
      const safe = (v: any): any => {
        if (typeof v === 'bigint') return Number(v)
        if (v instanceof Date) return v.toISOString()
        if (Array.isArray(v)) return v.map(safe)
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,val]) => [k, safe(val)]))
        return v
      }
      return NextResponse.json({ snapshots: safe(snaps) }, { headers: { 'Cache-Control': 'private, no-store' } })
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
    if (user.role !== 'empresa') {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const empresaId = getEmpresaId(user)
    const body = await req.json()
    const { items } = body as {
      items: { productoId: string; nombre: string; costo: number | null; sugerido: number; diferencia: number }[]
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items requerido', guardados: 0 }, { status: 400 })
    }

    // Insert batch — cast costo a float explícito
    const params: any[] = []
    const values = items.map((it, i) => {
      const base = i * 6
      params.push(
        empresaId,
        it.productoId,
        it.nombre,
        it.costo != null ? parseFloat(String(it.costo)) : null,
        parseFloat(String(it.sugerido)),
        parseFloat(String(it.diferencia)),
      )
      return `($${base+1}, $${base+2}, $${base+3}, $${base+4}::float8, $${base+5}::float8, $${base+6}::float8, now())`
    }).join(', ')

    await (prisma as any).$executeRawUnsafe(`
      INSERT INTO ${DB_SCHEMA}."StockSugerido"
        ("empresaId", "productoId", nombre, costo, sugerido, diferencia, fecha)
      VALUES ${values}
    `, ...params)

    // Limpiar stock_sugerido de los productos guardados
    const ids = items.map(it => it.productoId)
    const placeholders = ids.map((_,i) => `$${i+2}`).join(',')
    await (prisma as any).$executeRawUnsafe(
      `UPDATE ${DB_SCHEMA}."Producto" SET stock_sugerido = NULL, "updatedAt" = now() WHERE id IN (${placeholders}) AND "empresaId" = $1`,
      empresaId, ...ids
    )

    return NextResponse.json({ ok: true, guardados: items.length })
  } catch (err: any) {
    console.error('[api/stock/sugerido] POST error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
