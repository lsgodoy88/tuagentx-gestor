import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const coords = req.nextUrl.searchParams.get('coords')
  if (!coords) return NextResponse.json({ error: 'coords requerido' }, { status: 400 })

  try {
    const res = await fetch(
      `http://localhost:5000/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return NextResponse.json({ error: 'OSRM error' }, { status: 502 })
    const data = await res.json()

    // OSRM responde "Ok" aún para puntos fuera del dataset, pero con
    // distance:0 o sin geometry. Validar para que el frontend caiga al
    // fallback de línea recta en vez de pintar rutas truncadas/inválidas.
    const route = data?.routes?.[0]
    const hasValidGeometry = Array.isArray(route?.geometry?.coordinates) && route.geometry.coordinates.length >= 2
    const hasValidDistance = typeof route?.distance === 'number' && route.distance > 0

    if (!route || !hasValidGeometry || !hasValidDistance) {
      return NextResponse.json({ error: 'OSRM_OUT_OF_BOUNDS' }, { status: 503 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'OSRM no disponible' }, { status: 503 })
  }
}
