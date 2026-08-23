import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma, DB_SCHEMA } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'vendedor') return NextResponse.json({ deOtros: [] })

  const apiId = user.apiId
  if (!apiId) return NextResponse.json({ deOtros: [] })

  const empresaId = getEmpresaId(user)
  const body = await req.json().catch(() => ({}))
  const huecos: number[] = (body.huecos || []).filter((n: any) => typeof n === 'number' && n > 0).slice(0, 500)
  if (!huecos.length) return NextResponse.json({ deOtros: [] })

  // Números que existen en OrdenDespacho pero son de otro vendedor
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT CAST("numeroFactura" AS INTEGER) as n
     FROM ${DB_SCHEMA}."OrdenDespacho"
     WHERE "empresaId" = $1
     AND "numeroFactura" ~ '^[0-9]+$'
     AND CAST("numeroFactura" AS INTEGER) = ANY($2::int[])
     AND ("vendedorApiId" != $3 OR "vendedorApiId" IS NULL)`,
    empresaId,
    huecos,
    apiId
  )

  return NextResponse.json({ deOtros: rows.map((r: any) => Number(r.n)) })
}
