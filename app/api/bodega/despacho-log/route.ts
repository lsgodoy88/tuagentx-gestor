import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN_BODEGA.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const sp = req.nextUrl.searchParams
  const origenId = sp.get('origenId') ?? 'propia'
  const cursor   = sp.get('cursor')  // último id visto
  const LIMIT = 50

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, "numeroFactura", "clienteNombre", modo, "guiaTransporte", transportadora, "despachadoEl"
    FROM gestor."DespachoLog"
    WHERE "empresaId" = $1
      AND ${origenId !== 'propia' ? `"origenVinculadaId" = '${origenId.replace(/'/g,"''")}'` : '"origenVinculadaId" IS NULL'}
      ${cursor ? `AND "despachadoEl" < (SELECT "despachadoEl" FROM gestor."DespachoLog" WHERE id = '${cursor.replace(/'/g,"''")}' LIMIT 1)` : ''}
    ORDER BY "despachadoEl" DESC
    LIMIT ${LIMIT + 1}
  `, empresaId)

  const hayMas  = rows.length > LIMIT
  const data    = hayMas ? rows.slice(0, LIMIT) : rows
  const nextCursor = hayMas ? data[data.length - 1].id : null

  return NextResponse.json({ data, nextCursor, hayMas })
}
