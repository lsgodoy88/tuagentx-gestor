import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { resolverEmpresaIdOrigen } from '@/lib/bodega'
import { haceNDiasBogota } from '@/lib/fechas'

const LIMIT = 15
const DIAS  = 30

const estadosFiltro: Record<string, string[]> = {
  pendiente:  ['pendiente'],
  alistado:   ['alistado'],
  despachado: ['en_entrega', 'en_transito', 'entregado'],
}

export async function getDespachos(params: {
  empresaId: string
  origenId: string
  estado: string
  cursor: string | null
  controlCursor: string | null
  q: string
}) {
  const { empresaId, origenId, estado, cursor, controlCursor, q } = params

  const empresaIdConsulta = await resolverEmpresaIdOrigen(prisma, empresaId, origenId)
  const estados = estadosFiltro[estado] ?? ['pendiente']
  const desdePorVentana = haceNDiasBogota(DIAS)

  // Fecha de inicio bodega: MAX(fechaInicioBodega, hoy - 30 días)
  // Para vinculadas leer de EmpresaVinculada, para propia de Empresa
  let fechaInicio: Date | null = null
  if (origenId) {
    const vinRows = await prisma.$queryRaw<[{ fechaInicioBodega: Date | null }]>`
      SELECT "fechaInicioBodega" FROM ${Prisma.raw(DB_SCHEMA)}."EmpresaVinculada" WHERE id = ${origenId} LIMIT 1`
    fechaInicio = vinRows[0]?.fechaInicioBodega ?? null
  } else {
    const empresaRow = await prisma.$queryRaw<[{ fechaInicioBodega: Date | null }]>`
      SELECT "fechaInicioBodega" FROM ${Prisma.raw(DB_SCHEMA)}."Empresa" WHERE id = ${empresaIdConsulta} LIMIT 1`
    fechaInicio = empresaRow[0]?.fechaInicioBodega ?? null
  }
  // Si hay fechaInicioBodega → úsala directamente (reemplaza la ventana de 30 días)
  const desde = fechaInicio ?? desdePorVentana
  const desdeIso = desde.toISOString()

  const qFilter = q
    ? `AND ("clienteNombre" ILIKE '%${q.replace(/'/g, "''")}%' OR "numeroFactura" ILIKE '%${q.replace(/'/g, "''")}%')`
    : ''
  const cursorFilter = cursor
    ? `AND (CASE WHEN "numeroFactura" ~ '^[0-9]+$' THEN CAST("numeroFactura" AS INTEGER) ELSE 0 END) < ${parseInt(cursor)}`
    : ''
  const estadoIn = estados.map(e => `'${e}'`).join(',')

  const idRows = await prisma.$queryRawUnsafe<{ id: string; nf: number }[]>(`
    SELECT id,
      (CASE WHEN "numeroFactura" ~ '^[0-9]+$' THEN CAST("numeroFactura" AS INTEGER) ELSE 0 END) AS nf
    FROM ${DB_SCHEMA}."OrdenDespacho"
    WHERE "empresaId" = $1
      AND estado IN (${estadoIn})
      AND ("isActiva" IS NOT FALSE OR estado != 'pendiente')
      AND ("fechaOrdenBogota" >= $2::timestamp OR ("fechaOrdenBogota" IS NULL AND "createdAt" >= $2::timestamp))
      ${qFilter}
      ${cursorFilter}
    ORDER BY nf DESC
    LIMIT ${LIMIT + 1}
  `, empresaIdConsulta, desdeIso)

  const hayMas = idRows.length > LIMIT
  const rows = hayMas ? idRows.slice(0, LIMIT) : idRows
  const nextCursor = hayMas ? String(rows[rows.length - 1].nf) : null
  const ordenIds = rows.map(r => r.id)

  const despachos = ordenIds.length > 0
    ? await (prisma as any).ordenDespacho.findMany({
        where: { id: { in: ordenIds } },
        select: {
          id: true, numeroFactura: true, clienteNombre: true, clienteNit: true,
          ciudad: true, direccion: true, telefono: true, estado: true, fechaOrden: true, fechaFactura: true, isFacturada: true,
          alistadoEl: true, entregadoEl: true, fotoAlistamiento: true, fotosAlistamiento: true,
          firmaEntrega: true, fotoEntrega: true, repartidorId: true, transportadora: true,
          guiaTransporte: true, modo_despacho: true, vendedorApiId: true, clienteApiId: true, origenVinculadaId: true, num_cajas: true, observacion: true,
          alistadoPor: { select: { id: true, nombre: true } },
          repartidor:  { select: { id: true, nombre: true } },
          transprensaRemesa: { select: { estado_atencion: true, raw_estados: true, imagen_cumplido: true } },
        },
      })
    : []

  const ordenMap = new Map(ordenIds.map((id, i) => [id, i]))
  despachos.sort((a: any, b: any) => (ordenMap.get(a.id) ?? 0) - (ordenMap.get(b.id) ?? 0))

  const meta = await prisma.$queryRaw<[{
    ciudadEntregaLocal: string | null
    bodegaPuedeEnviar: boolean
    ultimaSyncBodega: Date | null
  }]>`
    SELECT
      COALESCE(
        NULLIF(TRIM(e."ciudadEntregaLocal"), ''),
        NULLIF(TRIM(ep."ciudadEntregaLocal"), '')
      ) AS "ciudadEntregaLocal",
      e."bodegaPuedeEnviar",
      e."ultimaSyncBodega"
    FROM ${Prisma.raw(DB_SCHEMA)}."Empresa" e
    LEFT JOIN ${Prisma.raw(DB_SCHEMA)}."EmpresaVinculada" ev ON ev."empresaClienteId" = e.id
    LEFT JOIN ${Prisma.raw(DB_SCHEMA)}."Empresa" ep ON ep.id = ev."empresaId"
    WHERE e.id = ${empresaId}
    LIMIT 1
  `

  let controlFacturas: any[] = []
  let controlHayMas = false
  let controlNextCursorVal: string | null = null

  if (estado === 'despachado') {
    const CONTROL_LIMIT = 50
    const controlCursorFilter = controlCursor
      ? `AND CAST("numeroFactura" AS INTEGER) < ${parseInt(controlCursor)}`
      : ''

    const controlRows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT "numeroFactura", "clienteNombre", "entregadoEl", "alistadoEl",
             "repartidorId", "guiaTransporte", "transportadora", estado,
             CAST("numeroFactura" AS INTEGER) AS nf_int
      FROM ${DB_SCHEMA}."OrdenDespacho"
      WHERE "empresaId" = $1
        AND "numeroFactura" ~ '^[0-9]+$'
        AND ("fechaOrdenBogota" >= $2::timestamp OR ("fechaOrdenBogota" IS NULL AND "createdAt" >= $2::timestamp))
        ${controlCursorFilter}
      ORDER BY nf_int DESC
      LIMIT ${CONTROL_LIMIT + 1}
    `, empresaIdConsulta, desdeIso)

    controlHayMas = controlRows.length > CONTROL_LIMIT
    const controlRowsSliced = controlHayMas ? controlRows.slice(0, CONTROL_LIMIT) : controlRows
    if (controlHayMas && controlRowsSliced.length > 0) {
      controlNextCursorVal = String(controlRowsSliced[controlRowsSliced.length - 1].nf_int)
    }

    if (controlRowsSliced.length > 0) {
      const rangeMax = controlCursor ? parseInt(controlCursor) - 1 : controlRowsSliced[0].nf_int
      const rangeMin = controlRowsSliced[controlRowsSliced.length - 1].nf_int
      const mapaFacturas = new Map(controlRowsSliced.map(r => [r.nf_int, r]))
      for (let n = rangeMax; n >= rangeMin; n--) {
        const r = mapaFacturas.get(n)
        const despachada = r && ['en_entrega', 'entregado', 'en_transito'].includes(r.estado)
        controlFacturas.push({
          numero: n,
          clienteNombre: r?.clienteNombre || null,
          entregadoEl: despachada ? (r?.entregadoEl || r?.alistadoEl || null) : null,
          confirmado: despachada && !!(r?.repartidorId || r?.guiaTransporte || r?.transportadora || r?.firmaEntrega),
          modo: r?.firmaEntrega ? 'personal' : r?.guiaTransporte || r?.transportadora ? 'transportadora' : r?.repartidorId ? 'repartidor' : null,
          trEstadoAtencion: r?.transprensaRemesa?.estado_atencion ?? null,
          trRawEstados:     r?.transprensaRemesa?.raw_estados ?? null,
          trImagenCumplido: r?.transprensaRemesa?.imagen_cumplido ?? null,
          despachada,
          hueco: !r,
        })
      }
    }
  }

  return {
    despachos,
    nextCursor,
    hayMas,
    ciudadLocal: meta[0]?.ciudadEntregaLocal ?? null,
    bodegaPuedeEnviar: meta[0]?.bodegaPuedeEnviar ?? false,
    ultimaSyncBodega: meta[0]?.ultimaSyncBodega ?? null,
    controlFacturas,
    controlNextCursor: controlNextCursorVal,
    controlHayMas,
  }
}
