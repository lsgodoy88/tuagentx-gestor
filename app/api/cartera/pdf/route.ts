import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { calcularDiasV, calcularEdadCartera } from '@/lib/cartera'

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
      const emp = await (prisma as any).empleado.findUnique({ where: { id: user.id }, select: { apiId: true, nombre: true } })
      empleadoApiId = emp?.apiId || null
      if (emp?.nombre) empleadoNombre = emp.nombre
    }

    const { searchParams } = new URL(req.url)
    const vendedorApiIdParam = searchParams.get('vendedorApiId')
    if ((user.role === 'empresa' || user.role === 'supervisor') && vendedorApiIdParam) {
      empleadoApiId = vendedorApiIdParam
      const emp = await (prisma as any).empleado.findFirst({ where: { apiId: vendedorApiIdParam, empresaId }, select: { nombre: true } })
      if (emp?.nombre) empleadoNombre = emp.nombre
    }

    if (!empleadoApiId) return NextResponse.json({ error: 'Sin apiId de vendedor' }, { status: 400 })

    const deudas: any[] = await (prisma as any).syncDeuda.findMany({
      where: {
        integracionId: integracion.id,
        empleadoExternalId: empleadoApiId,
        condition: true,
        saldo: { gt: 0 },
      },
      select: {
        externalId: true,
        numeroOrden: true,
        numeroFactura: true,
        saldo: true,
        valor: true,
        fechaVencimiento: true,
        clienteApiId: true,
        data: true,
      },
      orderBy: { numeroOrden: 'desc' },
    })

    // CarteraCache → nombre, teléfono, ciudad
    const clienteIds = [...new Set(deudas.map((d: any) => d.clienteApiId).filter(Boolean))]
    const caches: any[] = clienteIds.length > 0
      ? await (prisma as any).carteraCache.findMany({
          where: { integracionId: integracion.id, clienteApiId: { in: clienteIds } },
          select: { clienteApiId: true, nombre: true, telefono: true, ciudad: true },
        })
      : []
    const clienteMap = new Map(caches.map((c: any) => [c.clienteApiId, c]))

    // OrdenDespacho → dirección por externalId (origenId)
    const externalIds = deudas.map((d: any) => d.externalId).filter(Boolean)
    const ordenes: any[] = externalIds.length > 0
      ? await (prisma as any).ordenDespacho.findMany({
          where: { origenId: { in: externalIds }, empresaId },
          select: { origenId: true, direccion: true },
        })
      : []
    const ordenMap = new Map(ordenes.map((o: any) => [o.origenId, o]))

    // Cliente → fallback dirección para órdenes sin OrdenDespacho
    const clienteApiIds = [...new Set(deudas.map((d: any) => d.clienteApiId).filter(Boolean))]
    const clientes: any[] = clienteApiIds.length > 0
      ? await (prisma as any).cliente.findMany({
          where: { apiId: { in: clienteApiIds }, empresaId },
          select: { apiId: true, direccion: true },
        })
      : []
    const clienteDireccionMap = new Map(clientes.map((c: any) => [c.apiId, c.direccion || '']))

    const empresa = await (prisma as any).empresa.findUnique({ where: { id: empresaId }, select: { nombre: true } })

    const filas = deudas.map((d: any) => {
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
        cliente: c?.nombre || '',
        direccion: o?.direccion || clienteDireccionMap.get(d.clienteApiId) || '',
        celular: c?.telefono || '',
        ciudad: c?.ciudad || '',
        venta: Math.round(parseFloat(d.valor ?? raw?.vTotal ?? '0')),
        saldo: Math.round(parseFloat(d.saldo ?? '0')),
        fechaVence,
        diasv,
        edadcartera,
      }
    })

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
