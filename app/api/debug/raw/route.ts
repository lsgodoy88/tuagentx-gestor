import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto-uptres'

export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const intg = await (prisma as any).integracion.findFirst({
    where: { id: 'intg-cmn7oiutk0001vmega46373b4-uptres2' },
    select: { config: true }
  })
  const config = intg.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const BASE = 'https://serviceuptres.cloud/external/v1/api'
  const AUTH_URL = 'https://serviceuptres.cloud/external/v1/auth/api'

  // Login
  const { token } = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: config.apiKey, apiSecret })
  }).then(r => r.json())

  const headers = { 'x-api-key': config.apiKey, 'Authorization': `Bearer ${token}` }

  // Traer 1 deuda condition=false sin filtro de fields — raw completo
  const r = await fetch(
    `${BASE}/cartera/empleado/67aa2066c7453ec02e6fe10e?condition=false&limit=1&includeTotal=false`,
    { headers }
  )
  const d = await r.json()
  const item = d.data?.[0] || d[0] || null

  return NextResponse.json({ raw: item, keys: item ? Object.keys(item) : [] })
}
