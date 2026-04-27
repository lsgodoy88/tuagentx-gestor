import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { expandirDireccion } from '@/lib/maps'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { clienteId } = await req.json()
  if (!clienteId) return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, direccion: true, ciudad: true, lat: true, lng: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  if (cliente.lat && cliente.lng) return NextResponse.json({ ok: true, cached: true })

  const mapsUrl = expandirDireccion(cliente.direccion, cliente.ciudad)
  if (!mapsUrl) return NextResponse.json({ ok: false, reason: 'sin dirección' })

  const queryMatch = mapsUrl.match(/\?q=(.+)$/)
  if (!queryMatch) return NextResponse.json({ ok: false, reason: 'dirección no parseable' })

  const query = decodeURIComponent(queryMatch[1])
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=co`,
      { headers: { 'User-Agent': 'TuAgentX/1.0' } }
    )
    const data = await res.json()
    if (data?.[0]?.lat && data?.[0]?.lon) {
      const latTmp = parseFloat(data[0].lat)
      const lngTmp = parseFloat(data[0].lon)
      await prisma.cliente.update({ where: { id: clienteId }, data: { latTmp, lngTmp } })
      return NextResponse.json({ ok: true, lat: latTmp, lng: lngTmp })
    }
  } catch {}
  return NextResponse.json({ ok: false, reason: 'no encontrado en Nominatim' })
}
