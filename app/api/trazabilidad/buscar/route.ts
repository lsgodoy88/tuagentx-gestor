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

  // Vendedor: filtro directo por su vendedorApiId
  let vendedorApiId: string | null = null
  if (esVendedor) {
    const empleado = await (prisma as any).empleado.findUnique({
      where: { id: user.id },
      select: { apiId: true }
    })
    vendedorApiId = empleado?.apiId || null
  }

  const SELECT = {
    id: true, numeroOrden: true, numeroFactura: true, vendedorApiId: true,
    clienteNombre: true, ciudad: true,
    estado: true, fechaOrden: true, fechaFactura: true, alistadoEl: true, entregadoEl: true,
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

  // Alcance por vinculaciones
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { bodegaPuedeEnviar: true }
  })
  const vinculaciones = await prisma.empresaVinculada.findMany({
    where: { empresaClienteId: empresaId, activa: true }
  })

  // FIX 2026-06-20: la orden vive bajo su propio empresaId real, no
  // origenVinculadaId (ya no se duplica por vinculación). Si esta empresa
  // (cliente) no tiene bodega propia, sus órdenes siguen viviendo bajo su
  // propio empresaId — no necesita filtrar por la vinculación en absoluto.
  let scopeWhere: any
  if (vinculaciones.length > 0 && !empresa?.bodegaPuedeEnviar) {
    scopeWhere = { empresaId }
  } else {
    scopeWhere = { empresaId, origenVinculadaId: null }
  }

  const whereDirecto: any = {
    ...scopeWhere,
    OR: [
      { numeroOrden: { contains: q, mode: 'insensitive' } },
      { numeroFactura: { contains: q, mode: 'insensitive' } },
      { clienteNombre: { contains: q, mode: 'insensitive' } },
      { clienteNit: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (esVendedor) {
    whereDirecto.vendedorApiId = vendedorApiId || '__ninguno__'
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
