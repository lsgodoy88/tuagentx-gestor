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

  const keyBogota = (d: Date) => new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Visitas de órdenes de despacho del rol entregas — siempre incluir independiente de Ruta
  let visitasOrdenPorFecha: Record<string, any[]> = {}
  if (user.role === 'entregas') {
    const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const inicioDia = new Date(hoyBogota + 'T00:00:00-05:00')
    const finDia = new Date(hoyBogota + 'T23:59:59-05:00')
    const visitasOrdenes = await (prisma as any).visita.findMany({
      where: {
        empleadoId: user.id,
        tipo: 'entrega',
        ordenDespachoId: { not: null },
        fechaBogota: { gte: inicioDia, lte: finDia },
      },
      select: {
        id: true, tipo: true, lat: true, lng: true, createdAt: true,
        fechaBogota: true, clienteId: true, firma: true, ordenDespachoId: true,
        cliente: { select: { id: true, nombre: true, direccion: true, ciudad: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    for (const v of visitasOrdenes) {
      const key = keyBogota(new Date(v.fechaBogota))
      if (!visitasOrdenPorFecha[key]) visitasOrdenPorFecha[key] = []
      visitasOrdenPorFecha[key].push({ ...v, clienteNombre: v.cliente?.nombre })
    }
  }

  // Visitas por empleado+fecha — no depende de RutaCliente (pueden haberse limpiado)
  if (rutas.length > 0) {
    const fechas = rutas.map((r: any) => new Date(r.fecha).getTime())
    const minDate = new Date(Math.min(...fechas)); minDate.setHours(0, 0, 0, 0)
    const maxDate = new Date(Math.max(...fechas)); maxDate.setHours(23, 59, 59, 999)
    const visitas = await (prisma as any).visita.findMany({
      where: { empleadoId: user.id, fechaBogota: { gte: minDate, lte: maxDate } },
      select: { id: true, tipo: true, lat: true, lng: true, createdAt: true, fechaBogota: true, clienteId: true, firma: true, ordenDespachoId: true },
      orderBy: { createdAt: 'asc' },
      take: 3000
    })
    const visitasPorFecha: Record<string, any[]> = {}
    for (const v of visitas) {
      const key = keyBogota(new Date(v.fechaBogota))
      if (!visitasPorFecha[key]) visitasPorFecha[key] = []
      visitasPorFecha[key].push(v)
    }
    // Merge visitas de órdenes en el resultado
    const resultado = rutas.map((r: any) => {
      const key = keyBogota(new Date(r.fecha))
      const visitasRuta = visitasPorFecha[key] || []
      const visitasOrden = visitasOrdenPorFecha[key] || []
      // Agregar visitas de orden que no están ya por clienteId en visitasRuta
      const visitasOrdenNuevas = visitasOrden.filter((vo: any) =>
        !visitasRuta.some((vr: any) => vr.clienteId === vo.clienteId && vr.ordenDespachoId === vo.ordenDespachoId)
      )
      return { ...r, visitas: [...visitasRuta, ...visitasOrdenNuevas] }
    })
    // Si hay visitas de órdenes de hoy sin ruta correspondiente, agregar entrada sintética
    const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const tieneRutaHoy = rutas.some((r: any) => keyBogota(new Date(r.fecha)) === hoyBogota)
    if (!tieneRutaHoy && visitasOrdenPorFecha[hoyBogota]?.length > 0) {
      const vo = visitasOrdenPorFecha[hoyBogota]
      resultado.unshift({
        fecha: hoyBogota,
        clientes: [],
        visitas: vo,
      })
    }
    return NextResponse.json(resultado)
  }

  // Para rol entregas sin rutas: mostrar entrada sintética de hoy con visitas de órdenes
  if (user.role === 'entregas') {
    const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const inicioDia = new Date(hoyBogota + 'T00:00:00-05:00')
    const finDia = new Date(hoyBogota + 'T23:59:59-05:00')

    const visitasOrdenes = await (prisma as any).visita.findMany({
      where: {
        empleadoId: user.id,
        tipo: 'entrega',
        ordenDespachoId: { not: null },
        fechaBogota: { gte: inicioDia, lte: finDia },
      },
      select: {
        id: true, tipo: true, lat: true, lng: true, createdAt: true,
        fechaBogota: true, clienteId: true, firma: true, ordenDespachoId: true,
        cliente: { select: { id: true, nombre: true, direccion: true, ciudad: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (visitasOrdenes.length > 0) {
      // Agregar entrada de hoy con estas visitas si no existe ya
      const rutaHoy = rutas.find((r: any) => r.fecha?.split('T')[0] === hoyBogota)
      const visitasEntregadas = visitasOrdenes.map((v: any) => ({
        ...v,
        clienteNombre: v.cliente?.nombre,
      }))

      if (!rutaHoy) {
        // No hay Ruta para hoy — crear entrada sintética con las visitas de órdenes
        return NextResponse.json([
          ...rutas.map((r: any) => ({ ...r, visitas: [] })),
          {
            fecha: hoyBogota,
            clientes: visitasEntregadas.map((v: any) => ({
              clienteId: v.clienteId,
              notas: '',
              cliente: v.cliente,
            })),
            visitas: visitasEntregadas,
          }
        ])
      }
    }
  }

  return NextResponse.json(rutas.map((r: any) => ({ ...r, visitas: [] })))
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
