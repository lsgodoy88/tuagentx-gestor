import { NextRequest, NextResponse } from 'next/server'
import { nowBogota, fechaHoyBogota, haceNDiasBogota, haceNMesesBogota, inicioDiaBogota, finDiaBogota, inicioMesBogota, inicioMesAnteriorBogota, mesBogota, anioBogota, mesAnteriorBogota, anioMesAnteriorBogota, esDelMesBogota, fmtFechaHora, fmtFechaMedia, fmtHora } from '@/lib/fechas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularEstado } from '@/lib/cartera'

async function poblarCarteraCache(integracionId: string, empresaId: string) {
  // Traer todas las deudas activas
  const deudas = await (prisma as any).syncDeuda.findMany({
    where: { integracionId, condition: true }
  })

  // Traer clientes con apiId en un solo query
  const apiIds = [...new Set(deudas.map((d: any) => d.clienteApiId))]
  const clientes = await (prisma as any).cliente.findMany({
    where: { apiId: { in: apiIds }, empresaId },
    select: { id: true, apiId: true, nombre: true, nit: true, telefono: true, ciudad: true }
  })
  const clienteMap: Record<string, any> = {}
  clientes.forEach((c: any) => { clienteMap[c.apiId] = c })

  // Traer empleados referenciados en las deudas
  const empleadoApiIds = [...new Set(deudas.map((d: any) => d.empleadoExternalId).filter(Boolean))] as string[]
  const empleados = await (prisma as any).empleado.findMany({
    where: { apiId: { in: empleadoApiIds }, empresaId },
    select: { apiId: true, nombre: true }
  })
  const empleadoMap: Record<string, string> = {}
  empleados.forEach((e: any) => { empleadoMap[e.apiId] = e.nombre })

  // Traer pagos locales vinculados
  const deudasIds = deudas.map((d: any) => d.id)
  const pagosLocales = await (prisma as any).pagoCartera.findMany({
    where: { syncDeudaId: { in: deudasIds } }
  })
  const pagosMap: Record<string, number> = {}
  pagosLocales.forEach((p: any) => {
    if (p.syncDeudaId) pagosMap[p.syncDeudaId] = (pagosMap[p.syncDeudaId] || 0) + Number(p.monto)
  })

  // Agrupar deudas por cliente
  const porCliente: Record<string, any[]> = {}
  for (const d of deudas) {
    if (!porCliente[d.clienteApiId]) porCliente[d.clienteApiId] = []
    porCliente[d.clienteApiId].push(d)
  }

  // Crear/actualizar CarteraCache por cliente
  const ahora = nowBogota()
  for (const [apiId, deudasCliente] of Object.entries(porCliente)) {
    const cliente = clienteMap[apiId]
    if (!cliente) continue

    // Determinar empleado mayoritario del cliente
    const conteoEmpleado: Record<string, number> = {}
    for (const d of deudasCliente) {
      if (d.empleadoExternalId) conteoEmpleado[d.empleadoExternalId] = (conteoEmpleado[d.empleadoExternalId] || 0) + 1
    }
    const empleadoPrincipal = Object.keys(conteoEmpleado).sort((a, b) => conteoEmpleado[b] - conteoEmpleado[a])[0] ?? null

    const porEstado: Record<string, number> = { pendiente: 0, vencida: 0, mora: 0, critica: 0, pagada: 0 }
    let saldoTotal = 0
    let saldoPendiente = 0

    const deudasDetalle = deudasCliente.map((d: any) => {
      const saldoSync = Number(d.saldo)
      const saldoAnt = Number(d.saldoAnterior ?? d.saldo)
      const pagosLocal = pagosMap[d.id] || 0
      const saldoCambio = Math.abs(saldoSync - saldoAnt) > 0.01
      const saldoReal = saldoCambio ? saldoSync : Math.max(0, saldoSync - pagosLocal)

      const valor = Number(d.valor)
      const { estado } = calcularEstado(saldoReal, valor, Number(d.abono), d.fechaVencimiento)
      porEstado[estado] = (porEstado[estado] || 0) + saldoReal

      saldoTotal += valor
      saldoPendiente += saldoReal

      return {
        id: d.id,
        externalId: d.externalId,
        numeroOrden: d.numeroOrden,
        numeroFactura: d.numeroFactura,
        valor,
        saldo: saldoReal,
        abono: Number(d.abono),
        diasCredito: d.diasCredito,
        fechaVencimiento: d.fechaVencimiento,
        estado,
      }
    })

    await (prisma as any).carteraCache.upsert({
      where: { integracionId_clienteApiId: { integracionId, clienteApiId: apiId } },
      create: {
        id: `cc-${integracionId}-${apiId}`,
        empresaId,
        integracionId,
        clienteId: cliente.id,
        clienteApiId: apiId,
        nombre: cliente.nombre,
        nit: cliente.nit,
        telefono: cliente.telefono,
        ciudad: cliente.ciudad,
        empleadoExternalId: empleadoPrincipal,
        empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null,
        saldoTotal,
        saldoPendiente,
        porEstado,
        deudas: deudasDetalle,
        totalDeudas: deudasDetalle.length,
        ultimaActualizacion: ahora,
      },
      update: {
        clienteId: cliente.id,
        nombre: cliente.nombre,
        nit: cliente.nit,
        telefono: cliente.telefono,
        ciudad: cliente.ciudad,
        empleadoExternalId: empleadoPrincipal,
        empleadoNombre: empleadoPrincipal ? (empleadoMap[empleadoPrincipal] ?? null) : null,
        saldoTotal,
        saldoPendiente,
        porEstado,
        deudas: deudasDetalle,
        totalDeudas: deudasDetalle.length,
        ultimaActualizacion: ahora,
      }
    })
  }

  return Object.keys(porCliente).length
}

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
            FROM gestor."CarteraCache" cc
            WHERE cc."integracionId" = ${integracion.id}
              AND cc."saldoPendiente" > 0
              AND cc."clienteApiId" IN (
                SELECT DISTINCT "clienteApiId" FROM gestor."SyncDeuda"
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
            FROM gestor."CarteraCache" cc
            WHERE cc."integracionId" = ${integracion.id}
              AND cc."saldoPendiente" > 0
              AND cc."clienteApiId" IN (
                SELECT DISTINCT "clienteApiId" FROM gestor."SyncDeuda"
                WHERE "integracionId" = ${integracion.id}
                  AND "empleadoExternalId" = ${miApiId}
                  AND condition = true
              )
            ORDER BY cc.nombre ASC
            LIMIT ${limit} OFFSET ${skip}`

      const total = rows.length > 0 ? Number(rows[0].total_count) : 0
      const totalSaldoPendiente = rows.length > 0 ? Number(rows[0].sum_pendiente) : 0
      const totalSaldoTotal = rows.length > 0 ? Number(rows[0].sum_total) : 0

      const carteras = rows.map((c: any) => ({
        id: c.clienteId || c.clienteApiId,
        clienteId: c.clienteId,
        _sincronizado: true,
        saldoPendiente: Number(c.saldoPendiente),
        saldoTotal: Number(c.saldoTotal),
        porEstado: c.porEstado,
        ultimaActualizacion: c.ultimaActualizacion,
        cliente: { id: c.clienteId, nombre: c.nombre, nit: c.nit, telefono: c.telefono, apiId: c.clienteApiId },
        empleado: c.empleadoNombre ? { nombre: c.empleadoNombre } : null,
        DetalleCartera: (c.deudas as any[] || []).map((d: any) => {
          const vf = Number(d.valor || 0), ab = Number(d.abono || 0), saldo = Math.max(0, vf - ab)
          const { estado, label, color } = calcularEstado(saldo, vf, ab, d.fechaVencimiento ? new Date(d.fechaVencimiento) : null)
          return { ...d, valorFactura: vf, abonos: ab, saldoPendiente: saldo, estado, estadoLabel: label, estadoColor: color }
        }),
        PagoCartera: [],
      }))

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
