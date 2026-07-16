import type { RecaudosResponse } from '@/lib/types/cartera'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN, vendedorScope } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const { permitido, empleadoIdForzado } = vendedorScope(user)
  if (!permitido) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const vendedorId = searchParams.get('vendedorId') || undefined
  const estado = searchParams.get('estado') || undefined
  const fecha = searchParams.get('fecha') || undefined
  const mes   = searchParams.get('mes')   ? parseInt(searchParams.get('mes')!)   : undefined
  const anio  = searchParams.get('anio')  ? parseInt(searchParams.get('anio')!)  : undefined
  const numeroRecibo = searchParams.get('numeroRecibo') || undefined
  const q = searchParams.get('q') || undefined
  const cursor = searchParams.get('cursor') || null
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  // Sin paginación cuando hay filtro de mes o día — trae todo
  const limit = Math.min(500, parseInt(searchParams.get('limit') || '500'))
  const useCursor = !!cursor || searchParams.has('cursor') || (searchParams.has('limit') && !searchParams.has('page'))
  const skip = useCursor ? undefined : (page - 1) * limit

  const nSaldoBySdLocal = new Map<string, number>()
  const saldoUptresBySdLocal = new Map<string, number>()
  const where: any = {
    OR: [
      { Cartera: { empresaId } },
      { AND: [{ carteraId: null }, { Empleado: { empresaId } }] },
    ],
  }

  if (empleadoIdForzado) where.empleadoId = empleadoIdForzado
  else if (vendedorId) where.empleadoId = vendedorId
  if (q) {
    const isNum = /^\d+$/.test(q.trim())
    where.OR = isNum
      ? [{ Cartera: { Cliente: { nombre: { contains: q, mode: 'insensitive' } } } }, { Aplicaciones: { some: { numeroFactura: parseInt(q) } } }, { numeroRecibo: { contains: q, mode: 'insensitive' } }]
      : [{ Cartera: { Cliente: { nombre: { contains: q, mode: 'insensitive' } } } }, { numeroRecibo: { contains: q, mode: 'insensitive' } }]
  }
  if (numeroRecibo) {
    where.numeroRecibo = numeroRecibo
  } else if (estado === 'revisar') {
    // FIX 26/06 — Revisar ya NO filtra por antigüedad de un pago individual.
    // Nueva lógica: una factura (SyncDeuda) entra a Revisar si (a) tiene AL MENOS
    // un pago en estado 'enviado' (señal de que alguien ya marcó "ya se le avisó
    // a UpTres"), (b) SaldoUpTres (SyncDeuda.saldo, crudo) sigue sin coincidir con
    // nSaldo (nuestra propia matemática: valor - SUM(todos los pagos), ver
    // reconstruirCartera() en sync-nocturno.ts) y (c) han pasado 10+ días desde
    // el ÚLTIMO pago/abono registrado a esa factura — control de que no se
    // "escape" un valor sin reconciliar en UpTres. Filtro inicial por empresa vía
    // Integracion.empresaId — aísla Lumeli/Leche, ver EmpresaVinculada.
    const diezDiasMs = 10 * 24 * 60 * 60 * 1000

    // 1. SyncDeudas de esta empresa con AL MENOS una PCD enviada hace 10+ días
    const pcdEnviadasAntiguas = await (prisma as any).$queryRawUnsafe(`
      SELECT DISTINCT pcd."syncDeudaId", pcd."envioFecha"
      FROM ${DB_SCHEMA}."PagoCarteraDeuda" pcd
      JOIN ${DB_SCHEMA}."SyncDeuda" sd ON sd.id = pcd."syncDeudaId"
      JOIN ${DB_SCHEMA}."Integracion" i ON i.id = sd."integracionId"
      WHERE i."empresaId" = $1
        AND pcd."envioEstado" = 'enviado'
        AND pcd."envioFecha" IS NOT NULL
        AND pcd."envioFecha" <= NOW() - INTERVAL '10 days'
    `, empresaId)

    const sdIdsConEnviado = new Set((pcdEnviadasAntiguas as any[]).map((p: any) => p.syncDeudaId))
    if (sdIdsConEnviado.size === 0) {
      return NextResponse.json({ pagos: [], nextCursor: null, hasMore: false })
    }

    // 2. Para esas SyncDeudas: calcular nSaldo real vs saldo UpTres
    // Excluir condition=false Y saldo=0 — UpTres las cerró, no hay discrepancia real
    const syncDeudasCandidatas = await (prisma as any).syncDeuda.findMany({
      where: { id: { in: Array.from(sdIdsConEnviado) }, NOT: { condition: false, saldo: 0 } },
      select: { id: true, valor: true, saldo: true, receivableAt: true }
    })

    // 3. Todas las PCD de esas deudas para calcular nSaldo real
    const todasPcd = await (prisma as any).pagoCarteraDeuda.findMany({
      where: { syncDeudaId: { in: Array.from(sdIdsConEnviado) } },
      select: { syncDeudaId: true, montoAplicado: true, createdAt: true, envioEstado: true, envioFecha: true }
    })
    const pcdPorSd = new Map<string, any[]>()
    for (const p of todasPcd) {
      if (!pcdPorSd.has(p.syncDeudaId)) pcdPorSd.set(p.syncDeudaId, [])
      pcdPorSd.get(p.syncDeudaId)!.push(p)
    }

    const sdIdsParaRevisar: string[] = []
    const receivableAtBySd = new Map<string, Date | null>()
    for (const sd of syncDeudasCandidatas) {
      const aplic = pcdPorSd.get(sd.id) || []
      // nSaldo = valor - SUM(todos los pagos aplicados)
      const totalPagado = aplic.reduce((acc: number, a: any) => acc + Number(a.montoAplicado || 0), 0)
      const nSaldo = Math.max(0, Number(sd.valor) - totalPagado)
      const saldoUpTres = Number(sd.saldo)
      // Si ya coinciden → discrepancia resuelta → no aparece en Revisar
      if (Math.abs(saldoUpTres - nSaldo) < 1) continue
      // Tomar fecha del último envío
      const ultimoAbono = aplic
        .filter((a: any) => a.envioEstado === 'enviado' && a.envioFecha)
        .reduce((max: number, a: any) => Math.max(max, new Date(a.envioFecha).getTime()), 0)
      if (ultimoAbono === 0) continue
      sdIdsParaRevisar.push(sd.id)
      receivableAtBySd.set(sd.id, sd.receivableAt ?? null)
      nSaldoBySdLocal.set(sd.id, nSaldo)
      saldoUptresBySdLocal.set(sd.id, saldoUpTres)
    }
    if (sdIdsParaRevisar.length === 0) {
      // Sin discrepancias — retornar lista vacía
      return NextResponse.json({ pagos: [], nextCursor: null, hasMore: false })
    }
    // Solo pagos YA ENVIADOS a UpTres con esa deuda — los pendientes van en tab Pendiente
    where.Aplicaciones = { some: { syncDeudaId: { in: sdIdsParaRevisar }, envioEstado: 'enviado' } }
  } else if (estado && estado !== 'todos') where.envioEstado = estado
  if (numeroRecibo) {
    // Búsqueda directa por recibo — ignora filtros de mes/fecha de la vista activa
  } else if (estado === 'revisar') {
    // Revisar ignora filtros de mes/fecha — siempre busca en todo el histórico
  } else if (mes && anio) {
    const inicioMes = new Date(`${anio}-${String(mes).padStart(2,'0')}-01T05:00:00.000Z`)
    const finMes    = new Date(inicioMes)
    finMes.setMonth(finMes.getMonth() + 1)
    where.createdAt = { gte: inicioMes, lt: finMes }
  } else if (fecha) {
    // Colombia = UTC-5: midnight Colombia = 05:00 UTC
    where.createdAt = {
      gte: new Date(`${fecha}T05:00:00.000Z`),
      lt: new Date(new Date(`${fecha}T05:00:00.000Z`).getTime() + 86400000),
    }
  }

  const include = {
    Cartera: {
      include: {
        Cliente: { select: { id: true, nombre: true, nit: true, telefono: true } },
      }
    },
    Empleado: { select: { id: true, nombre: true, rol: true } },
    Aplicaciones: { select: { numeroFactura: true, montoAplicado: true, descuento: true, envioEstado: true } },
  }

  if (useCursor) {
    const pagos = await prisma.pagoCartera.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include,
    })
    const hasMore = pagos.length > limit
    const data = hasMore ? pagos.slice(0, limit) : pagos
    const nextCursor = hasMore ? data[data.length - 1].id : null
    const dataHidratada = await hidratarSync(data, empresaId, nSaldoBySdLocal, saldoUptresBySdLocal)
    return NextResponse.json({ pagos: dataHidratada, nextCursor, hasMore })
  }

  const [pagos, total] = await Promise.all([
    prisma.pagoCartera.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include }),
    prisma.pagoCartera.count({ where }),
  ])
  const pagosHidratados = await hidratarSync(pagos, empresaId, nSaldoBySdLocal, saldoUptresBySdLocal)
  return NextResponse.json({ pagos: pagosHidratados, total, page, pages: Math.ceil(total / limit) })
}

