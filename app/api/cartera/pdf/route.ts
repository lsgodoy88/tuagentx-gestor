import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularDiasV, calcularEdadCartera } from '@/lib/cartera'
import { calcularNSaldoBatch } from '@/lib/cartera/calcularSaldo'
import { Prisma } from '@/app/generated/prisma'

const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const empresaId = getEmpresaId(user)

    const integracion = await (prisma as any).integracion.findFirst({
      where: { empresaId, tipo: 'uptres', activa: true }
    })
    if (!integracion) return NextResponse.json({ error: 'Sin integración' }, { status: 400 })

    let empleadoApiId: string | null = (user as any).apiId || null
    let empleadoNombre: string = user.name || ''

    if (!empleadoApiId && user.role === 'vendedor') {
      const emp = await (prisma as any).empleado.findUnique({
        where: { id: user.id },
        select: { apiId: true, nombre: true },
      })
      empleadoApiId = emp?.apiId || null
      if (emp?.nombre) empleadoNombre = emp.nombre
    }

    const { searchParams } = new URL(req.url)
    const vendedorApiIdParam = searchParams.get('vendedorApiId')
    if ((user.role === 'empresa' || user.role === 'supervisor') && vendedorApiIdParam) {
      empleadoApiId = vendedorApiIdParam
      const emp = await (prisma as any).empleado.findFirst({
        where: { apiId: vendedorApiIdParam, empresaId },
        select: { nombre: true },
      })
      if (emp?.nombre) empleadoNombre = emp.nombre
    }

    if (!empleadoApiId) return NextResponse.json({ error: 'Sin apiId de vendedor' }, { status: 400 })

    // 1. Deudas — igual que /edades, usando $queryRaw para nSaldoBase/nSaldoBaseAt/ajusteManual
    const deudas: any[] = await prisma.$queryRaw`
      SELECT sd.id, sd.valor, sd."numeroFactura", sd."numeroOrden", sd.saldo, sd."nSaldo",
             sd."nSaldoBase", sd."nSaldoBaseAt", sd."ajusteManual",
             sd."fechaVencimiento", sd."clienteApiId", sd."externalId", sd.data
      FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda" sd
      WHERE sd."integracionId" = ${integracion.id}
        AND sd."empleadoExternalId" = ${empleadoApiId}
        AND sd.condition = true
        AND sd."clienteApiId" IS NOT NULL
        AND sd.saldo::numeric > 0`

    if (deudas.length === 0) {
      const empresa = await (prisma as any).empresa.findUnique({ where: { id: empresaId }, select: { nombre: true } })
      return NextResponse.json({ empresa: empresa?.nombre || '', vendedor: empleadoNombre, generadoEn: new Date().toISOString(), filas: [], totalSaldo: 0 })
    }

    // 2. Aplicaciones de pago para calcular nSaldo real
    const deudaIds = deudas.map((d: any) => d.id)
    const aplicaciones: any[] = await prisma.$queryRaw`
      SELECT pcd."syncDeudaId", pcd."montoAplicado", pcd."createdAt"
      FROM ${Prisma.raw(DB_SCHEMA)}."PagoCarteraDeuda" pcd
      WHERE pcd."syncDeudaId" = ANY(${deudaIds})`

    // 3. nSaldo real — misma lógica que CPC y Cartera
    const nSaldos = calcularNSaldoBatch(deudas, aplicaciones)

    // 4. Datos de clientes — CarteraCache (nombre, teléfono, ciudad)
    const clienteIds = [...new Set(deudas.map((d: any) => d.clienteApiId).filter(Boolean))]
    const caches: any[] = clienteIds.length > 0
      ? await (prisma as any).carteraCache.findMany({
          where: { integracionId: integracion.id, clienteApiId: { in: clienteIds } },
          select: { clienteApiId: true, nombre: true, telefono: true, ciudad: true },
        })
      : []
    const clienteMap = new Map(caches.map((c: any) => [c.clienteApiId, c]))

    // 5. OrdenDespacho → dirección
    const externalIds = deudas.map((d: any) => d.externalId).filter(Boolean)
    const ordenes: any[] = externalIds.length > 0
      ? await (prisma as any).ordenDespacho.findMany({
          where: { origenId: { in: externalIds }, empresaId },
          select: { origenId: true, direccion: true },
        })
      : []
    const ordenMap = new Map(ordenes.map((o: any) => [o.origenId, o]))

    // 6. Cliente → fallback dirección
    const clientes: any[] = clienteIds.length > 0
      ? await (prisma as any).cliente.findMany({
          where: { apiId: { in: clienteIds }, empresaId },
          select: { apiId: true, nombre: true, telefono: true, ciudad: true, direccion: true },
        })
      : []
    const clienteFullMap = new Map(clientes.map((c: any) => [c.apiId, c]))

    const empresa = await (prisma as any).empresa.findUnique({ where: { id: empresaId }, select: { nombre: true } })

    // 7. Armar filas — solo nSaldo > 0
    const filas = deudas
      .map((d: any) => {
        const { nSaldo } = nSaldos[d.id] ?? { nSaldo: 0 }
        if (nSaldo <= 0) return null
        const c = clienteMap.get(d.clienteApiId)
        const o = ordenMap.get(d.externalId)
        const raw = d.data as any
        const fechaFactura = raw?.fCreado
          ? new Date(raw.fCreado).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
          : ''
        const venceDate = d.fechaVencimiento || (raw?.fPago ? new Date(raw.fPago) : null)
        const fechaVence = venceDate
          ? new Date(venceDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
          : ''
        const diasv = calcularDiasV(venceDate)
        const edadcartera = calcularEdadCartera(diasv)
        return {
          orden: d.numeroOrden ?? '',
          factura: d.numeroFactura ?? '',
          electronica: 0,
          fechaFactura,
          cliente: c?.nombre || clienteFullMap.get(d.clienteApiId)?.nombre || '',
          direccion: o?.direccion || clienteFullMap.get(d.clienteApiId)?.direccion || '',
          celular: c?.telefono || clienteFullMap.get(d.clienteApiId)?.telefono || '',
          ciudad: c?.ciudad || clienteFullMap.get(d.clienteApiId)?.ciudad || '',
          venta: Math.round(parseFloat(d.valor ?? raw?.vTotal ?? '0')),
          saldo: Math.round(nSaldo),
          fechaVence,
          diasv,
          edadcartera,
        }
      })
      .filter(Boolean)

    const totalSaldo = filas.reduce((s: number, f: any) => s + f.saldo, 0)

    return NextResponse.json({
      empresa: empresa?.nombre || '',
      vendedor: empleadoNombre,
      generadoEn: new Date().toISOString(),
      filas,
      totalSaldo,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
