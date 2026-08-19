import { NextRequest, NextResponse } from 'next/server'

const MASTER_URL = 'http://localhost:3020'

export async function GET(req: NextRequest) {
  const wompiId = req.nextUrl.searchParams.get('id')
  if (!wompiId) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const res = await fetch(`${MASTER_URL}/api/pago-info?id=${wompiId}`, {
    headers: { 'x-internal': 'gestor' },
    cache: 'no-store',
  }).catch(() => null)

  if (!res?.ok) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const data = await res.json()

  // Si voucherNum no viene de master, buscarlo en PlanEmpresa staging
  if (!data.voucherNum && data.empresaId) {
    try {
      const { prisma } = await import('@/lib/prisma')
      const rows = await prisma.$queryRawUnsafe<{voucherNum: string, voucherTipo: string}[]>(
        'SELECT "voucherNum", "voucherTipo" FROM gestor_staging."PlanEmpresa" WHERE "empresaId" = $1 AND "voucherNum" IS NOT NULL ORDER BY mes DESC LIMIT 1',
        data.empresaId
      )
      if (rows[0]?.voucherNum) {
        data.voucherNum = rows[0].voucherNum
        data.voucherTipo = rows[0].voucherTipo
      }
    } catch {}
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
