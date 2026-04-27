import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import https from 'https'

const UPTRES_URL = 'https://www.uptres.top'
const agent = new https.Agent({ rejectUnauthorized: false })

const ENDPOINT_DEFS = [
  { key: 'clientes',  path: '/clientes?desde=0&size=1' },
  { key: 'cartera',   path: '/ordenventa?desde=0&size=1' },
  { key: 'empleados', path: '/empleados?desde=0&size=1' },
  { key: 'ventas',    path: '/ordenesventa?desde=0&size=1' },
]

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const endpoints: Record<string, boolean> = {}
  const counts: Record<string, number> = {}

  for (const ep of ENDPOINT_DEFS) {
    try {
      const res = await fetch(`${UPTRES_URL}${ep.path}`, {
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
