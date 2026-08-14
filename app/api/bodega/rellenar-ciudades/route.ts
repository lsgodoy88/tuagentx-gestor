import { NextResponse } from 'next/server'
import { rellenarCiudades } from '@/lib/bodega/rellenar-ciudades'

export async function POST(req: Request) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const result = await rellenarCiudades()
  return NextResponse.json(result)
}
