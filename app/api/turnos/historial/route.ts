import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') || null
  const fechaFiltro = searchParams.get('fecha') || null // YYYY-MM-DD Bogotá

  let inicioWhere: any
  if (fechaFiltro) {
    // Día completo en Bogotá = UTC+5 (inicio 05:00 UTC del día, fin 05:00 UTC día siguiente)
    const desdeFecha = new Date(`${fechaFiltro}T05:00:00.000Z`)
    const hastaFecha = new Date(desdeFecha.getTime() + 24 * 60 * 60 * 1000)
    inicioWhere = { gte: desdeFecha, lt: hastaFecha }
  } else {
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    inicioWhere = { gte: desde }
  }

  const turnos = await prisma.turno.findMany({
    where: {
      empleadoId: user.id,
      activo: false,
      inicio: inicioWhere,
    },
    orderBy: { inicio: 'desc' },
    take: 50 + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = turnos.length > 50
  const page = hasMore ? turnos.slice(0, 50) : turnos
  const nextCursor = hasMore ? page[page.length - 1].id : null

  const data = page.map(t => {
    const inicio = new Date(t.inicio)
    const fin = t.fin ? new Date(t.fin) : null
    const duracionMs = fin ? fin.getTime() - inicio.getTime() : null
    const h = duracionMs ? Math.floor(duracionMs / 3600000) : null
    const m = duracionMs ? Math.floor((duracionMs % 3600000) / 60000) : null
    const fechaBogota = inicio.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) // YYYY-MM-DD en Bogotá
    return {
      id: t.id,
      fecha: fechaBogota,
      inicio: (t as any).inicioBogota || inicio.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }),
      fin: (t as any).finBogota || (fin ? fin.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : null),
      duracion: duracionMs ? `${h}h ${m}m` : null,
      pausaMotivo: t.pausaMotivo || null,
      pausaDuracionMin: t.pausaDuracionMin || null,
      tiempoEfectivo: duracionMs && t.pausaDuracionMin ? `${Math.floor((duracionMs - t.pausaDuracionMin*60000) / 3600000)}h ${Math.floor(((duracionMs - t.pausaDuracionMin*60000) % 3600000) / 60000)}m` : (duracionMs ? `${h}h ${m}m` : null),
      gpsInicio: t.latInicio ? `${t.latInicio.toFixed(5)},${t.lngInicio?.toFixed(5)}` : null,
      gpsFin: t.latFin ? `${t.latFin.toFixed(5)},${t.lngFin?.toFixed(5)}` : null,
      latInicio: t.latInicio,
      lngInicio: t.lngInicio,
      latFin: t.latFin,
      lngFin: t.lngFin,
    }
  })

  return NextResponse.json({ turnos: data, nextCursor, hasMore })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