async function hidratarSync(pagos: any[], empresaId: string, nSaldoBySd?: Map<string, number>, saldoUptresBySd?: Map<string, number>) {
  const syncPagos = pagos.filter((p: any) => !p.carteraId)
  if (syncPagos.length === 0) return pagos
  // Mapear pago.id -> primera Aplicacion
  const apps = await (prisma as any).pagoCarteraDeuda.findMany({
    where: { pagoId: { in: syncPagos.map((p: any) => p.id) } },
    orderBy: { createdAt: 'asc' },
  })
  const firstApp = new Map<string, any>()
  for (const a of apps) if (!firstApp.has(a.pagoId)) firstApp.set(a.pagoId, a)
  const sdIds = Array.from(new Set(apps.map((a: any) => a.syncDeudaId)))
  const sds = sdIds.length > 0
    ? await (prisma as any).syncDeuda.findMany({ where: { id: { in: sdIds } } })
    : []
  const sdMap = new Map(sds.map((s: any) => [s.id, s]))
  // Combinar apiIds de SyncDeuda + clienteApiId congelados en PagoCartera
  const apiIdsCongelados = syncPagos.map((p: any) => p.clienteApiId).filter(Boolean)
  const apiIds = Array.from(new Set([
    ...sds.map((s: any) => s.clienteApiId).filter(Boolean),
    ...apiIdsCongelados,
  ]))
  const clientes = apiIds.length > 0
    ? await (prisma as any).cliente.findMany({ where: { apiId: { in: apiIds }, empresaId } })
    : []
  const cliMap = new Map(clientes.map((c: any) => [c.apiId, c]))
  return pagos.map((p: any) => {
    if (p.carteraId) return p
    // Facturas aplicadas a este pago (todas sus PagoCarteraDeuda)
    const _facturas = apps
      .filter((a: any) => a.pagoId === p.id && a.numeroFactura != null)
      .map((a: any) => {
        const sdA: any = sdMap.get(a.syncDeudaId)
        const nSaldoA = (nSaldoBySd && a.syncDeudaId && nSaldoBySd.has(a.syncDeudaId)) ? nSaldoBySd.get(a.syncDeudaId)! : (sdA?.nSaldo != null ? Number(sdA.nSaldo) : null)
        const saldoUptresA = (saldoUptresBySd && a.syncDeudaId && saldoUptresBySd.has(a.syncDeudaId)) ? saldoUptresBySd.get(a.syncDeudaId)! : (sdA?.saldo != null ? Number(sdA.saldo) : null)
        return { numeroFactura: a.numeroFactura, montoAplicado: a.montoAplicado, descuento: a.descuento ?? null, syncDeudaId: a.syncDeudaId, nSaldo: nSaldoA, saldoUptres: saldoUptresA, ajusteManual: sdA?.ajusteManual != null ? Number(sdA.ajusteManual) : null }
      })
    // Prioridad: datos congelados en PagoCartera
    if (p.clienteApiId) {
      const cli: any = cliMap.get(p.clienteApiId)
      // Buscar receivableAt de la primera SyncDeuda de este pago
      // Para revisar: usar la primera factura CON discrepancia real como fila principal
      const appsDelPago = apps.filter((a: any) => a.pagoId === p.id)
      const faConDisc = appsDelPago.find((a: any) => nSaldoBySd && nSaldoBySd.has(a.syncDeudaId))
      const faFirst = faConDisc || firstApp.get(p.id)
      const sdFirst: any = faFirst ? sdMap.get(faFirst.syncDeudaId) : null
      const receivableAt = sdFirst?.receivableAt ?? null
      const syncDeudaId = faFirst?.syncDeudaId ?? null
      const nSaldo = (nSaldoBySd && syncDeudaId && nSaldoBySd.has(syncDeudaId)) ? nSaldoBySd.get(syncDeudaId)! : (sdFirst?.nSaldo != null ? Number(sdFirst.nSaldo) : null)
      const saldoUptres = (saldoUptresBySd && syncDeudaId && saldoUptresBySd.has(syncDeudaId)) ? saldoUptresBySd.get(syncDeudaId)! : (sdFirst?.saldo != null ? Number(sdFirst.saldo) : null)
      const ajusteManual = sdFirst?.ajusteManual != null ? Number(sdFirst.ajusteManual) : null
      if (cli) return { ...p, _facturas, receivableAt, nSaldo, saldoUptres, syncDeudaId, ajusteManual, cliente: { id: cli.id, nombre: cli.nombre, nit: cli.nit, telefono: cli.telefono } }
      // Sin cliente en BD pero con nombre congelado
      if (p.clienteNombre) return { ...p, _facturas, receivableAt, nSaldo, saldoUptres, syncDeudaId, ajusteManual, cliente: { nombre: p.clienteNombre } }
    }
    // Fallback pagos viejos
    const fa = firstApp.get(p.id)
    if (!fa) return { ...p, _facturas }
    const sd: any = sdMap.get(fa.syncDeudaId)
    const cli: any = sd ? cliMap.get(sd.clienteApiId) : null
    const nSaldoFb = (nSaldoBySd && sd?.id && nSaldoBySd.has(sd.id)) ? nSaldoBySd.get(sd.id)! : (sd?.nSaldo != null ? Number(sd.nSaldo) : null)
    const saldoUptresFb = (saldoUptresBySd && sd?.id && saldoUptresBySd.has(sd.id)) ? saldoUptresBySd.get(sd.id)! : (sd?.saldo != null ? Number(sd.saldo) : null)
    const ajusteManualFb = sd?.ajusteManual != null ? Number(sd.ajusteManual) : null
    return { ...p, _facturas, receivableAt: sd?.receivableAt ?? null, nSaldo: nSaldoFb, saldoUptres: saldoUptresFb, syncDeudaId: sd?.id ?? null, ajusteManual: ajusteManualFb, cliente: cli ? { id: cli.id, nombre: cli.nombre, nit: cli.nit, telefono: cli.telefono } : null }
  })
}
