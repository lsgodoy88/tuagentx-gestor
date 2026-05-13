import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor', 'superadmin', 'vendedor'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const empresaId = user.empresaId || user.id
  const q = req.nextUrl.searchParams.get('q')?.trim() || ''
  if (!q) return NextResponse.json({ ordenes: [], fuente: null })

  const esVendedor = user.role === 'vendedor'

  // Para vendedor: obtener sus NITs
  let nitsVendedor: string[] | null = null
  if (esVendedor) {
    const syncEmp = await (prisma as any).syncEmpleado.findFirst({
      where: { integracion: { empresaId }, nombre: { contains: user.name, mode: 'insensitive' } }
    })
    if (syncEmp) {
      const deudas = await (prisma as any).syncDeuda.findMany({
        where: { empleadoExternalId: syncEmp.externalId },
        select: { clienteApiId: true },
        distinct: ['clienteApiId']
      })
      const apiIds = deudas.map((d: any) => d.clienteApiId).filter(Boolean)
      const clientes = await prisma.cliente.findMany({
        where: { apiId: { in: apiIds }, empresaId },
        select: { nit: true }
      })
      nitsVendedor = clientes.map((c: any) => c.nit).filter(Boolean)
    } else {
      nitsVendedor = []
    }
  }

  const SELECT = {
    id: true, numeroOrden: true, clienteNombre: true, ciudad: true,
    estado: true, fechaOrden: true, alistadoEl: true, entregadoEl: true,
    fotosAlistamiento: true, firmaEntrega: true, repartidorId: true,
    alistadoPor: { select: { nombre: true } },
    repartidor: { select: { nombre: true } },
    visitas: {
      where: { tipo: 'entrega' },
      orderBy: { createdAt: 'asc' as const },
      take: 1,
      select: { id: true, firma: true, createdAt: true, empleado: { select: { nombre: true } } }
    }
  }

  // Calcular alcance por vinculaciones (igual que /api/trazabilidad)
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { bodegaPuedeEnviar: true }
  })
  const vinculaciones = await prisma.empresaVinculada.findMany({
    where: { empresaClienteId: empresaId, activa: true }
  })

  let scopeWhere: any
  if (vinculaciones.length > 0 && !empresa?.bodegaPuedeEnviar) {
    // Empresa cliente (tipo Leche): solo sus órdenes vinculadas en bodega de proveedor
    scopeWhere = { origenVinculadaId: { in: vinculaciones.map((v: any) => v.id) } }
  } else {
    // Empresa propia: solo órdenes propias no-vinculadas
    scopeWhere = { empresaId, origenVinculadaId: null }
  }

  // 1. Buscar en OrdenDespacho directamente (BD completa sin filtro fechas)
  const whereDirecto: any = {
    ...scopeWhere,
    OR: [
      { numeroOrden: { contains: q, mode: 'insensitive' } },
      { clienteNombre: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (nitsVendedor !== null) {
    whereDirecto.clienteNit = nitsVendedor.length > 0 ? { in: nitsVendedor } : '__ninguno__'
  }

  const ordenesDirectas = await prisma.ordenDespacho.findMany({
    where: whereDirecto,
    orderBy: { fechaOrden: 'desc' },
    take: 20,
    select: SELECT
  })

  return NextResponse.json({
    ordenes: ordenesDirectas,
    fuente: ordenesDirectas.length > 0 ? 'bd' : 'no_encontrado'
  })
}
