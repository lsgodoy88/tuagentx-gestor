import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([])
  const user = session.user as any
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0]

  // Buscar impulsadoras del vendedor
  const impulsadoras = await prisma.empleado.findMany({
    where: { vendedorId: user.id, rol: 'impulsadora', activo: true }
  })

  if (impulsadoras.length === 0) return NextResponse.json([])

  const ids = impulsadoras.map(e => e.id)

  const visitas = await prisma.visita.findMany({
    where: {
      empleadoId: { in: ids },
      tipo: { in: ['entrada', 'salida'] },
      fechaBogota: {
        gte: new Date(fecha + 'T00:00:00'),
        lte: new Date(fecha + 'T23:59:59')
      }
    },
    include: { cliente: true, empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } },
    orderBy: { createdAt: 'asc' }
  })

  // Alertas GPS del dia por impulsadora
  const inicioFecha = new Date(fecha + 'T05:00:00.000Z')
  const finFecha = new Date(new Date(inicioFecha).getTime() + 86400000)
  const alertas = await prisma.auditLog.findMany({
    where: {
      empleadoId: { in: ids },
      accion: 'GPS_FUERA_RANGO',
      createdAt: { gte: inicioFecha, lt: finFecha }
    },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json({ visitas, impulsadoras, alertas })
}
