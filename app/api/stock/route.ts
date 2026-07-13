import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { Prisma } from '@/app/generated/prisma'

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
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    // Empresa vinculada desde /bodega/[slug]
    const empresaIdParam = searchParams.get('origenId')
    let empresaIdConsulta = empresaId
    if (empresaIdParam && empresaIdParam !== 'propia') {
      const vinculada = await (prisma as any).empresaVinculada.findFirst({
        where: { id: empresaIdParam, empresaId, activa: true },
        select: { empresaClienteId: true },
      })
      if (vinculada) empresaIdConsulta = vinculada.empresaClienteId
    }
    const soloStockBajo = searchParams.get('stockBajo') === 'true'
    const marca = searchParams.get('marca') || ''
    const linea = searchParams.get('linea') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'))
    const offset = (page - 1) * limit

    // Construir WHERE dinámico
    const conditions: string[] = [
      `p."empresaId" = $1`,
      `p.condition = true`,
    ]
    const params: any[] = [empresaIdConsulta]
    let pi = 2

    if (q) {
      conditions.push(`(p.nombre ILIKE $${pi} OR p.barcode ILIKE $${pi})`)
      params.push(`%${q}%`)
      pi++
    }
    if (marca) {
      conditions.push(`p.marca ILIKE $${pi}`)
      params.push(`%${marca}%`)
      pi++
    }
    if (linea) {
      conditions.push(`p.linea ILIKE $${pi}`)
      params.push(`%${linea}%`)
      pi++
    }
    if (soloStockBajo) {
      // inventory < stockMinimo cuando stockMinimo está definido
      conditions.push(`(p."stockMinimo" IS NOT NULL AND p.inventory < p."stockMinimo")`)
    }

    const where = conditions.join(' AND ')

    const [rows, countRows] = await Promise.all([
      ((prisma as any).$queryRawUnsafe as any)(`
        SELECT
          p.id,
          p.nombre,
          p.barcode,
          p.inventory,
          p.precio,
          p.marca,
          p.linea,
          p.punto,
          p.invima,
          p."stockMinimo",
          p."externalUpdatedAt",
          CASE
            WHEN p."stockMinimo" IS NOT NULL AND p.inventory < p."stockMinimo" THEN true
            ELSE false
          END AS "stockBajo"
        FROM ${DB_SCHEMA}."Producto" p
        WHERE ${where}
        ORDER BY p.nombre ASC
        LIMIT ${limit} OFFSET ${offset}
      `, ...params),
      ((prisma as any).$queryRawUnsafe as any)(`
        SELECT COUNT(*)::int AS total
        FROM ${DB_SCHEMA}."Producto" p
        WHERE ${where}
      `, ...params),
    ])

    // Filtros disponibles (marcas y líneas únicas — usa empresaIdConsulta para vinculadas)
    const [marcas, lineas] = await Promise.all([
      ((prisma as any).$queryRawUnsafe as any)(`
        SELECT DISTINCT marca FROM ${DB_SCHEMA}."Producto"
        WHERE "empresaId" = $1 AND condition = true AND marca IS NOT NULL
        ORDER BY marca
      `, empresaIdConsulta),
      ((prisma as any).$queryRawUnsafe as any)(`
        SELECT DISTINCT linea FROM ${DB_SCHEMA}."Producto"
        WHERE "empresaId" = $1 AND condition = true AND linea IS NOT NULL
        ORDER BY linea
      `, empresaIdConsulta),
    ])

    const total = countRows[0]?.total ?? 0

    return NextResponse.json({
      productos: rows,
      total,
      page,
      pages: Math.ceil(total / limit),
      filtros: {
        marcas: marcas.map((r: any) => r.marca),
        lineas: lineas.map((r: any) => r.linea),
      },
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err: any) {
    console.error('[api/inventario] GET error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// PATCH — actualizar stockMinimo de un producto
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor'].includes(user.role)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const empresaId = getEmpresaId(user)
    const body = await req.json()
    const { id, stockMinimo } = body

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const val = stockMinimo === null || stockMinimo === '' ? null : parseFloat(stockMinimo)

    await (prisma as any).$executeRawUnsafe(`
      UPDATE ${DB_SCHEMA}."Producto"
      SET "stockMinimo" = $1, "updatedAt" = now()
      WHERE id = $2 AND "empresaId" = $3
    `, val, id, empresaId)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[api/inventario] PATCH error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
