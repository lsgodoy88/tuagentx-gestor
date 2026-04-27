import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0]
  const rutaId = searchParams.get('rutaId') || null

  const isPrivileged = user.role === 'empresa' || user.role === 'supervisor' || user.role === 'admin'
  const empleadoId = isPrivileged ? (searchParams.get('empleadoId') || null) : user.id

  let visitas: any[] = []
  let empleados: any[] = []
  let rutaNombre: string | null = null

  if (rutaId) {
    const ruta = await prisma.ruta.findUnique({
      where: { id: rutaId },
      include: { empleados: true, clientes: true }
    })
    if (ruta) {
      rutaNombre = ruta.nombre
      const empIds = ruta.empleados.map((e: any) => e.empleadoId)
      const cliIds = ruta.clientes.map((c: any) => c.clienteId)
      const fechaRuta = ruta.fecha ? new Date(ruta.fecha) : new Date()
      const inicio = new Date(fechaRuta); inicio.setHours(0, 0, 0, 0)
      const fin = new Date(fechaRuta); fin.setHours(23, 59, 59, 999)
      visitas = await prisma.visita.findMany({
        where: {
          empleadoId: { in: empIds },
          clienteId: { in: cliIds },
          createdAt: { gte: inicio, lte: fin },
          lat: { not: null },
          lng: { not: null },
        },
        include: { empleado: { select: { id: true, nombre: true } }, cliente: { select: { id: true, nombre: true, nombreComercial: true } } },
        orderBy: { createdAt: 'asc' }
      })
      empleados = await prisma.empleado.findMany({ where: { id: { in: empIds } } })
    }
  } else {
    const inicio = new Date(fecha + 'T05:00:00.000Z')
    const fin = new Date(new Date(fecha + 'T05:00:00.000Z').getTime() + 24*60*60*1000 - 1)
    visitas = await prisma.visita.findMany({
      where: {
        empleado: { empresaId },
        createdAt: { gte: inicio, lte: fin },
        lat: { not: null },
        lng: { not: null },
        ...(empleadoId ? { empleadoId } : {})
      },
      include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } }, cliente: true },
      orderBy: { createdAt: 'asc' }
    })
    empleados = await prisma.empleado.findMany({ where: { empresaId, activo: true } })
  }

  return NextResponse.json({ visitas, empleados, rutaNombre })
}
