import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([])
  const user = session.user as any

  const rutasEmpleado = await prisma.rutaEmpleado.findMany({
    where: { empleadoId: user.id },
    include: {
      ruta: {
        include: {
          clientes: {
            select: { id: true, orden: true, rezago: true, clienteId: true, notas: true,
              cliente: { select: { id: true, nombre: true, direccion: true, ciudad: true, telefono: true, lat: true, lng: true, latTmp: true, lngTmp: true } } },
            orderBy: { orden: 'asc' }
          }
        }
      }
    },
    orderBy: { ruta: { createdAt: 'desc' } },
    take: 60
  })

  const rutas = rutasEmpleado.map((re: any) => re.ruta).filter((r: any) => r.fecha)

  // Visitas por empleado+fecha — no depende de RutaCliente (pueden haberse limpiado)
  if (rutas.length > 0) {
    const fechas = rutas.map((r: any) => new Date(r.fecha).getTime())
    const minDate = new Date(Math.min(...fechas)); minDate.setHours(0, 0, 0, 0)
    const maxDate = new Date(Math.max(...fechas)); maxDate.setHours(23, 59, 59, 999)
    const visitas = await (prisma as any).visita.findMany({
      where: { empleadoId: user.id, fechaBogota: { gte: minDate, lte: maxDate } },
      select: { id: true, tipo: true, lat: true, lng: true, createdAt: true, fechaBogota: true, clienteId: true, firma: true },
      orderBy: { createdAt: 'asc' },
      take: 3000
    })
    // Agrupar visitas por fecha Bogotá (UTC-5)
    const keyBogota = (d: Date) => new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
    const visitasPorFecha: Record<string, any[]> = {}
    for (const v of visitas) {
      const key = keyBogota(new Date(v.fechaBogota))
      if (!visitasPorFecha[key]) visitasPorFecha[key] = []
      visitasPorFecha[key].push(v)
    }
    return NextResponse.json(rutas.map((r: any) => {
      const key = keyBogota(new Date(r.fecha))
      return { ...r, visitas: visitasPorFecha[key] || [] }
    }))
  }

  return NextResponse.json(rutas.map((r: any) => ({ ...r, visitas: [] })))
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
