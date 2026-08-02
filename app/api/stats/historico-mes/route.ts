import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const role = user.role as string
    const empresaId = getEmpresaId(user)
    const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'
    const { searchParams } = new URL(req.url)
    const mes = searchParams.get('mes') // '2026-07'
    if (!mes) return NextResponse.json({ error: 'mes requerido' }, { status: 400 })

    const esVendedor = role === 'vendedor'
    const empId = user.id as string | null

    const apiId = user.apiId as string | null

    const rows: any[] = esVendedor && empId && apiId
      ? await (prisma as any).$queryRawUnsafe(
          `SELECT tipo,
            SUM((datos->>'total')::float)::float AS total,
            SUM((datos->>'pendiente')::float)::float AS pendiente
           FROM ${DB_SCHEMA}."SnapshotMes"
           WHERE empresa_id = $1 AND mes = $2 AND tipo IN ('recaudo','descuento','cartera')
             AND (empleado_id = $3 OR vendedor_api_id = $4)
           GROUP BY tipo`, empresaId, mes, empId, apiId)
      : await (prisma as any).$queryRawUnsafe(
          `SELECT tipo,
            SUM((datos->>'total')::float)::float AS total,
            SUM((datos->>'pendiente')::float)::float AS pendiente
           FROM ${DB_SCHEMA}."SnapshotMes"
           WHERE empresa_id = $1 AND mes = $2 AND tipo IN ('recaudo','descuento','cartera')
           GROUP BY tipo`, empresaId, mes)

    const result: Record<string, any> = {}
    for (const r of rows) result[r.tipo] = r

    const res = NextResponse.json({
      recaudo:   result['recaudo']?.total    ?? 0,
      descuento: result['descuento']?.total  ?? 0,
      cartera:   result['cartera']?.total    ?? 0,
      pendiente: result['cartera']?.pendiente ?? 0,
    })
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  } catch (err: any) {
    console.error('[stats/historico-mes]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
