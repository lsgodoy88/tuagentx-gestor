import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

// GET — productos paginados (misma lógica que /api/impulsar/inventario)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['impulsadora', 'empresa', 'supervisor', 'vendedor'].includes(user.role)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }

    const empresaId = getEmpresaId(user)
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    const linea = searchParams.get('linea') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'))
    const offset = (page - 1) * limit

    const conditions: string[] = [`p."empresaId" = $1`, `p.condition = true`]
    const params: any[] = [empresaId]
    let pi = 2

    if (q) { conditions.push(`p.nombre ILIKE $${pi}`); params.push(`%${q}%`); pi++ }
    if (linea) { conditions.push(`p.linea ILIKE $${pi}`); params.push(`%${linea}%`); pi++ }

    const where = conditions.join(' AND ')

    const [rows, countRows, lineas, preciosRows] = await Promise.all([
      (prisma as any).$queryRawUnsafe(`
        SELECT p.id, p.nombre, p.linea, p.marca, p.precio
        FROM ${DB_SCHEMA}."Producto" p
        WHERE ${where}
        ORDER BY p.nombre ASC
        LIMIT ${limit} OFFSET ${offset}
      `, ...params),
      (prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*)::int AS total FROM ${DB_SCHEMA}."Producto" p WHERE ${where}
      `, ...params),
      (prisma as any).$queryRawUnsafe(`
        SELECT DISTINCT linea FROM ${DB_SCHEMA}."Producto"
        WHERE "empresaId" = $1 AND condition = true AND linea IS NOT NULL ORDER BY linea
      `, empresaId),
      // Último precio_venta registrado por producto para esta impulsadora
      (prisma as any).$queryRawUnsafe(`
        SELECT DISTINCT ON ("productoId") "productoId", precio_venta
        FROM ${DB_SCHEMA}."ImpulsoRotacion"
        WHERE "empresaId" = $1 AND "empleadoId" = $2
          AND precio_venta IS NOT NULL AND precio_venta > 0
        ORDER BY "productoId", "createdAt" DESC
      `, empresaId, user.id),
    ])

    const precioMap: Record<string, number> = {}
    for (const r of preciosRows as any[]) {
      precioMap[r.productoId] = Number(r.precio_venta)
    }

    const total = countRows[0]?.total ?? 0
    return NextResponse.json({
      productos: (rows as any[]).map((p: any) => ({ ...p, ultimoPrecio: precioMap[p.id] ?? null })),
      total,
      page,
      pages: Math.ceil(total / limit),
      filtros: { lineas: lineas.map((r: any) => r.linea) },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err: any) {
    console.error('[api/impulsar/rotacion] GET error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST — guardar snapshot rotación
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role !== 'impulsadora') {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }

    const empresaId = getEmpresaId(user)
    const { clienteId, filas } = await req.json()
    // filas: [{ productoId, cantidad, precioVenta }]

    if (!clienteId || !Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    const empleado = await prisma.empleado.findUnique({
      where: { id: user.id },
      select: { vendedorId: true }
    })
    if (!empleado?.vendedorId) {
      return NextResponse.json({ error: 'Impulsadora sin vendedor asignado' }, { status: 400 })
    }

    const filasValidas = filas.filter((f: any) =>
      f.productoId && f.cantidad != null && f.precioVenta != null
    )
    if (filasValidas.length === 0) {
      return NextResponse.json({ error: 'Sin datos para guardar' }, { status: 400 })
    }

    await (prisma as any).impulsoRotacion.createMany({
      data: filasValidas.map((f: any) => ({
        id: crypto.randomUUID(),
        clienteId,
        productoId: f.productoId,
        cantidad: f.cantidad != null ? parseFloat(f.cantidad) : null,
        precio_venta: f.precioVenta != null ? parseFloat(f.precioVenta) : null,
        empleadoId: user.id,
        vendedorId: empleado.vendedorId!,
        empresaId,
      }))
    })

    return NextResponse.json({ ok: true, guardados: filasValidas.length })
  } catch (err: any) {
    console.error('[api/impulsar/rotacion] POST error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
