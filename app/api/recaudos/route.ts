import type { RecaudosResponse } from '@/lib/types/cartera'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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
  const cursor = searchParams.get('cursor') || null
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  // Sin paginación cuando hay filtro de mes o día — trae todo
  const limit = Math.min(500, parseInt(searchParams.get('limit') || '500'))
  const useCursor = !!cursor || searchParams.has('cursor') || (searchParams.has('limit') && !searchParams.has('page'))
  const skip = useCursor ? undefined : (page - 1) * limit

  const where: any = {
    OR: [
      { Cartera: { empresaId } },
      { AND: [{ carteraId: null }, { Empleado: { empresaId } }] },
    ],
  }

  if (empleadoIdForzado) where.empleadoId = empleadoIdForzado
  else if (vendedorId) where.empleadoId = vendedorId
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
    const syncDeudasCandidatas = await (prisma as any).syncDeuda.findMany({
      where: {
        Integracion: { empresaId },
        Aplicaciones: { some: { envioEstado: 'enviado' } },
      },
      select: { id: true, valor: true, saldo: true, Aplicaciones: { select: { montoAplicado: true, descuento: true, createdAt: true } } }
    })
    const diezDiasMs = 10 * 24 * 60 * 60 * 1000
    const sdIdsParaRevisar: string[] = []
    for (const sd of syncDeudasCandidatas) {
      const totalPagado = sd.Aplicaciones.reduce((acc: number, a: any) => acc + Number(a.montoAplicado || 0) + Number(a.descuento || 0), 0)
      const nSaldo = Math.max(0, Number(sd.valor) - totalPagado)
      const saldoUpTres = Number(sd.saldo)
      if (saldoUpTres === nSaldo) continue // ya coinciden, no hay anomalía
      const ultimoAbono = sd.Aplicaciones.reduce((max: number, a: any) => Math.max(max, new Date(a.createdAt).getTime()), 0)
      if (ultimoAbono === 0) continue
      if (Date.now() - ultimoAbono < diezDiasMs) continue // todavía dentro de ventana normal
      sdIdsParaRevisar.push(sd.id)
    }
    where.Aplicaciones = { some: { syncDeudaId: { in: sdIdsParaRevisar } } }
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
    const dataHidratada = await hidratarSync(data, empresaId)
    return NextResponse.json({ pagos: dataHidratada, nextCursor, hasMore })
  }

  const [pagos, total] = await Promise.all([
    prisma.pagoCartera.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include }),
    prisma.pagoCartera.count({ where }),
  ])
  const pagosHidratados = await hidratarSync(pagos, empresaId)
  return NextResponse.json({ pagos: pagosHidratados, total, page, pages: Math.ceil(total / limit) })
}

async function hidratarSync(pagos: any[], empresaId: string) {
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
      .map((a: any) => ({ numeroFactura: a.numeroFactura, montoAplicado: a.montoAplicado, descuento: a.descuento ?? null }))
    // Prioridad: datos congelados en PagoCartera
    if (p.clienteApiId) {
      const cli: any = cliMap.get(p.clienteApiId)
      if (cli) return { ...p, _facturas, cliente: { id: cli.id, nombre: cli.nombre, nit: cli.nit, telefono: cli.telefono } }
      // Sin cliente en BD pero con nombre congelado
      if (p.clienteNombre) return { ...p, _facturas, cliente: { nombre: p.clienteNombre } }
    }
    // Fallback pagos viejos
    const fa = firstApp.get(p.id)
    if (!fa) return { ...p, _facturas }
    const sd: any = sdMap.get(fa.syncDeudaId)
    const cli: any = sd ? cliMap.get(sd.clienteApiId) : null
    return { ...p, _facturas, cliente: cli ? { id: cli.id, nombre: cli.nombre, nit: cli.nit, telefono: cli.telefono } : null }
  })
}
