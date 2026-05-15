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
  const cursor        = sp.get('cursor')             // cursor cards
  const controlCursor = sp.get('controlCursor')       // cursor control consecutivos
  const q             = sp.get('q')?.trim() ?? ''

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

  // Control de consecutivos — solo para tab despachado
  let controlFacturas: any[] = []
  let controlHayMas = false
  let controlNextCursorVal: string | null = null
  if (estado === 'despachado') {
    const controlCursorFilter = controlCursor
      ? `AND CAST("numeroFactura" AS INTEGER) < ${parseInt(controlCursor)}`
      : ''
    const CONTROL_LIMIT = 50

    const controlRows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        "numeroFactura",
        "clienteNombre",
        "entregadoEl",
        "alistadoEl",
        "repartidorId",
        "guiaTransporte",
        "transportadora",
        estado,
        CAST("numeroFactura" AS INTEGER) AS nf_int
      FROM gestor."OrdenDespacho"
      WHERE "empresaId" = $1
        AND ${origenSQL}
        AND "numeroFactura" ~ '^[0-9]+$'
        AND ("fechaOrden" >= $2::timestamp OR ("fechaOrden" IS NULL AND "createdAt" >= $2::timestamp))
        ${controlCursorFilter}
      ORDER BY nf_int DESC
      LIMIT ${CONTROL_LIMIT + 1}
    `, empresaId, desdeIso)

    controlHayMas = controlRows.length > CONTROL_LIMIT
    const controlRowsSliced = controlHayMas ? controlRows.slice(0, CONTROL_LIMIT) : controlRows
    if (controlHayMas && controlRowsSliced.length > 0) {
      controlNextCursorVal = String(controlRowsSliced[controlRowsSliced.length - 1].nf_int)
    }

    // Rango max desde el primer resultado, min del último
    // Rellenar huecos entre el max del batch y el min — completar el rango
    if (controlRowsSliced.length > 0) {
      const maxBatch = controlRowsSliced[0].nf_int
      // Si hay cursor, el anterior batch terminó en controlCursor → el rango empieza en maxBatch
      const rangeMax = controlCursor ? parseInt(controlCursor) - 1 : maxBatch
      const rangeMin = controlRowsSliced[controlRowsSliced.length - 1].nf_int
      const mapaFacturas = new Map(controlRowsSliced.map(r => [r.nf_int, r]))
      for (let n = rangeMax; n >= rangeMin; n--) {
        const r = mapaFacturas.get(n)
        const despachada = r && ['en_entrega','entregado','en_transito'].includes(r.estado)
        controlFacturas.push({
          numero: n,
          clienteNombre: r?.clienteNombre || null,
          entregadoEl:   despachada ? (r?.entregadoEl || r?.alistadoEl || null) : null,
          confirmado:    despachada && !!(r?.repartidorId || r?.guiaTransporte || r?.transportadora),
          despachada,
          hueco: !r,  // número que no existe en BD
        })
      }
    }
  }

  return NextResponse.json({
    despachos,
    nextCursor,
    hayMas,
    ciudadLocal:       meta[0]?.ciudadEntregaLocal ?? null,
    bodegaPuedeEnviar: meta[0]?.bodegaPuedeEnviar ?? false,
    ultimaSyncBodega:  meta[0]?.ultimaSyncBodega ?? null,
    controlFacturas,
    controlNextCursor: controlNextCursorVal,
    controlHayMas,
  })
}
