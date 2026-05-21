import { NextResponse } from 'next/server'
import { nowBogota, fechaHoyBogota, haceNDiasBogota, haceNMesesBogota, inicioDiaBogota, finDiaBogota, inicioMesBogota, inicioMesAnteriorBogota, mesBogota, anioBogota, mesAnteriorBogota, anioMesAnteriorBogota, esDelMesBogota, fmtFechaHora, fmtFechaMedia, fmtHora } from '@/lib/fechas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json(null)
  const user = session.user as any

  const hoy = nowBogota()
  const diaSemana = hoy.getDay()

  const rutaFija = await prisma.rutaFija.findFirst({
    where: {
      diaSemana,
      empleados: { some: { empleadoId: user.id } }
    },
    include: {
      clientes: {
        select: { id: true, clienteId: true, orden: true, metaVenta: true, cliente: { select: { id: true, nombre: true, nombreComercial: true, lat: true, lng: true, latTmp: true, lngTmp: true, ubicacionReal: true, direccion: true } } },
        orderBy: { orden: 'asc' }
      }
    }
  })

  if (!rutaFija) return NextResponse.json(null)

  const inicioHoy = inicioDiaBogota()
  inicioHoy.setHours(0, 0, 0, 0)
  const finHoy = finDiaBogota()
  finHoy.setHours(23, 59, 59, 999)

  const llegadasHoy = await prisma.visita.findMany({
    where: {
      empleadoId: user.id,
      tipo: { in: ['entrada', 'salida'] },
      createdAt: { gte: inicioHoy, lte: finHoy }
    },
    select: { id: true, tipo: true, rutaFijaClienteId: true, createdAt: true }
  })

  return NextResponse.json({ rutaFija, llegadasHoy })
}
