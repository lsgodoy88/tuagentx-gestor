import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import https from 'https'

const UPTRES_URL = 'https://www.uptres.top'
const UPTRES_API_URL = 'https://serviceuptres.cloud/external/v1'
const agent = new https.Agent({ rejectUnauthorized: false })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  const body = await req.json()
  const tipo: string = body.tipo ?? 'uptres'

  // ── UpTres 2 — apiKey + apiSecret ──
  if (tipo === 'uptres') {
    const { apiKey, apiSecret } = body
    if (!apiKey || !apiSecret) return NextResponse.json({ error: 'apiKey y apiSecret requeridos' }, { status: 400 })

    let token: string
    try {
      const loginRes = await fetch(`${UPTRES_API_URL}/auth/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, apiSecret }),
        // @ts-ignore
        agent,
      })
      const loginData = await loginRes.json()
      if (!loginData.ok || !loginData.token) {
        return NextResponse.json({ ok: false, error: loginData.message ?? 'Credenciales inválidas' })
      }
      token = loginData.token
    } catch {
      return NextResponse.json({ ok: false, error: 'No se pudo conectar con UpTres' })
    }

    const epDefs = [
      { key: 'clientes',  path: '/api/clientes?limit=1&condition=true' },
      { key: 'empleados', path: '/api/empleados?limit=1&condition=true' },
      { key: 'cartera',   path: '/api/cartera?limit=1&condition=true' },
      { key: 'ordenes',   path: '/api/ordenes?limit=1&condition=true&from=2026-01-01&to=2026-12-31' },
    ]
    const endpoints: Record<string, boolean> = {}
    const counts: Record<string, number> = {}

    for (const ep of epDefs) {
      try {
        const res = await fetch(`${UPTRES_API_URL}${ep.path}`, {
          // @ts-ignore
          agent,
          headers: { 'x-api-key': apiKey, 'Authorization': token },
        })
        const data = await res.json()
        if (data.ok) {
          endpoints[ep.key] = true
          counts[ep.key] = data.pagination?.totalItems ?? data.total ?? data.count ?? 1
        } else {
          endpoints[ep.key] = false
          counts[ep.key] = 0
        }
      } catch {
        endpoints[ep.key] = false
        counts[ep.key] = 0
      }
    }

    const activeCount = Object.values(endpoints).filter(Boolean).length
    return NextResponse.json({ ok: activeCount > 0, endpoints, counts, activeCount })
  }

  // ── UpTres v1 — token ──
  const { token } = body
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const epDefs = [
    { key: 'clientes',  path: '/clientes?desde=0&size=1' },
    { key: 'cartera',   path: '/ordenventa?desde=0&size=1' },
    { key: 'empleados', path: '/empleados?desde=0&size=1' },
    { key: 'ordenes',   path: '/ordenesventa?desde=0&size=1' },
  ]
  const endpoints: Record<string, boolean> = {}
  const counts: Record<string, number> = {}

  for (const ep of epDefs) {
    try {
      const res = await fetch(`${UPTRES_API_URL}${ep.path}`, {
        // @ts-ignore
        agent,
        headers: { 'x-token': token },
      })
      const data = await res.json()
      if (data.ok) {
        endpoints[ep.key] = true
        counts[ep.key] = data.pagination?.totalItems ?? data.total ?? 1
      } else {
        endpoints[ep.key] = false
        counts[ep.key] = 0
      }
    } catch {
      endpoints[ep.key] = false
      counts[ep.key] = 0
    }
  }

  const activeCount = Object.values(endpoints).filter(Boolean).length
  return NextResponse.json({ ok: activeCount > 0, endpoints, counts, activeCount })
}
