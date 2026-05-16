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
    SELECT l.id, l."numeroFactura", l."clienteNombre", l.modo, l."guiaTransporte", l.transportadora, l."despachadoEl",
           o."alistadoEl", o.ciudad, o."fotosAlistamiento", o."fotoAlistamiento"
    FROM gestor."DespachoLog" l
    LEFT JOIN gestor."OrdenDespacho" o
      ON o."numeroFactura" = l."numeroFactura"
      AND o."empresaId" = l."empresaId"
      AND (o."origenVinculadaId" = l."origenVinculadaId" OR (o."origenVinculadaId" IS NULL AND l."origenVinculadaId" IS NULL))
    WHERE l."empresaId" = $1
      AND ${origenId !== 'propia' ? `l."origenVinculadaId" = '${origenId.replace(/'/g,"''")}'` : 'l."origenVinculadaId" IS NULL'}
      ${cursor ? `AND l."despachadoEl" < (SELECT "despachadoEl" FROM gestor."DespachoLog" WHERE id = '${cursor.replace(/'/g,"''")}' LIMIT 1)` : ''}
    ORDER BY l."despachadoEl" DESC
    LIMIT ${LIMIT + 1}
  `, empresaId)

  const hayMas  = rows.length > LIMIT
  const data    = hayMas ? rows.slice(0, LIMIT) : rows
  const nextCursor = hayMas ? data[data.length - 1].id : null

  // Serializar despachadoEl a string ISO para evitar problemas de tipo en cliente
  const serialized = data.map((r: any) => ({
    ...r,
    despachadoEl: r.despachadoEl instanceof Date ? r.despachadoEl.toISOString() : (String(r.despachadoEl).endsWith('Z') ? String(r.despachadoEl) : String(r.despachadoEl) + 'Z'),
    alistadoEl: r.alistadoEl instanceof Date ? r.alistadoEl.toISOString() : r.alistadoEl ? (String(r.alistadoEl).endsWith('Z') ? String(r.alistadoEl) : String(r.alistadoEl) + 'Z') : null,
    ciudad: r.ciudad || null,
    fotosAlistamiento: r.fotosAlistamiento || null,
    fotoAlistamiento: r.fotoAlistamiento || null
  }))
  return NextResponse.json({ data: serialized, nextCursor, hayMas })
}
