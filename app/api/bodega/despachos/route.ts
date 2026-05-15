import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'

const ROLES = ROLES_ADMIN_BODEGA
const LIMIT  = 15
const DIAS   = 30

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const sp = req.nextUrl.searchParams

  // Parámetros
  const origenId  = sp.get('origenId') ?? 'propia'
  const estado    = sp.get('estado') ?? 'pendiente'   // pendiente | alistado | despachado
  const cursor    = sp.get('cursor')                   // último numeroFactura visto (int)
  const q         = sp.get('q')?.trim() ?? ''

  const esVinculada = origenId !== 'propia' && origenId !== ''
  const origenSQL   = esVinculada
    ? `"origenVinculadaId" = '${origenId.replace(/'/g, "''")}'`
    : `"origenVinculadaId" IS NULL`

  // Estados reales por tab
  const estadosFiltro: Record<string, string[]> = {
    pendiente:  ['pendiente'],
    alistado:   ['alistado'],
    despachado: ['en_entrega', 'entregado'],
  }
  const estados = estadosFiltro[estado] ?? ['pendiente']

  // Ventana de 30 días fija
  const desde = new Date()
  desde.setDate(desde.getDate() - DIAS)
  const desdeIso = desde.toISOString()

  // Filtro de búsqueda
  const qFilter = q
    ? `AND ("clienteNombre" ILIKE '%${q.replace(/'/g,"''")}%' OR "numeroFactura" ILIKE '%${q.replace(/'/g,"''")}%')`
    : ''

  // Cursor (número entero de la última factura vista)
  const cursorFilter = cursor
    ? `AND (CASE WHEN "numeroFactura" ~ '^[0-9]+$' THEN CAST("numeroFactura" AS INTEGER) ELSE 0 END) < ${parseInt(cursor)}`
    : ''

  const estadoIn = estados.map(e => `'${e}'`).join(',')

  const idRows = await prisma.$queryRawUnsafe<{ id: string; nf: number }[]>(`
    SELECT id,
      (CASE WHEN "numeroFactura" ~ '^[0-9]+$' THEN CAST("numeroFactura" AS INTEGER) ELSE 0 END) AS nf
    FROM gestor."OrdenDespacho"
    WHERE "empresaId" = $1
      AND ${origenSQL}
      AND estado IN (${estadoIn})
      AND ("fechaOrden" >= $2::timestamp OR ("fechaOrden" IS NULL AND "createdAt" >= $2::timestamp))
      ${qFilter}
      ${cursorFilter}
    ORDER BY nf DESC
    LIMIT ${LIMIT + 1}
  `, empresaId, desdeIso)

  const hayMas = idRows.length > LIMIT
  const rows   = hayMas ? idRows.slice(0, LIMIT) : idRows
  const nextCursor = hayMas ? String(rows[rows.length - 1].nf) : null

  const ordenIds = rows.map(r => r.id)
  const despachos = ordenIds.length > 0
    ? await (prisma as any).ordenDespacho.findMany({
        where: { id: { in: ordenIds } },
        select: {
          id: true, numeroFactura: true, clienteNombre: true, clienteNit: true,
          ciudad: true, direccion: true, telefono: true, estado: true, fechaOrden: true,
          alistadoEl: true, entregadoEl: true, fotoAlistamiento: true, fotosAlistamiento: true,
          firmaEntrega: true, fotoEntrega: true, repartidorId: true, transportadora: true,
          guiaTransporte: true, vendedorApiId: true, clienteApiId: true, origenVinculadaId: true,
          alistadoPor: { select: { id: true, nombre: true } },
          repartidor:  { select: { id: true, nombre: true } },
        }
      })
    : []

  // Reordenar según el orden del cursor (findMany no garantiza el orden)
  const ordenMap = new Map(ordenIds.map((id, i) => [id, i]))
  despachos.sort((a: any, b: any) => (ordenMap.get(a.id) ?? 0) - (ordenMap.get(b.id) ?? 0))

  // Meta de empresa
  const meta = await prisma.$queryRaw<[{
    ciudadEntregaLocal: string | null
    bodegaPuedeEnviar: boolean
    ultimaSyncBodega: Date | null
  }]>`
    SELECT "ciudadEntregaLocal", "bodegaPuedeEnviar", "ultimaSyncBodega"
    FROM gestor."Empresa" WHERE id = ${empresaId} LIMIT 1
  `

  return NextResponse.json({
    despachos,
    nextCursor,
    hayMas,
    ciudadLocal:       meta[0]?.ciudadEntregaLocal ?? null,
    bodegaPuedeEnviar: meta[0]?.bodegaPuedeEnviar ?? false,
    ultimaSyncBodega:  meta[0]?.ultimaSyncBodega ?? null,
  })
}
