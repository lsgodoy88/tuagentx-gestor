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
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'OSRM no disponible' }, { status: 503 })
  }
}
