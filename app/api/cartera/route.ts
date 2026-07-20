import { NextRequest, NextResponse } from 'next/server'
import { nowBogota, fechaHoyBogota, haceNDiasBogota, haceNMesesBogota, inicioDiaBogota, finDiaBogota, inicioMesBogota, inicioMesAnteriorBogota, mesBogota, anioBogota, mesAnteriorBogota, anioMesAnteriorBogota, esDelMesBogota, fmtFechaHora, fmtFechaMedia, fmtHora } from '@/lib/fechas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularEstado } from '@/lib/cartera'


export async function GET(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '15')
  const skip = (page - 1) * limit

  // Detectar integracion activa
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })

  if (integracion) {
    // Leer desde CarteraCache
    const where: any = { integracionId: integracion.id, saldoPendiente: { gt: 0 } }
    let miApiId: string | null = null
    if (user.role === 'vendedor') {
      // apiId viene en el JWT desde el login; fallback a BD para sesiones antiguas
      miApiId = (user as any).apiId || null
      if (!miApiId) {
        const emp = await (prisma as any).empleado.findUnique({ where: { id: user.id }, select: { apiId: true } })
        miApiId = emp?.apiId || null
      }
      if (!miApiId) {
        // Sin apiId → cartera vacía
        return NextResponse.json({ carteras: [], total: 0, page, pages: 0, totalSaldoPendiente: 0, totalSaldoTotal: 0, _integracion: { id: integracion.id, nombre: integracion.nombre } })
      }
    }
    if (q) {
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { nit: { contains: q, mode: 'insensitive' } },
      ]
    }

    // Para vendedor: un solo queryRaw con subquery — sin traer filas a Node.js
    if (miApiId) {
      const searchWhere = q ? `AND (cc.nombre ILIKE $4 OR cc.nit ILIKE $4)` : ''
      const qParam = q ? `%${q}%` : null

      type Row = { id: string, clienteapiid: string, nombre: string, nit: string, telefono: string, saldopendiente: string, saldototal: string, porestado: any, deudas: any, empleadonombre: string, ultimaactualizacion: string, total_count: string, sum_pendiente: string, sum_total: string }

      const rows: Row[] = q
        ? await prisma.$queryRaw`
            SELECT cc.*, COUNT(*) OVER() AS total_count,
              SUM(cc."saldoPendiente") OVER() AS sum_pendiente,
              SUM(cc."saldoTotal") OVER() AS sum_total
            FROM ${Prisma.raw(DB_SCHEMA)}."CarteraCache" cc
            WHERE cc."integracionId" = ${integracion.id}
              AND cc."saldoPendiente" > 0
              AND cc."clienteApiId" IN (
                SELECT DISTINCT "clienteApiId" FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda"
                WHERE "integracionId" = ${integracion.id}
                  AND "empleadoExternalId" = ${miApiId}
                  AND condition = true
              )
              AND (cc.nombre ILIKE ${`%${q}%`} OR cc.nit ILIKE ${`%${q}%`})
            ORDER BY cc.nombre ASC
            LIMIT ${limit} OFFSET ${skip}`
        : await prisma.$queryRaw`
            SELECT cc.*, COUNT(*) OVER() AS total_count,
              SUM(cc."saldoPendiente") OVER() AS sum_pendiente,
              SUM(cc."saldoTotal") OVER() AS sum_total
            FROM ${Prisma.raw(DB_SCHEMA)}."CarteraCache" cc
            WHERE cc."integracionId" = ${integracion.id}
              AND cc."saldoPendiente" > 0
              AND cc."clienteApiId" IN (
                SELECT DISTINCT "clienteApiId" FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda"
                WHERE "integracionId" = ${integracion.id}
                  AND "empleadoExternalId" = ${miApiId}
                  AND condition = true
              )
            ORDER BY cc.nombre ASC
            LIMIT ${limit} OFFSET ${skip}`

      // window functions también vienen en minúsculas desde $queryRaw
      const total = rows.length > 0 ? Number(rows[0].total_count ?? rows[0]['total_count'] ?? 0) : 0
      const totalSaldoPendiente = rows.length > 0 ? Number(rows[0].sum_pendiente ?? rows[0]['sum_pendiente'] ?? 0) : 0
      const totalSaldoTotal = rows.length > 0 ? Number(rows[0].sum_total ?? rows[0]['sum_total'] ?? 0) : 0

      // $queryRaw devuelve columnas en minúsculas — leer con lowercase
      const carteras = rows.map((c: any) => {
        const clienteId    = c.clienteid    || c.clienteId    || null
        const clienteApiId = c.clienteapiid || c.clienteApiId || null
        const saldoPend    = Number(c.saldopendiente ?? c.saldoPendiente ?? 0)
        const saldoTot     = Number(c.saldototal     ?? c.saldoTotal     ?? 0)
        const porEstado    = c.porestado    || c.porEstado    || {}
        const deudas       = c.deudas || []
        const empleadoNombre = c.empleadonombre || c.empleadoNombre || null
        return {
          id: clienteId || clienteApiId,
          clienteId,
          _sincronizado: true,
          saldoPendiente: saldoPend,
          saldoTotal: saldoTot,
          porEstado,
          ultimaActualizacion: c.ultimaactualizacion || c.ultimaActualizacion,
          cliente: { id: clienteId, nombre: c.nombre, nit: c.nit, telefono: c.telefono, apiId: clienteApiId },
          empleado: empleadoNombre ? { nombre: empleadoNombre } : null,
          DetalleCartera: (deudas as any[]).map((d: any) => {
            const vf = Number(d.valor || 0), ab = Number(d.abono || 0), saldo = Math.max(0, vf - ab)
            const { estado, label, color } = calcularEstado(saldo, vf, ab, d.fechaVencimiento ? new Date(d.fechaVencimiento) : null)
            return { ...d, valorFactura: vf, abonos: ab, saldoPendiente: saldo, estado, estadoLabel: label, estadoColor: color }
          }),
          PagoCartera: [],
        }
      })

      return NextResponse.json({ carteras, total, page, pages: Math.ceil(total / limit), totalSaldoPendiente, totalSaldoTotal, _integracion: { id: integracion.id, nombre: integracion.nombre } })
    }

    const [caches, total, agg] = await Promise.all([
      (prisma as any).carteraCache.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nombre: 'asc' }
      }),
      (prisma as any).carteraCache.count({ where }),
      (prisma as any).carteraCache.aggregate({ where, _sum: { saldoPendiente: true, saldoTotal: true } })
    ])

    // Normalizar al formato que espera la UI
    const carteras = caches.map((c: any) => ({
      id: c.clienteId || c.clienteApiId,
      clienteId: c.clienteId,
      _sincronizado: true,
      saldoPendiente: Number(c.saldoPendiente),
      saldoTotal: Number(c.saldoTotal),
      porEstado: c.porEstado,
      ultimaActualizacion: c.ultimaActualizacion,
      cliente: {
        id: c.clienteId,
        nombre: c.nombre,
        nit: c.nit,
        telefono: c.telefono,
        apiId: c.clienteApiId,
      },
      empleado: c.empleadoNombre ? { nombre: c.empleadoNombre } : null,
      DetalleCartera: (c.deudas as any[] || []).map((d: any) => {
        const vf = Number(d.valor || 0)
        const ab = Number(d.abono || 0)
        const saldo = Math.max(0, vf - ab)
        const { estado, label, color } = calcularEstado(saldo, vf, ab, d.fechaVencimiento ? new Date(d.fechaVencimiento) : null)
        return {
          ...d,
          valorFactura: vf,
          abonos: ab,
          saldoPendiente: saldo,
          estado,
          estadoLabel: label,
          estadoColor: color,
        }
      }),
      PagoCartera: [],
    }))

    return NextResponse.json({
      carteras,
      total,
      page,
      pages: Math.ceil(total / limit),
      totalSaldoPendiente: Number(agg._sum.saldoPendiente || 0),
      totalSaldoTotal: Number(agg._sum.saldoTotal || 0),
      _integracion: { id: integracion.id, nombre: integracion.nombre }
    })
  }

  // Sin integración activa
  return NextResponse.json({ carteras: [], total: 0, page, pages: 0, totalSaldoPendiente: 0, totalSaldoTotal: 0 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
